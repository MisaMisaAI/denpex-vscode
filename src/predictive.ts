import * as vscode from 'vscode';
import { MAX_LOG_BYTES } from './api';
import { selectEvidenceForRequest } from './evidence';

// Pre-crash risk signals. Each is a cheap local regex, no API calls, no upload.
// Weights are heuristic: 100 = a crash is essentially in progress.
interface RiskRule { id: string; label: string; re: RegExp; weight: number }

const RISK_RULES: RiskRule[] = [
    { id: 'xid', label: 'GPU Xid event in driver log', re: /NVRM:\s*Xid|\bXid\s+\d+/i, weight: 50 },
    { id: 'ecc', label: 'ECC / row-remap activity', re: /uncorrectable ECC|double[- ]?bit|row.?remap(ped|ping)?|ECC error/i, weight: 45 },
    { id: 'nccl_retry', label: 'NCCL transport retries', re: /NCCL WARN.*(retry|timed? ?out|connect fail|refused)|socketStartConnect|socketPollConnect|Connection reset by peer.*(nccl|rank)/i, weight: 32 },
    { id: 'nccl_slow', label: 'Collective slowdown', re: /Proxy stalled|collective.*(slow|lagging)|Watchdog.*(approaching|近)/i, weight: 28 },
    { id: 'fp16', label: 'Loss-scale instability', re: /Gradient overflow|loss[_ ]scale.*(reduc|halv|decreas)|found inf|Inf detected in grad/i, weight: 26 },
    { id: 'thermal', label: 'Thermal throttling', re: /thermal throttl|Hardware Slowdown|clocks.*throttl/i, weight: 25 },
    { id: 'mem_pressure', label: 'Allocator memory pressure', re: /retrying alloc|allocation retr|high memory fragmentation|expandable_segments|reserved memory.*close to capacity/i, weight: 22 },
    { id: 'dataloader', label: 'DataLoader worker instability', re: /DataLoader worker.*(killed|exited|died)|worker terminated unexpectedly/i, weight: 30 },
    { id: 'link_flap', label: 'Fabric link flap', re: /mlx5_core.*link (down|up)|port.*state.*down|link flap/i, weight: 35 },
];

