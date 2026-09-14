import * as vscode from 'vscode';
import { apiBase, apiKey, storeApiKey } from './api';
import * as https from 'https';
import * as http from 'http';

const CONSUMER_DOMAINS = new Set([
    'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com',
    'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.com', 'msn.com',
    'aol.com', 'icloud.com', 'me.com', 'mac.com', 'protonmail.com', 'proton.me',
    'gmx.com', 'web.de', 'mail.com', 'zoho.com', 'yandex.com', 'qq.com',
    '163.com', 'naver.com', 'fastmail.com', 'tutanota.com', 'duck.com',
]);

const ANONYMOUS_CLOUD_KEY = 'denpex.anonymousCloudCount';
const MAX_FREE_ANONYMOUS_CLOUD = 3;

export function getRemainingFreeCloudDiagnoses(context: vscode.ExtensionContext): number {
    if (apiKey()) return 50; // Active API key has plan quota
    const used = context.globalState.get<number>(ANONYMOUS_CLOUD_KEY, 0);
    return Math.max(0, MAX_FREE_ANONYMOUS_CLOUD - used);
}

export async function consumeFreeCloudDiagnosis(context: vscode.ExtensionContext): Promise<number> {
    const current = context.globalState.get<number>(ANONYMOUS_CLOUD_KEY, 0);
    const next = current + 1;
    await context.globalState.update(ANONYMOUS_CLOUD_KEY, next);
    return Math.max(0, MAX_FREE_ANONYMOUS_CLOUD - next);
}

export function isConsumerDomain(email: string): boolean {
    const domain = email.split('@').pop()?.trim().toLowerCase() ?? '';
    return CONSUMER_DOMAINS.has(domain);
}

function postJson(urlStr: string, body: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: any }> {
    return new Promise((resolve, reject) => {
        const url = new URL(urlStr);
        const payload = JSON.stringify(body);
        const lib = url.protocol === 'http:' ? http : https;
        const req = lib.request({
            hostname: url.hostname,
            port: url.port || undefined,
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
            },
            timeout: 15000,
        }, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ ok: (res.statusCode || 500) < 400, status: res.statusCode || 500, data: parsed });
                } catch {
                    resolve({ ok: false, status: res.statusCode || 500, data: { message: data } });
                }
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

export async function startInEditorTrialFlow(context: vscode.ExtensionContext): Promise<boolean> {
    if (apiKey()) {
        void vscode.window.showInformationMessage('Denpex: You already have an active API key installed.');
        return true;
    }

    const email = await vscode.window.showInputBox({
        title: 'Denpex Scale 30-Day Evaluation',
        prompt: 'Enter your work email to activate 30 days of Scale (50 deep diagnoses/day, multi-node and fleet reasoning):',
        placeHolder: 'alex@yourcompany.com',
        ignoreFocusOut: true,
        validateInput: (val) => {
            const trimmed = val.trim();
            if (!trimmed || !trimmed.includes('@') || !trimmed.includes('.')) {
                return 'Enter a valid email address (e.g. name@company.com)';
            }
            if (isConsumerDomain(trimmed)) {
                return 'Scale evaluations require a work email domain (e.g. @company.com, not @gmail.com)';
            }
            return null;
        },
    });

    if (!email) return false;

    const endpoint = `${apiBase()}/api/trial/request`;
    let res: { ok: boolean; status: number; data: any };
    try {
        res = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Requesting Denpex Scale evaluation...',
            cancellable: false,
        }, async () => postJson(endpoint, { email: email.trim(), source: 'vscode-extension' }));
    } catch (err: any) {
        void vscode.window.showErrorMessage(`Denpex: could not request evaluation (${err?.message || 'network error'})`);
        return false;
    }

    if (!res.ok) {
        const msg = res.data?.message || res.data?.error || `Request failed (HTTP ${res.status})`;
        void vscode.window.showErrorMessage(`Denpex: ${msg}`);
        return false;
    }

    const code = await vscode.window.showInputBox({
        title: 'Enter Trial Code or API Key',
        prompt: `A single-use code was emailed to ${email.trim()}. Paste your code or your API key:`,
        placeHolder: 'DPXW-... or dpx_...',
        ignoreFocusOut: true,
    });

    if (!code) return false;
    const trimmedCode = code.trim();

    if (trimmedCode.startsWith('dpx_')) {
        await storeApiKey(context.secrets, trimmedCode);
        void vscode.window.showInformationMessage('Denpex: Scale API key saved. 50 diagnoses/day enabled.');
        return true;
    }

    // Save the trial redemption marker in secrets
    await context.secrets.store('denpex.trialCode', trimmedCode);
    void vscode.window.showInformationMessage(
        `Denpex: Trial code ${trimmedCode} received. Sign in at denpex.com/redeem?code=${encodeURIComponent(trimmedCode)} to link your team dashboard.`,
        'Open Redeem Page',
    ).then((choice) => {
        if (choice === 'Open Redeem Page') {
            void vscode.env.openExternal(vscode.Uri.parse(`https://denpex.com/redeem?code=${encodeURIComponent(trimmedCode)}`));
        }
    });

    return true;
}
