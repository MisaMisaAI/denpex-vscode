import * as vscode from 'vscode';
import {
    ApiError, DiagnoseResponse, MAX_LOG_BYTES, MIN_LOG_CHARS,
    DASHBOARD_URL, PRICING_URL, REDEEM_URL,
    apiKey, diagnose, initializeApiKey, quota, redeem, redeemStatus, storeApiKey,
} from './api';
import { generateIncidentMarkdown, showDiagnosisPanel } from './panel';
import { PredictiveMonitor } from './predictive';
import { runGenerateRmaCommand } from './rma';
import { diagnoseLocally, initLocalEngine, localEngineAvailable, LocalEngineError } from './local-engine';
import { SAMPLE_FAILURES, sampleFailure } from './samples';
import { DenpexSidebarProvider } from './sidebar';
import { selectEvidenceForRequest } from './evidence';
import { DenpexTerminalLinkProvider } from './terminal-links';
import {
    consumeFreeCloudDiagnosis, getRemainingFreeCloudDiagnoses, startInEditorTrialFlow,
} from './trial-flow';

let monitor: PredictiveMonitor | undefined;
let statusItem: vscode.StatusBarItem | undefined;
let lastDiagnosis: DiagnoseResponse | undefined;
let lastLogs: string | undefined;
let remediationTerminal: vscode.Terminal | undefined;
let sidebarProvider: DenpexSidebarProvider | undefined;
let extContext: vscode.ExtensionContext | undefined;
const FIRST_RUN_AHA_KEY = 'denpex.firstRunAha.v1';

