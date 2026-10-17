import * as vscode from 'vscode';
import { SAMPLE_FAILURES } from './samples';
import { DenpexSidebarProvider } from './sidebar';

const html = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export class DenpexSidebarWebview implements vscode.WebviewViewProvider {
    private view: vscode.WebviewView | undefined;

    constructor(private readonly history: DenpexSidebarProvider, private readonly localReady: boolean) {}

    resolveWebviewView(view: vscode.WebviewView): void {
        this.view = view;
        view.webview.options = { enableScripts: true };
        view.webview.onDidReceiveMessage((message: { action?: string; id?: string }) => {
            const commands: Record<string, string> = {
                clipboard: 'denpex.diagnoseClipboard',
                current: 'denpex.diagnoseCurrentLogs',
                workspace: 'denpex.scanClusterLogs',
                artifact: 'denpex.inspectGpuArtifact',
                cloudHistory: 'denpex.cloudHistory',
                connect: 'denpex.connectAccount',
                trial: 'denpex.startInEditorTrial',
                privacy: 'denpex.showPrivacyStatus',
            };
            if (message.action && commands[message.action]) void vscode.commands.executeCommand(commands[message.action]);
            if (message.action === 'sample' && SAMPLE_FAILURES.some((sample) => sample.id === message.id)) {
                void vscode.commands.executeCommand('denpex.runSample', message.id);
            }
            if (message.action === 'recent' && this.history.openRecent(message.id || '')) {
                void vscode.commands.executeCommand('denpex.openRecent', message.id);
            }
        });
        view.onDidDispose(() => { this.view = undefined; });
        this.refresh();
    }

    refresh(): void {
        if (!this.view) return;
        const nonce = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
        const samples = SAMPLE_FAILURES.slice(1).map((sample) => `<button class="row" data-action="sample" data-id="${html(sample.id)}"><span>${html(sample.title)}</span><span aria-hidden="true">›</span></button>`).join('');
        const recent = this.history.getChildren().find((item) => item.id === 'recent');
        const records = recent ? this.history.getChildren(recent) : [];
        const history = records.length && records[0].command
            ? records.map((record) => {
                const id = String(record.command?.arguments?.[0] || '');
                const available = Boolean(this.history.openRecent(id));
                return `<button class="row" data-action="recent" data-id="${html(id)}" ${available ? '' : 'disabled title="Only report metadata is saved between sessions"'}><span>${html(record.label)}</span><small>${available ? 'Open report' : 'Previous session'}</small></button>`;
            }).join('')
            : '<p class="empty">Your diagnoses will appear here after you run one.</p>';
        this.view.webview.html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';"><style nonce="${nonce}">
            *{box-sizing:border-box}body{margin:0;padding:18px 14px 28px;background:var(--vscode-sideBar-background);color:var(--vscode-foreground);font:13px/1.45 var(--vscode-font-family)}button{font:inherit;cursor:pointer}button:focus-visible,summary:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:2px}.eyebrow,h2{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--vscode-descriptionForeground)}.eyebrow{color:#D6795C}h1{font-size:20px;line-height:1.2;margin:8px 0}h2{margin:0 0 10px}p{margin:0;color:var(--vscode-descriptionForeground)}header{margin-bottom:20px}.primary,.option{display:block;width:100%;text-align:left;border-radius:6px;padding:11px 12px;margin-bottom:8px;color:var(--vscode-foreground)}.primary{border:1px solid #CC5A37;background:#CC5A37;color:#0A0A0A;font-weight:600}.primary:hover{background:#D6795C}.option{border:1px solid var(--vscode-panel-border);background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background))}.option:hover,.row:hover{background:var(--vscode-list-hoverBackground)}small{display:block;font-size:11px;font-weight:400;opacity:.85;margin-top:2px}.section{margin-top:25px}.row{display:flex;justify-content:space-between;align-items:center;gap:8px;width:100%;padding:10px 2px;border:0;border-bottom:1px solid var(--vscode-panel-border);background:transparent;color:var(--vscode-foreground);text-align:left}.row:disabled{cursor:default;opacity:.6}.row small{white-space:nowrap;color:var(--vscode-descriptionForeground)}.empty{border:1px dashed var(--vscode-panel-border);border-radius:6px;padding:12px}details{border-top:1px solid var(--vscode-panel-border);margin-top:24px;padding-top:14px}summary{cursor:pointer;font-weight:600}.link{display:block;border:0;background:transparent;color:var(--vscode-textLink-foreground);padding:8px 0;text-align:left}.privacy{margin-top:22px;font-size:11px}.privacy button{border:0;background:transparent;color:var(--vscode-textLink-foreground);padding:0;text-decoration:underline}
        .hero{border:1px solid var(--vscode-panel-border);border-top:3px solid #CC5A37;border-radius:8px;padding:17px 15px;background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background))}.hero h1{font-size:21px;margin:9px 0}.hero p{font-size:12px}.status{display:inline-flex;align-items:center;gap:6px;color:var(--vscode-foreground);font-size:11px}.status::before{content:'';width:7px;height:7px;border-radius:50%;background:#73C991}.status.unavailable::before{background:#F48771}.source-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.source-grid .option{margin:0;min-height:82px}.source-grid strong{display:block;font-size:12px}.source-grid small{font-size:11px}.sample-card{border:1px solid var(--vscode-panel-border);border-radius:7px;padding:13px;margin-top:11px;background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background))}.sample-card strong{display:block;margin:6px 0}.sample-card p{font-size:12px}.sample-path{display:flex;gap:6px;align-items:center;margin:12px 0;color:var(--vscode-descriptionForeground);font-size:11px;flex-wrap:wrap}.sample-path span{border:1px solid var(--vscode-panel-border);border-radius:4px;padding:3px 6px}.sample-card button{border:1px solid #CC5A37;border-radius:4px;background:transparent;color:#D6795C;padding:6px 10px;font-weight:600}.sample-card button:hover{background:#CC5A3724}.sample-card button:focus-visible{outline:2px solid var(--vscode-focusBorder)}.sample-other{margin-top:10px;border:0;padding:0}.sample-other summary{color:var(--vscode-textLink-foreground);font-size:12px}.cloud-note{margin:10px 0}.row:focus-visible{outline:2px solid var(--vscode-focusBorder)}
        </style></head><body>
        <header class="hero"><span class="status${this.localReady ? '' : ' unavailable'}">${this.localReady ? 'LOCAL ENGINE READY' : 'LOCAL ENGINE UNAVAILABLE'}</span><h1>Find what failed first.</h1><p>${this.localReady ? 'For CUDA, NCCL, Xid, Slurm, and inference failures. See the initiating rank or node, evidence, and next safe step.' : 'The bundled local engine could not start. Reinstall the extension or check the extension host logs.'}</p></header>
        <section class="section" aria-labelledby="start-title"><h2 id="start-title">Start a diagnosis</h2><button class="primary" data-action="clipboard">Diagnose copied log<small>Copy the error and its surrounding lines, then diagnose</small></button><div class="source-grid"><button class="option" data-action="current"><strong>Editor or terminal</strong><small>Use a selection, open log, or terminal output</small></button><button class="option" data-action="workspace"><strong>Workspace logs</strong><small>Find Slurm output and log files</small></button><button class="option" data-action="artifact"><strong>GPU artifacts</strong><small>Inspect memory, Nsight, checkpoints and rank timings locally</small></button></div></section>
        <section class="section" aria-labelledby="sample-title"><h2 id="sample-title">See how it works</h2><div class="sample-card"><span class="eyebrow">BUNDLED INCIDENT</span><strong>OOM before NCCL timeout</strong><p>Rank 3 runs out of memory. Other ranks report watchdog timeouts 30 minutes later.</p><div class="sample-path"><span>Rank 3: OOM</span><span aria-hidden="true">→</span><span>Ranks 0 to 2: timeout</span></div><button data-action="sample" data-id="nccl-rank-oom">Diagnose sample</button></div><details class="sample-other"><summary>Other sample failures</summary>${samples}</details></section>
        <section class="section" aria-labelledby="recent-title"><h2 id="recent-title">Recent diagnoses</h2>${history}</section>
        <details><summary>Cloud and account</summary><p class="cloud-note">Optional cloud review sends a log only when you choose it.</p><button class="link" data-action="connect">Connect an existing account</button><button class="link" data-action="trial">Request a Team trial</button></details><p class="privacy">Local diagnosis stays on this machine. <button data-action="privacy">Privacy details</button></p>
        <script nonce="${nonce}">const vscode=acquireVsCodeApi();document.addEventListener('click',event=>{const button=event.target.closest('button[data-action]');if(button&&!button.disabled)vscode.postMessage({action:button.dataset.action,id:button.dataset.id});});</script></body></html>`;
    }
}
