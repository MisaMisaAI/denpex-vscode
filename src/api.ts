import * as https from 'https';
import * as http from 'http';
import * as vscode from 'vscode';

export const DASHBOARD_URL = 'https://denpex.com/dashboard';
export const PRICING_URL = 'https://denpex.com/pricing';
export const REDEEM_URL = 'https://denpex.com/redeem';

export const MIN_LOG_CHARS = 6;       // terse machine events such as Xid 79 are valid
export const MAX_LOG_BYTES = 256000;  // server rejects larger logs (400)
// 300s, not 90s.
//
// The comment here read "diagnosis worker can take up to ~85s", which stopped
// being true when the deep tier gained a 290s deadline. The API worker itself
// waits 290s for the same call. So a hard question, exactly the kind someone
// opens an IDE extension for, was abandoned client-side at 90s and reported to
// the user as "Request timed out. Please try again with shorter logs", while the
// server went on to answer it successfully and bill the quota unit for it.
//
// Shorter logs was also the wrong advice: length is not why the deep tier is slow.
const REQUEST_TIMEOUT_MS = 300000;

export class ApiError extends Error {
    constructor(message: string, public status?: number, public code?: string) {
        super(message);
    }
}

export interface FixPayload {
    summary?: string;
    action?: string;
    evidence?: string[];
    causationChain?: string | null;       // JSON string (server caps at 1200 chars)
    competingHypotheses?: string | null;  // JSON string (server caps at 1200 chars)
    fallbackAction?: string | null;
    emergencyAction?: string | null;
    verificationCommand?: string | null;
    prevention?: string | null;
    steps?: string[];
    alternatives?: Array<{ failureType?: string; title?: string; confidence?: number; evidence?: string[] }>;
    clarifyingQuestions?: string[];
    inviteFollowup?: boolean;
    /**
     * Structured form of clarifyingQuestions.
     *
     * Only `kind: 'action'` questions may carry a recommended option. Recommending an
     * answer to a question of fact returns the hinted answer rather than the observed
     * one, and the next verdict is then built on something nobody saw.
     */
    clarifyingChoices?: Array<{
        id?: string;
        kind?: 'fact' | 'action';
        question?: string;
        options?: Array<{ id?: string; label?: string; detail?: string; recommended?: boolean }>;
        command?: string;
    }>;
    /**
     * The ONLY confidence a surface may render.
     *
     * `meta.confidence` is the raw score and includes bands measured to have
     * poor top-1 accuracy; the API calibrates it and returns null when the band
     * is not accurate enough to show a number at all. null therefore means
     * "withheld", never "zero", so it must not be coerced with `??` or `||`.
     * Rendering meta.confidence re-adds the band the calibration exists to hide.
     */
    confidenceDisplay?: number | null;
    /** Calibration band shown when a numeric confidence is withheld ("low"/"high"). */
    confidenceBand?: string | null;
    /** Checkpoint the engine believes is safe to resume from. */
    resumeFrom?: string | null;
}

/** One competing explanation the engine scored, with the evidence on both sides. */
export interface RankedHypothesis {
    key?: string;
    label?: string;
    confidence?: number;
    evidenceFor?: string[];
    evidenceAgainst?: string[];
}

export interface ControlArmReceipt {
    ruledOutCandidate: string;
    line: string;
    lineIndex: number;
    faultSurfaces: string[];
    workload: string;
    load: string;
    target: { node?: string; gpuUuid?: string; gpuIndex?: number; pciBusId?: string };
    controlTarget: { node?: string; gpuUuid?: string; gpuIndex?: number; pciBusId?: string };
    targetMatchBasis?: string;
    targetEvidence?: { line: string; lineIndex: number };
    unrelatedHardwareFindings: Array<{
        kind: 'damage' | 'active-surface';
        line: string;
        lineIndex: number;
        target: { node?: string; gpuUuid?: string; gpuIndex?: number; pciBusId?: string };
        faultSurfaces: string[];
    }>;
}

export interface DiagnoseResponse {
    success: boolean;
    /** Surface identity emitted by the bundled engine (for example canonical-offline). */
    source?: string;
    /** Traceable diagnosis-engine build stamp. */
    engineVersion?: string;
    diagnosisId?: string;
    jobName?: string;
    remaining?: number;
    cost?: unknown;
    costHeadline?: string | null;
    advanced?: {
        cascade?: unknown;
        versionAdvisory?: { summary?: string; severity?: string; action?: string };
        detectors?: Array<{ id?: string; title?: string; severity?: string; summary?: string; action?: string }>;
        predictive?: { score?: number; level?: string; signals?: string[] };
    };
    priorIncident?: { note?: string; action?: string } | null;
    researchRefs?: Array<{ title?: string; url?: string; source?: string; year?: number }>;
    communityRefs?: Array<{ title?: string; url?: string; source?: string }>;
    forensicReport?: Record<string, any>;
    advisory?: Array<{ summary?: string; severity?: string; action?: string }>;
    executionPlan?: { actions?: Array<{ action?: string; command?: string; reason?: string }> };
    fix?: FixPayload;
    meta?: { failureType?: string; confidence?: number; source?: string; tier?: number };