export async function activate(context: vscode.ExtensionContext) {
    extContext = context;
    try {
        await initializeApiKey(context.secrets);
    } catch {
        // Local diagnosis must remain available even when the OS credential store
        // is unavailable. Never fall back to a plaintext setting.
        void vscode.window.showWarningMessage(
            'Denpex could not access VS Code SecretStorage. Local diagnosis remains available, but cloud features are disabled until secure credential storage is available.',
        );
    }
    // Resolve the bundled offline engine before anything can ask for it. This is what
    // makes the extension useful with no account and no network; see local-engine.ts.
    initLocalEngine(context);

    sidebarProvider = new DenpexSidebarProvider(context);
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('denpex.sidebar', sidebarProvider),
    );

    // ── Predictive pre-crash detection (terminal shell integration) ──
    monitor = new PredictiveMonitor((logs, terminalName) => {
        void runDiagnosis(logs, `pre-crash: ${terminalName}`);
    });
    monitor.start();
    context.subscriptions.push(monitor);

    // ── Status bar: plan + remaining quota ──
    statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
    statusItem.text = '$(pulse) Denpex';
    statusItem.tooltip = 'Denpex ML Diagnostics, click for menu';
    statusItem.command = 'denpex.showStatusBarMenu';
    statusItem.show();
    context.subscriptions.push(statusItem);
    void refreshStatusBar();

    const register = (id: string, fn: (...args: any[]) => any) =>
        context.subscriptions.push(vscode.commands.registerCommand(id, fn));

    const diagnoseCollectedLogs = async () => {
        const logs = await collectLogs();
        if (!logs) return;
        await runDiagnosis(logs.text, 'local-ide-run', logs.topologyMap);
    };

    register('denpex.diagnoseCurrentLogs', diagnoseCollectedLogs);

    register('denpex.diagnoseClipboard', async () => {
        const text = (await vscode.env.clipboard.readText()).trim();
        if (text.length < MIN_LOG_CHARS) {
            void vscode.window.showInformationMessage('Denpex: Clipboard is empty or contains fewer than 6 characters. Copy your error or traceback first.');
            return;
        }
        await runDiagnosis(text, 'clipboard');
    });

    register('denpex.scanClusterLogs', async () => {
        const files = await vscode.workspace.findFiles('**/{slurm-*.out,slurm-*.err,*.log,*.out}', '**/node_modules/**', 25);
        if (!files.length) {
            void vscode.window.showInformationMessage('Denpex: No recent slurm-*.out or log files found in the current workspace.');
            return;
        }
        const picked = await vscode.window.showQuickPick(
            files.map((uri) => ({
                label: uri.path.split('/').pop() || uri.fsPath,
                description: vscode.workspace.asRelativePath(uri),
                uri,
            })),
            { placeHolder: 'Select a cluster/Slurm log file to diagnose:' },
        );
        if (picked) {
            const doc = await vscode.workspace.openTextDocument(picked.uri);
            await runDiagnosis(doc.getText(), `cluster:${picked.label}`);
        }
    });

    register('denpex.showStatusBarMenu', async () => {
        const remaining = extContext ? getRemainingFreeCloudDiagnoses(extContext) : 0;
        const hasKey = Boolean(apiKey());
        const cloudLabel = hasKey ? 'Plan Quota Active' : `${remaining} free passes remaining`;

        const picked = await vscode.window.showQuickPick([
            { label: '$(clippy) Paste & Diagnose Clipboard', description: 'Ctrl+Alt+D / Cmd+Alt+D', cmd: 'denpex.diagnoseClipboard' },
            { label: '$(terminal) Diagnose Terminal Error', description: 'Diagnose latest terminal traceback', cmd: 'denpex.diagnoseTerminal' },
            { label: '$(search) Scan Workspace for Slurm/Cluster Logs', description: 'Find slurm-*.out and GPU error logs', cmd: 'denpex.scanClusterLogs' },
            { label: '$(cloud) Run Cloud Deep Reasoning', description: cloudLabel, cmd: 'denpex.diagnoseCloud' },
            { label: '$(beaker) Try a Demo Failure', description: 'NCCL OOM cascade, Xid 79, vLLM cache', cmd: 'denpex.runSample' },
            { label: '$(rocket) Unlock 30-Day Scale Trial', description: '50 cloud diagnoses/day for your team', cmd: 'denpex.startInEditorTrial' },
        ], { placeHolder: 'Denpex GPU & ML Crash Diagnostics' });

        if (picked && picked.cmd) {
            await vscode.commands.executeCommand(picked.cmd);
        }
    });

    register('denpex.diagnoseCloud', async () => {
        // Escalate the log that was just diagnosed locally. Requiring a prior diagnosis
        // keeps the mental model straight: local answers first, cloud deepens it.
        if (!lastLogs) {
            vscode.window.showInformationMessage(
                'Run Denpex: Diagnose Terminal Error first, then deep reasoning can build on that result.',
            );
            return;
        }
        await escalateToCloud(lastLogs, 'cloud-escalation');
    });

    register('denpex.diagnoseTerminal', diagnoseCollectedLogs);

    register('denpex.diagnoseSelection', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.selection.isEmpty) {
            vscode.window.showInformationMessage('Select the traceback or GPU/ML error you want Denpex to diagnose.');
            return;
        }
        await runDiagnosis(editor.document.getText(editor.selection), 'editor-selection');
    });

    register('denpex.diagnoseCurrentEditor', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('Open a .log.out, or traceback, then run this action again.');
            return;
        }
        const text = editor.selection.isEmpty
            ? editor.document.getText()
            : editor.document.getText(editor.selection);
        await runDiagnosis(text, `editor:${editor.document.fileName.split(/[\\/]/).pop() || 'log'}`);
    });

    register('denpex.diagnoseLastFailure', async () => {
        const coalesced = coalesceTerminalBuffers();
        if (coalesced) {
            await runDiagnosis(coalesced.text, 'terminal-context-last-failure', coalesced.topologyMap);
            return;
        }
        vscode.window.showInformationMessage(
            'Denpex has not captured terminal output yet. Run the failing command in a VS Code terminal, or select its traceback in the editor.',
        );
    });

    register('denpex.diagnoseAllTerminals', async () => {
        const coalesced = coalesceTerminalBuffers();
        if (!coalesced) {
            vscode.window.showInformationMessage(
                'Denpex: no terminal output captured yet. Run your training command in a VS Code terminal (shell integration required), then try again.');
            return;
        }
        await runDiagnosis(coalesced.text, 'multi-node-run', coalesced.topologyMap);
    });

    const runSampleById = async (id: string) => {
        const sample = sampleFailure(id);
        if (!sample) {
            vscode.window.showErrorMessage(`Denpex sample "${id}" is not available in this build.`);
            return;
        }
        if (localEngineAvailable()) {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Diagnosing sample "${sample.title}" locally...`,
                cancellable: true,
            }, async (_p, token) => {
                try {
                    const result = await diagnoseLocally(sample.logs, `sample:${sample.id}`, token);
                    lastDiagnosis = result;
                    lastLogs = sample.logs;
                    openPanel(result);
                    void sidebarProvider?.recordLocal(result);
                    void refreshStatusBar();
                } catch (err: any) {
                    vscode.window.showErrorMessage(`Denpex sample diagnosis failed: ${err?.message || err}`);
                }
            });
            return;
        }
        await runDiagnosis(sample.logs, `sample:${sample.id}`);
    };

    register('denpex.runSample', async (id?: string) => {
        if (id) {
            await runSampleById(id);
            return;
        }
        const picked = await vscode.window.showQuickPick(
            SAMPLE_FAILURES.map((sample) => ({
                label: sample.title,
                description: sample.description,
                id: sample.id,
            })),
            { placeHolder: 'Choose a realistic failure to diagnose locally' },
        );
        if (picked) await runSampleById(picked.id);
    });
    register('denpex.sample.ncclOom', () => runSampleById('nccl-rank-oom'));
    register('denpex.sample.xid79', () => runSampleById('xid-79'));
    register('denpex.sample.interfaceMismatch', () => runSampleById('nccl-interface-mismatch'));
    register('denpex.sample.kubernetesPlugin', () => runSampleById('kubernetes-device-plugin'));
    register('denpex.sample.vllmKvCache', () => runSampleById('vllm-kv-cache'));

    register('denpex.walkthrough.inspectCausality', async () => {
        if (!lastDiagnosis) await runSampleById('nccl-rank-oom');
        if (lastDiagnosis) openPanel(lastDiagnosis, 'causal-chain');
    });
    register('denpex.walkthrough.inspectFix', async () => {
        if (!lastDiagnosis) await runSampleById('nccl-rank-oom');
        if (lastDiagnosis) openPanel(lastDiagnosis, 'recommended-actions');
    });
    register('denpex.showPrivacyStatus', async () => {
        const choice = await vscode.window.showInformationMessage(
            localEngineAvailable()
                ? 'Denpex local diagnosis is ready: unlimited, offline, and account-free. Logs leave this machine only when you explicitly choose cloud deep reasoning.'
                : 'This build is missing the bundled local engine. Do not diagnose sensitive logs until you install a complete Marketplace build.',
            'Open Privacy Policy',
        );
        if (choice) vscode.env.openExternal(vscode.Uri.parse('https://denpex.com/privacy'));
    });
    context.subscriptions.push(
        vscode.window.registerTerminalLinkProvider(
            new DenpexTerminalLinkProvider((_t, lineText) => {
                if (lineText && lineText.trim().length >= MIN_LOG_CHARS) {
                    void runDiagnosis(lineText.trim(), 'terminal-link');
                } else {
                    void diagnoseCollectedLogs();
                }
            }),
        ),
    );

    register('denpex.startInEditorTrial', async () => {
        if (extContext) await startInEditorTrialFlow(extContext);
    });
    register('denpex.copyIncidentReport', async () => {
        if (lastDiagnosis) {
            const md = generateIncidentMarkdown(lastDiagnosis);
            await vscode.env.clipboard.writeText(md);
            void vscode.window.showInformationMessage('Denpex: Copied incident post-mortem for Slack / PR to clipboard.');
        } else {
            void vscode.window.showInformationMessage('No active diagnosis to copy. Run a diagnosis first.');
        }
    });
    register('denpex.startTrial', () => vscode.env.openExternal(vscode.Uri.parse(
        `${PRICING_URL}?source=vscode-extension&utm_source=vscode&utm_medium=extension&utm_campaign=first_diagnosis#trial`,
    )));
    register('denpex.openRecent', (id: string) => {
        const recent = sidebarProvider?.openRecent(id);
        if (recent) {
            openPanel(recent);
        } else {
            vscode.window.showInformationMessage(
                'Denpex kept only privacy-safe metadata for this older diagnosis. Run the log again to recreate the report.',
            );
        }
    });

    register('denpex.setApiKey', async () => {
        const entered = await vscode.window.showInputBox({
            prompt: 'Paste your Denpex API key (dpx_...), create one at denpex.com/dashboard',
            placeHolder: 'dpx_...',
            ignoreFocusOut: true,
            password: true,
            value: apiKey() || '',
        });
        if (entered === undefined) return;
        try {
            await storeApiKey(context.secrets, entered);
        } catch {
            vscode.window.showErrorMessage(
                'Denpex could not save the API key securely. The key was not stored; local diagnosis is still available.',
            );
            return;
        }
        if (!entered.trim()) {
            vscode.window.showInformationMessage('Denpex: API key cleared.');
            return;
        }
        try {
            const q = await quota();
            vscode.window.showInformationMessage(
                `Denpex: key verified, ${q.plan || 'free'} plan${typeof q.remaining === 'number' && isFinite(q.remaining) ? `, ${q.remaining} diagnoses left today` : ', unlimited diagnoses'}.`);
        } catch (err: any) {
            vscode.window.showWarningMessage(`Denpex: key saved but could not be verified (${err.message}).`);
        }
        void refreshStatusBar();
    });

    register('denpex.redeemCode', async () => {
        const code = await vscode.window.showInputBox({
            prompt: 'Enter your Denpex trial code (e.g. DPX-XXXX-XXXX)',
            placeHolder: 'DPX-...',
            ignoreFocusOut: true,
        });
        if (!code) return;
        if (!apiKey()) {
            // Redeeming requires an authenticated account; without a key the site flow
            // (login → redeem) is the reliable path.
            const choice = await vscode.window.showInformationMessage(
                'Redeeming a code needs your Denpex account. Sign in on the website to redeem, or set your API key first.',
                'Redeem on denpex.com', 'Set API Key');
            if (choice === 'Redeem on denpex.com') {
                vscode.env.openExternal(vscode.Uri.parse(`${REDEEM_URL}?code=${encodeURIComponent(code)}`));
            } else if (choice === 'Set API Key') {
                vscode.commands.executeCommand('denpex.setApiKey');
            }
            return;
        }
        try {
            const res = await redeem(code);
            vscode.window.showInformationMessage(
                `Denpex: ${res.days_remaining}-day ${res.plan} trial activated, up to 50 diagnoses a day. Connect your first node from the dashboard for live fleet findings.`);
            void refreshStatusBar();
        } catch (err: any) {
            if (err instanceof ApiError && err.status === 409) {
                vscode.window.showInformationMessage('Denpex: you already have an active trial.');
            } else if (err instanceof ApiError && err.status === 401) {
                const choice = await vscode.window.showErrorMessage('Denpex: this API key is not valid for redeeming. Redeem on the website instead?', 'Open denpex.com/redeem');
                if (choice) vscode.env.openExternal(vscode.Uri.parse(`${REDEEM_URL}?code=${encodeURIComponent(code)}`));
            } else {
                vscode.window.showErrorMessage(`Denpex: redeem failed, ${err.message}`);
            }
        }
    });

    register('denpex.openPricing', () => vscode.env.openExternal(vscode.Uri.parse(PRICING_URL)));
    register('denpex.openDashboard', () => vscode.env.openExternal(vscode.Uri.parse(DASHBOARD_URL)));
    register('denpex.generateRma', () => runGenerateRmaCommand(lastDiagnosis, lastLogs));

    // Declarative editor-title menus cannot inspect document contents. Maintain one
    // privacy-safe boolean context so traceback-like files without .log/.out still show
    // the Denpex action; no document content is stored or transmitted.
    const refreshEditorContext = () => {
        const document = vscode.window.activeTextEditor?.document;
        const sample = document ? documentEvidence(document, 64_000) : '';
        const looksLikeTraceback = /Traceback \(most recent call last\)|torch\.|CUDA error|NCCL|NVRM: Xid|vLLM|slurmstepd|nvidia-device-plugin/i.test(sample);
        void vscode.commands.executeCommand('setContext', 'denpex.tracebackOpen', looksLikeTraceback);
    };
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(refreshEditorContext),
        vscode.workspace.onDidChangeTextDocument((event) => {
            if (event.document === vscode.window.activeTextEditor?.document) refreshEditorContext();
        }),
    );
    refreshEditorContext();

    if (!context.globalState.get<boolean>(FIRST_RUN_AHA_KEY, false)) {
        await context.globalState.update(FIRST_RUN_AHA_KEY, true);
        void vscode.commands.executeCommand(
            'workbench.action.openWalkthrough',
            'denpex.denpex-diagnostics#denpex.firstDiagnosis',
            false,
        );
        void vscode.window.showInformationMessage(
            'Denpex is ready. Diagnose a realistic 64 GPU failure locally in seconds. No account and no upload.',
            'Diagnose sample now',
            'Use my log',
        ).then((choice) => {
            if (choice === 'Diagnose sample now') {
                void vscode.commands.executeCommand('denpex.sample.ncclOom');
            } else if (choice === 'Use my log') {
                void vscode.commands.executeCommand('denpex.diagnoseCurrentLogs');
            }
        });
    }
}