const LOSS_RE = /(?:^|[^a-z])loss[=:\s]+([0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?)/;

interface TerminalState {
    lines: string[];               // rolling buffer for topology / diagnosis
    losses: number[];              // recent loss values
    hits: Map<string, number>;     // ruleId -> timestamp of last hit
    score: number;
    signals: Set<string>;
    windowStart: number;
}

const BUFFER_COMPACT_BYTES = MAX_LOG_BYTES * 2;
const WINDOW_MS = 5 * 60 * 1000;
const NOTIFY_THRESHOLD = 55;

export class PredictiveMonitor implements vscode.Disposable {
    private readonly states = new Map<vscode.Terminal, TerminalState>();
    private readonly disposables: vscode.Disposable[] = [];
    private mutedUntil = 0;
    private lastNotifiedAt = 0;

    constructor(private readonly onDiagnoseRequest: (logs: string, terminalName: string) => void) {}

    start(): void {
        // Terminal shell integration (stable since VS Code 1.93) streams the output of
        // every executed command, including over Remote-SSH, where the extension host
        // runs on the remote node. This is what lets us watch training runs live.
        const w = vscode.window as any;
        if (typeof w.onDidStartTerminalShellExecution !== 'function') {
            return; // older VS Code: predictive detection silently unavailable
        }
        this.disposables.push(w.onDidStartTerminalShellExecution(async (event: any) => {
            if (!this.enabled()) return;
            const terminal: vscode.Terminal = event.terminal;
            try {
                const stream: AsyncIterable<string> = event.execution.read();
                for await (const chunk of stream) {
                    this.ingest(terminal, chunk);
                }
            } catch { /* stream ended or terminal closed, never break the host */ }
        }));
        this.disposables.push(vscode.window.onDidCloseTerminal((t) => this.states.delete(t)));
    }

    private enabled(): boolean {
        return vscode.workspace.getConfiguration('denpex').get<boolean>('predictive.enabled', true);
    }

    private state(terminal: vscode.Terminal): TerminalState {
        let s = this.states.get(terminal);
        if (!s) {
            s = { lines: [], losses: [], hits: new Map(), score: 0, signals: new Set(), windowStart: Date.now() };
            this.states.set(terminal, s);
        }
        return s;
    }

    ingest(terminal: vscode.Terminal, chunk: string): void {
        const s = this.state(terminal);
        const now = Date.now();
        if (now - s.windowStart > WINDOW_MS) {
            s.score = 0;
            s.signals.clear();
            s.windowStart = now;
        }
        // Strip ANSI escapes so regexes see clean text.
        const clean = chunk.replace(/\[[0-9;]*[A-Za-z]/g, '');
        for (const rawLine of clean.split(/\r?\n/)) {
            const line = rawLine.trim();
            if (!line) continue;
            s.lines.push(line);
            const buffered = s.lines.join('\n');
            if (Buffer.byteLength(buffered, 'utf8') > BUFFER_COMPACT_BYTES) {
                s.lines = selectEvidenceForRequest(buffered, MAX_LOG_BYTES).text.split('\n');
            }

            for (const rule of RISK_RULES) {
                if (!rule.re.test(line)) continue;
                const last = s.hits.get(rule.id) || 0;
                s.hits.set(rule.id, now);
                // Repeated hits of the same rule inside the window escalate mildly.
                s.score += now - last < WINDOW_MS ? Math.ceil(rule.weight / 3) : rule.weight;
                s.signals.add(rule.label);
            }

            const lossMatch = LOSS_RE.exec(line.toLowerCase());
            if (lossMatch) {
                const v = parseFloat(lossMatch[1]);
                if (Number.isFinite(v)) {
                    s.losses.push(v);
                    if (s.losses.length > 20) s.losses.shift();
                    if (s.losses.length >= 6) {
                        const prior = [...s.losses.slice(0, -1)].sort((a, b) => a - b);
                        const median = prior[Math.floor(prior.length / 2)];
                        if (median > 0 && (v > median * 3 || !Number.isFinite(v))) {
                            s.score += 35;
                            s.signals.add(`loss spike (${median.toFixed(3)} → ${v})`);
                        }
                    }
                }
            }
        }
        if (s.score >= NOTIFY_THRESHOLD) this.notify(terminal, s);
    }

    private async notify(terminal: vscode.Terminal, s: TerminalState): Promise<void> {
        const now = Date.now();
        const cooldownMin = vscode.workspace.getConfiguration('denpex').get<number>('predictive.notifyCooldownMinutes', 10);
        if (now < this.mutedUntil || now - this.lastNotifiedAt < cooldownMin * 60 * 1000) return;
        this.lastNotifiedAt = now;

        const signals = [...s.signals].slice(0, 3).join(', ');
        // RISK_RULES are conservative operational heuristics, not a probability model
        // evaluated on a representative prospective fleet. Calling a transformed score
        // "confidence" would manufacture calibration we do not have. Show the severity
        // threshold and the exact evidence, then diagnose with the canonical engine only
        // after the user asks.
        const severity = s.score >= 90 ? 'Critical pre-crash signals' : 'High-risk pre-crash signals';
        const choice = await vscode.window.showWarningMessage(
            `Denpex: ${severity} detected in "${terminal.name}". Evidence: ${signals}.`,
            'Diagnose Now', 'Mute 1h',
        );
        if (choice === 'Diagnose Now') {
            this.onDiagnoseRequest(s.lines.join('\n'), terminal.name);
        } else if (choice === 'Mute 1h') {
            this.mutedUntil = now + 60 * 60 * 1000;
        }
        // Reset the window so we re-arm on fresh evidence, not the same lines.
        s.score = 0;
        s.signals.clear();
        s.windowStart = now;
    }

    /** Rolling output buffers for every live terminal, used for multi-node coalescing. */
    buffers(): Map<string, string[]> {
        const out = new Map<string, string[]>();
        for (const [terminal, s] of this.states) {
            if (s.lines.length) out.set(terminal.name, [...s.lines]);
        }
        return out;
    }

    dispose(): void {
        for (const d of this.disposables) d.dispose();
        this.states.clear();
    }
}