    // ── The honesty trail (WO-3.6) ──
    // Why the engine rejected the obvious answer, what it found that is real but not
    // causal, and how it ranked the competing explanations. Without these the panel
    // shows a verdict; with them it shows a diagnosis an engineer can audit.
    /** Hypotheses the evidence ruled out, and why. */
    contradictions?: string[];
    /** Competing explanations with evidence for and against each. */
    rankedHypotheses?: RankedHypothesis[];
    /** Real hardware finding that is NOT the root cause, stops misdirected RMAs. */
    secondaryHardwareNote?: string | null;
    /** Device-level candidate rejected by the measured software control. */
    ruledOutFailureType?: string | null;
    /** Target and evidence receipt for the measured software control. */
    controlArmReceipt?: ControlArmReceipt | null;
    /** Where the failure was *detected* differs from where it *originated*. */
    originNote?: string | null;

    // ── Checkpoint resume safety ──
    /**
     * A reason NOT to resume from the last checkpoint (e.g. it may be corrupt).
     * The panel renders a "Restart from Checkpoint" button, so this must be shown
     * next to it, a one-click resume onto a poisoned checkpoint destroys the run.
     */
    resumeSafetyNote?: string | null;
    /** Checkpoint the engine believes is safe to resume from. */
    resumeFrom?: string | null;
    /** Calibration band shown when a numeric confidence is withheld. */
    confidenceBand?: string | null;
}

export interface QuotaResponse {
    plan?: string;
    /** Remaining diagnoses today; null = unlimited (paid plans serialize Infinity as null). */
    remaining?: number | null;
    allowed?: boolean;
}

// Raw wire shapes (see api-worker: /api/diagnose/quota and /api/redeem/status).
interface QuotaWire { quota?: { allowed?: boolean; remaining?: number | null }; plan?: string }
interface RedeemStatusWire { has_trial?: boolean; trial?: { plan?: string; expires_at?: number; days_remaining?: number } | null; base_plan?: string }

function config() {
    return vscode.workspace.getConfiguration('denpex');
}

const API_KEY_SECRET = 'denpex.apiKey';
let apiKeyCache: string | undefined;

function trimmedKey(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
}

async function clearLegacyApiKeySetting(): Promise<void> {
    const cfg = config();
    const inspection = cfg.inspect<string>('apiKey');
    if (!inspection) return;
    const targets: Array<[vscode.ConfigurationTarget, unknown]> = [
        [vscode.ConfigurationTarget.Global, inspection.globalValue],
        [vscode.ConfigurationTarget.Workspace, inspection.workspaceValue],
        [vscode.ConfigurationTarget.WorkspaceFolder, inspection.workspaceFolderValue],
    ];
    for (const [target, value] of targets) {
        if (value !== undefined) await cfg.update('apiKey', undefined, target);
    }
}

/**
 * Load the cloud key from VS Code's encrypted credential store. Older releases
 * advertised `denpex.apiKey` as a normal setting, so migrate that plaintext value
 * once and clear every scope only after SecretStorage accepts it.
 */
export async function initializeApiKey(secrets: vscode.SecretStorage): Promise<void> {
    const stored = trimmedKey(await secrets.get(API_KEY_SECRET));
    const inspection = config().inspect<string>('apiKey');
    const legacy = trimmedKey(inspection?.workspaceFolderValue)
        || trimmedKey(inspection?.workspaceValue)
        || trimmedKey(inspection?.globalValue);

    let resolved = stored;
    if (!resolved && legacy) {
        await secrets.store(API_KEY_SECRET, legacy);
        resolved = legacy;
    }
    apiKeyCache = resolved;
    if (legacy) await clearLegacyApiKeySetting();
}

export async function storeApiKey(secrets: vscode.SecretStorage, value: string): Promise<void> {
    const key = trimmedKey(value);
    if (key) await secrets.store(API_KEY_SECRET, key);
    else await secrets.delete(API_KEY_SECRET);
    apiKeyCache = key;
    await clearLegacyApiKeySetting();
}