// ── Log collection ───────────────────────────────────────────────────────────

interface CollectedLogs { text: string; topologyMap?: Record<string, string[]> }

function documentEvidence(document: vscode.TextDocument, maxChars: number): string {
    return selectEvidenceForRequest(document.getText(), maxChars).text;
}

async function collectLogs(): Promise<CollectedLogs | undefined> {
    // 1. Prefer an explicit selection in the active editor.
    const editor = vscode.window.activeTextEditor;
    if (editor && !editor.selection.isEmpty) {
        return { text: editor.document.getText(editor.selection) };
    }

    const items: (vscode.QuickPickItem & { id: string })[] = [];

    // 2. Live terminal buffers captured by shell integration.
    const buffers = monitor?.buffers() || new Map<string, string[]>();
    if (buffers.size === 1) {
        const [name, lines] = [...buffers.entries()][0];
        items.push({ id: 'terminal', label: `$(terminal) Use output of terminal "${name}"`, description: `${lines.length} captured lines` });
    } else if (buffers.size > 1) {
        items.push({ id: 'terminals', label: `$(server-environment) Coalesce all ${buffers.size} terminals (multi-node)`, description: 'sends per-terminal topology to the engine' });
        for (const [name, lines] of buffers) {
            items.push({ id: `terminal:${name}`, label: `$(terminal) Terminal "${name}" only`, description: `${lines.length} captured lines` });
        }
    }

    // 3. Clipboard (explicitly offered, never read silently into a request).
    const clipboard = (await vscode.env.clipboard.readText()).trim();
    if (clipboard.length >= MIN_LOG_CHARS) {
        items.push({
            id: 'clipboard',
            label: '$(clippy) Use clipboard contents',
            description: clipboard.slice(0, 60).replace(/\s+/g, ' ') + (clipboard.length > 60 ? '…' : ''),
        });
    }
    items.push({ id: 'input', label: '$(edit) Paste into an input box' });

    const choice = await vscode.window.showQuickPick(items, {
        placeHolder: 'No text selected in the editor, where are the crash logs?',
    });
    if (!choice) return undefined;

    if (choice.id === 'clipboard') return { text: clipboard };
    if (choice.id === 'terminal') {
        const [, lines] = [...buffers.entries()][0];
        return { text: lines.join('\n') };
    }
    if (choice.id === 'terminals') return coalesceTerminalBuffers() || undefined;
    if (choice.id.startsWith('terminal:')) {
        const name = choice.id.slice('terminal:'.length);
        return { text: (buffers.get(name) || []).join('\n') };
    }

    const typed = await vscode.window.showInputBox({
        prompt: 'Paste your crash logs or stack trace here to diagnose with Denpex',
        placeHolder: 'Traceback (most recent call last)...',
        ignoreFocusOut: true,
    });
    return typed ? { text: typed } : undefined;
}

function coalesceTerminalBuffers(): CollectedLogs | null {
    const buffers = monitor?.buffers();
    if (!buffers || buffers.size === 0) return null;
    const sections: string[] = [];
    const topologyMap: Record<string, string[]> = {};
    for (const [name, lines] of buffers) {
        sections.push(`===== terminal: ${name} =====\n${lines.join('\n')}`);
        // Best-effort host extraction so the engine's topology analyzer can map
        // blast radius; the terminal name itself is the fallback node label.
        const hosts = new Set<string>();
        for (const line of lines) {
            const m = line.match(/\b(node-\d+|gpu-node-\d+|host-\d+|ip-\d+-\d+-\d+-\d+)\b/i);
            if (m) hosts.add(m[1]);
        }
        topologyMap[name] = hosts.size ? [...hosts] : [name];
    }
    return { text: sections.join('\n\n'), topologyMap };
}

// ── Diagnosis flow ───────────────────────────────────────────────────────────

async function runLocalDiagnosisWithProgress(logs: string, jobName: string): Promise<void> {
    if (!localEngineAvailable()) {
        vscode.window.showErrorMessage('Denpex offline engine is not available in this build.');
        return;
    }
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Diagnosing locally (offline, unlimited)...',
        cancellable: true,
    }, async (_p, token) => {
        try {
            const result = await diagnoseLocally(logs, jobName, token);
            lastDiagnosis = result;
            lastLogs = logs;
            openPanel(result);
            void sidebarProvider?.recordLocal(result);
            void refreshStatusBar();
        } catch (err: any) {
            if (token.isCancellationRequested) return;
            const msg = err instanceof LocalEngineError ? err.message : err?.message || String(err);
            vscode.window.showErrorMessage(`Denpex local diagnosis failed: ${msg}`);
        }
    });
}