export function apiBase(): string {
    const raw = (config().get<string>('apiBase') || 'https://api.denpex.com').trim();
    return raw.replace(/\/+$/, '');
}

export function apiKey(): string | undefined {
    return apiKeyCache;
}

let sessionCookie: string | undefined;

function request<T>(method: 'GET' | 'POST', path: string, body?: unknown, token?: vscode.CancellationToken): Promise<T> {
    return new Promise((resolve, reject) => {
        let url: URL;
        try {
            url = new URL(apiBase() + path);
        } catch {
            reject(new ApiError(`Invalid Denpex API base URL: ${apiBase()}, fix the "denpex.apiBase" setting.`));
            return;
        }
        const payload = body === undefined ? undefined : JSON.stringify(body);
        const headers: Record<string, string | number> = {
            'Content-Type': 'application/json',
            'User-Agent': 'Denpex-VSCode/1.4.0',
        };
        if (sessionCookie) headers['Cookie'] = sessionCookie;
        if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
        const key = apiKey();
        if (key) headers['X-Denpex-Key'] = key;

        const lib = url.protocol === 'http:' ? http : https;
        const req = lib.request({
            hostname: url.hostname,
            port: url.port || undefined,
            path: url.pathname + url.search,
            method,
            headers,
            timeout: REQUEST_TIMEOUT_MS,
        }, (res) => {
            const setCookie = res.headers['set-cookie'];
            if (setCookie) {
                sessionCookie = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie;
            }
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                let parsed: any;
                try {
                    parsed = JSON.parse(data);
                } catch {
                    reject(new ApiError(`Unexpected response from Denpex (HTTP ${res.statusCode ?? '?'}).`, res.statusCode));
                    return;
                }
                if (res.statusCode && res.statusCode >= 400) {
                    reject(new ApiError(parsed.guidance || parsed.error || `Server returned HTTP ${res.statusCode}`, res.statusCode, parsed.code));
                } else {
                    resolve(parsed as T);
                }
            });
        });

        token?.onCancellationRequested(() => req.destroy(new Error('Cancelled')));
        req.on('timeout', () => req.destroy(new ApiError(
            'The diagnosis provider did not respond within five minutes. Retry later; shortening the log does not fix a provider timeout.',
        )));
        req.on('error', (e) => reject(e instanceof ApiError ? e : new ApiError(String((e as Error).message || e))));

        if (payload) req.write(payload);
        req.end();
    });
}

export function diagnose(
    logs: string,
    jobName: string,
    token: vscode.CancellationToken,
    topologyMap?: Record<string, string[]>,
): Promise<DiagnoseResponse> {
    // Keyless users go to the ANONYMOUS endpoint.
    //
    // This always posted to /api/diagnose, which requires a key, so the
    // extension's advertised no-key mode returned 401 to every user who had not
    // configured `denpex.apiKey`, on their first ever use of it. Same defect the
    // GitHub Action shipped with, on a different surface: the authenticated path
    // is the one that gets tested, because whoever tests it has a key.
    //
    // The anonymous endpoint runs the SAME engine at the same strength. The first
    // no-key diagnosis is frictionless; later new diagnoses need the browser
    // challenge on denpex.com or an API key.
    const endpoint = apiKey() ? '/api/diagnose' : '/api/diagnose/anon';
    return request<DiagnoseResponse>('POST', endpoint, {
        logs,
        jobName, ...(topologyMap && Object.keys(topologyMap).length > 1 ? { topologyMap } : {}),
    }, token);
}

export async function quota(): Promise<QuotaResponse> {
    // Wire shape is nested ({ quota: { allowed, remaining }, plan }) and paid plans
    // serialize `remaining: Infinity` as null, normalize to a flat shape here.
    const raw = await request<QuotaWire>('GET', '/api/diagnose/quota');
    const remaining = raw.quota?.remaining;
    return {
        plan: raw.plan,
        allowed: raw.quota?.allowed,
        remaining: typeof remaining === 'number' && isFinite(remaining) ? remaining : null,
    };
}

export function redeem(code: string): Promise<{ success?: boolean; plan?: string; days_remaining?: number; error?: string }> {
    return request('POST', `/api/redeem?code=${encodeURIComponent(code)}`);
}

export async function redeemStatus(): Promise<{ active: boolean; plan?: string; days_remaining?: number }> {
    const raw = await request<RedeemStatusWire>('GET', '/api/redeem/status');
    return {
        active: !!raw.has_trial,
        plan: raw.trial?.plan ?? raw.base_plan,
        days_remaining: raw.trial?.days_remaining,
    };
}