async function runDiagnosis(logs: string, jobName: string, topologyMap?: Record<string, string[]>): Promise<void> {
    if (logs.trim().length < MIN_LOG_CHARS) {
        vscode.window.showWarningMessage(`Denpex needs at least ${MIN_LOG_CHARS} characters of logs to diagnose.`);
        return;
    }
    const selectedEvidence = selectEvidenceForRequest(logs, MAX_LOG_BYTES);
    if (selectedEvidence.truncated) {
        logs = selectedEvidence.text;
        void vscode.window.showWarningMessage('Denpex condensed this log to preserve causal evidence within the request limit.');
    }

    const mode = vscode.workspace.getConfiguration('denpex').get<string>('engine') || 'auto';
    const wantsCloudExplicit = mode === 'cloud';

    // Local-First Default: Run locally in 400ms for routine diagnoses unless the user explicitly configured 'cloud'
    if (!wantsCloudExplicit && localEngineAvailable()) {
        await runLocalDiagnosisWithProgress(logs, jobName);
        return;
    }

    const hasKey = Boolean(apiKey());
    const remainingFree = (!hasKey && extContext) ? getRemainingFreeCloudDiagnoses(extContext) : 0;

    if (!hasKey && remainingFree <= 0) {
        const choice = await vscode.window.showInformationMessage(
            'You have completed your 3 free full-power cloud deep analyses. Enter your work email to activate 30 days of Scale (50 deep analyses/day + multi-node reasoning) directly in VS Code, or continue with the offline engine.',
            'Unlock with Work Email',
            'Diagnose with Offline Engine',
            'Set API Key',
        );
        if (choice === 'Unlock with Work Email' && extContext) {
            const ok = await startInEditorTrialFlow(extContext);
            if (ok && apiKey()) {
                await runDiagnosis(logs, jobName, topologyMap);
            }
        } else if (choice === 'Diagnose with Offline Engine') {
            await runLocalDiagnosisWithProgress(logs, jobName);
        } else if (choice === 'Set API Key') {
            await vscode.commands.executeCommand('denpex.setApiKey');
            if (apiKey()) {
                await runDiagnosis(logs, jobName, topologyMap);
            }
        }
        return;
    }

    const progressTitle = hasKey
        ? 'Diagnosing crash with Denpex Cloud Engine...'
        : `Diagnosing crash with Denpex Deep Reasoning Engine (Cloud, ${remainingFree} free analyses remaining)...`;

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: progressTitle,
        cancellable: true,
    }, async (_progress, token) => {
        try {
            const result = await diagnose(logs, jobName, token, topologyMap);
            lastDiagnosis = result;
            lastLogs = logs;
            if (!hasKey && extContext) {
                const left = await consumeFreeCloudDiagnosis(extContext);
                vscode.window.setStatusBarMessage(`Denpex: Cloud deep diagnosis complete (${left} free analyses remaining)`, 5000);
            }
            openPanel(result);
            void refreshStatusBar();
        } catch (err: any) {
            if (token.isCancellationRequested) return;

            if (err instanceof ApiError && (err.status === 401 || err.status === 429)) {
                const choice = await vscode.window.showInformationMessage(
                    'Cloud deep reasoning quota reached. Unlock 30 days of Scale (50 analyses/day) with your work email, or continue with the offline engine.',
                    'Unlock with Work Email',
                    'Diagnose with Offline Engine',
                    'Set API Key',
                );
                if (choice === 'Unlock with Work Email' && extContext) {
                    const ok = await startInEditorTrialFlow(extContext);
                    if (ok && apiKey()) await runDiagnosis(logs, jobName, topologyMap);
                } else if (choice === 'Diagnose with Offline Engine') {
                    await runLocalDiagnosisWithProgress(logs, jobName);
                } else if (choice === 'Set API Key') {
                    await vscode.commands.executeCommand('denpex.setApiKey');
                }
                return;
            }

            // Connection or network failure: allow graceful offline fallback
            const choice = await vscode.window.showWarningMessage(
                `Denpex cloud diagnosis could not reach api.denpex.com (${err.message}). Diagnose locally using the bundled offline engine?`,
                'Diagnose with Offline Engine',
                'Cancel',
            );
            if (choice === 'Diagnose with Offline Engine') {
                await runLocalDiagnosisWithProgress(logs, jobName);
            }
        }
    });
}

/**
 * Run the CLOUD engine on a log the local engine has already answered.
 *
 * Kept separate from runDiagnosis so that sending logs off the machine is always an
 * explicit act, either the user ran the command, or they turned on cloud.autoEscalate.
 * The local path never falls into this silently.
 */
async function escalateToCloud(
    logs: string,
    jobName: string,
    topologyMap?: Record<string, string[]>,
): Promise<void> {
    const hasKey = Boolean(apiKey());
    if (!hasKey && extContext) {
        const remaining = getRemainingFreeCloudDiagnoses(extContext);
        if (remaining <= 0) {
            const choice = await vscode.window.showInformationMessage(
                'You have used your 3 free cloud deep analyses. Unlock 30 days of Scale (50 analyses/day + multi-node reasoning) with your work email.',
                'Unlock with Work Email',
                'Set API Key',
            );
            if (choice === 'Unlock with Work Email') await startInEditorTrialFlow(extContext);
            else if (choice === 'Set API Key') await vscode.commands.executeCommand('denpex.setApiKey');
            return;
        }
    }

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Deep reasoning (cloud)...',
        cancellable: true,
    }, async (_p, token) => {
        try {
            const result = await diagnose(logs, jobName, token, topologyMap);
            lastDiagnosis = result;
            lastLogs = logs;
            if (!hasKey && extContext) {
                const remaining = await consumeFreeCloudDiagnosis(extContext);
                vscode.window.setStatusBarMessage(`Denpex: Cloud reasoning complete (${remaining} free analyses remaining)`, 4000);
            }
            openPanel(result);
            void refreshStatusBar();
        } catch (err: any) {
            if (token.isCancellationRequested) return;
            if (err instanceof ApiError && (err.status === 401 || err.status === 429)) {
                const choice = await vscode.window.showInformationMessage(
                    'Cloud deep reasoning and live fleet findings need a plan or the 30-day Scale trial. Your local diagnosis stays unlimited.',
                    'Unlock with Work Email', 'Set API Key');
                if (choice === 'Unlock with Work Email' && extContext) await startInEditorTrialFlow(extContext);
                else if (choice === 'Set API Key') vscode.commands.executeCommand('denpex.setApiKey');
                return;
            }
            vscode.window.showWarningMessage(
                `Denpex cloud reasoning failed: ${err?.message ?? err}. Your local diagnosis is still shown.`,
            );
        }
    });
}

function openPanel(result: DiagnoseResponse, focusSection?: string): void {
    showDiagnosisPanel(result, async (message) => {
        switch (message.command) {
            case 'copy':
                if (message.text) await vscode.env.clipboard.writeText(message.text);
                vscode.window.setStatusBarMessage('Denpex: copied to clipboard', 2000);
                break;
            case 'copyIncidentReport':
                if (lastDiagnosis) {
                    const md = generateIncidentMarkdown(lastDiagnosis);
                    await vscode.env.clipboard.writeText(md);
                    void vscode.window.showInformationMessage('Denpex: Copied incident post-mortem for Slack / PR to clipboard.');
                }
                break;
            case 'selectClarifyingChoice':
                if (lastLogs && message.text) {
                    const refinedPrompt = `${lastLogs}\n\n[Operator Observation]: ${message.text}${message.reason ? ` (${message.reason})` : ''}`;
                    lastLogs = refinedPrompt;
                    void runDiagnosis(refinedPrompt, 'clarifying-refinement');
                }
                break;
            case 'insertInTerminal':
                if (message.text) {
                    const term = vscode.window.activeTerminal || vscode.window.createTerminal({ name: 'Denpex' });
                    term.show(true);
                    term.sendText(message.text, false);
                    vscode.window.setStatusBarMessage('Denpex: Inserted command at terminal prompt', 3000);
                }
                break;
            case 'startInEditorTrial':
                if (extContext) await startInEditorTrialFlow(extContext);
                break;
            case 'open':
                if (message.text) vscode.env.openExternal(vscode.Uri.parse(message.text));
                break;
            case 'runInTerminal':
                if (message.text) await executeInTerminal(message.text);
                break;
            case 'restartCheckpoint':
                await restartFromCheckpoint();
                break;
            case 'generateRma':
                await runGenerateRmaCommand(lastDiagnosis, lastLogs);
                break;
            case 'escalateCloud':
                if (lastLogs) await escalateToCloud(lastLogs, 'report-cloud-escalation');
                break;
            case 'startTrial':
                await vscode.env.openExternal(vscode.Uri.parse(
                    `${PRICING_URL}?utm_source=vscode&utm_medium=extension&utm_campaign=diagnosis_report`,
                ));
                break;
        }
    }, focusSection);
}

// ── Closed-loop remediation (explicit consent, always visible) ──────────────

async function executeInTerminal(command: string): Promise<void> {
    const confirmRequired = vscode.workspace.getConfiguration('denpex').get<boolean>('remediation.confirmBeforeRun', true);
    if (confirmRequired) {
        const preview = command.length > 400 ? command.slice(0, 400) + '…' : command;
        const choice = await vscode.window.showWarningMessage(
            `Denpex will run this in a terminal on ${vscode.env.remoteName ? 'the REMOTE host' : 'this machine'}:\n\n${preview}`,
            { modal: true },
            'Run It');
        if (choice !== 'Run It') return;
    }
    if (!remediationTerminal || remediationTerminal.exitStatus !== undefined) {
        remediationTerminal = vscode.window.createTerminal({ name: 'Denpex Remediation' });
    }
    remediationTerminal.show(true);
    remediationTerminal.sendText(command, true);
}

async function restartFromCheckpoint(): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('denpex');
    let command = (cfg.get<string>('remediation.restartCommand') || '').trim();
    if (!command) {
        const entered = await vscode.window.showInputBox({
            prompt: 'Command that resumes your training from the last checkpoint (saved for next time)',
            placeHolder: 'e.g. sbatch resume_training.sh   or   torchrun train.py --resume latest',
            ignoreFocusOut: true,
        });
        if (!entered) return;
        command = entered.trim();
        await cfg.update('remediation.restartCommand', command, vscode.ConfigurationTarget.Workspace);
    }
    await executeInTerminal(command);
}

// ── Status bar ───────────────────────────────────────────────────────────────

async function refreshStatusBar(): Promise<void> {
    if (!statusItem) return;
    if (!apiKey()) {
        const remaining = extContext ? getRemainingFreeCloudDiagnoses(extContext) : 0;
        if (remaining > 0) {
            statusItem.text = `$(pulse) Denpex: Local · ${remaining} Cloud Passes`;
            statusItem.tooltip = `Denpex: Unlimited Local Engine Active · ${remaining} free Cloud Deep Reasoning passes remaining. Click for menu.`;
        } else if (localEngineAvailable()) {
            statusItem.text = '$(pulse) Denpex: Local Engine';
            statusItem.tooltip =
                'Denpex: Unlimited Local Engine Active (no account required).\n'
                + 'Enter work email to unlock 30 days of Scale (50 cloud analyses/day). Click for menu.';
        } else {
            statusItem.text = '$(pulse) Denpex';
            statusItem.tooltip = 'Denpex ML Diagnostics. Run "Denpex: Set API Key" to sync with your dashboard.';
        }
        return;
    }
    try {
        const [q, trial] = await Promise.all([quota(), redeemStatus().catch(() => null)]);
        const planLabel = trial?.active && trial.plan ? `${trial.plan} trial` : (q.plan || 'free');
        const remainingLabel = typeof q.remaining === 'number' && isFinite(q.remaining) ? ` · ${q.remaining} left` : '';
        statusItem.text = `$(pulse) Denpex: ${planLabel}${remainingLabel}`;
        statusItem.tooltip = trial?.active
            ? `Denpex: ${trial.plan} trial, ${trial.days_remaining} days remaining. Click for menu.`
            : `Denpex: ${planLabel} plan, synced with your cloud dashboard. Click for menu.`;
    } catch {
        statusItem.text = '$(pulse) Denpex';
        statusItem.tooltip = 'Denpex ML Diagnostics. Click for menu.';
    }
}

export function deactivate() {
    monitor?.dispose();
}
