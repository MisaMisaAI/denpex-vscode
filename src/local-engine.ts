import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import type { DiagnoseResponse } from './api';

/**
 * The offline diagnosis engine, running inside the extension host.
 *
 * WHY THIS EXISTS
 * The extension shipped network-only. Without an API key it fell back to
 * /api/diagnose/anon, three diagnoses per day, per IP, and nothing at all on an
 * air-gapped or firewalled training node, which is exactly where people debug GPU
 * crashes. So the free experience was a demo with a meter on it, and the download
 * numbers reflected that.
 *
 * `engine/denpex_canonical.mjs` is the same canonical zero-egress engine the air-gapped
 * agent ships (scripts/gen-canonical-offline-engine.mjs): the canonical deterministic
 * pattern and contract/evidence tiers, bundled as a single self-contained script that
 * reads one JSON request on stdin and writes one JSON response on stdout.
 *
 * WHAT THIS CHANGES ABOUT THE PRODUCT
 * Local diagnosis is UNLIMITED and always available, because it costs nothing to serve -
 * there is no API call, no LLM token, and no quota to meter. Metering it would be
 * invented scarcity, and users can tell. What remains paid is the deep reasoning tier,
 * which is the part that actually costs money to run.
 *
 * WHY spawn AND NOT require()
 * The bundle is a CLI: it self-executes on import, reads stdin, and writes stdout. It is
 * also ~7 MB of generated code, so pulling it into the extension host's module graph
 * would freeze the UI thread while it parses. A child process keeps the host responsive
 * and lets a runaway diagnosis be killed.
 *
 * VS Code ships its own Node, `process.execPath` is the Code binary, and setting
 * ELECTRON_RUN_AS_NODE=1 makes it behave as a plain Node interpreter. That is what makes
 * this work with no `node` on PATH, which matters on Windows and inside Remote-SSH
 * containers where a system Node often is not installed.
 */

/** Set once at activation so path resolution does not guess at the install location. */
let extensionRoot: string | undefined;

export function initLocalEngine(context: vscode.ExtensionContext): void {
    extensionRoot = context.extensionUri.fsPath;
}

/** Absolute path to the bundled engine, or undefined when it was not packaged. */
export function localEnginePath(): string | undefined {
    if (!extensionRoot) return undefined;
    const p = path.join(extensionRoot, 'engine', 'denpex_canonical.mjs');
    try {
        return fs.existsSync(p) ? p : undefined;
    } catch {
        return undefined;
    }
}

export function localEngineAvailable(): boolean {
    return localEnginePath() !== undefined;
}

/**
 * A local run has no network and no model call, so it is bounded by CPU alone. 60s is far
 * beyond the measured worst case and exists only so a pathological log cannot wedge a
 * child process forever.
 */
const LOCAL_TIMEOUT_MS = 60000;

export class LocalEngineError extends Error {}

/**
 * Diagnose entirely on this machine. Nothing leaves the process.
 *
 * Returns a DiagnoseResponse because the canonical engine already emits that shape -
 * `success`, `fix`, `meta`, `rankedHypotheses`, `contradictions`, `advisory`,
 * `forensicReport`, `resumeFrom`, `resumeSafetyNote`, `confidenceDisplay` and
 * `confidenceBand` are all present and carry the same meaning as the cloud response. The
 * panel therefore renders a local verdict with no special-casing, which is the point: a
 * free user sees the real report, not a stub of one.
 */
export function diagnoseLocally(
    logs: string,
    jobName: string,
    token?: vscode.CancellationToken,
): Promise<DiagnoseResponse> {
    const enginePath = localEnginePath();
    if (!enginePath) {
        return Promise.reject(new LocalEngineError('The offline engine was not bundled with this build of the extension.'));
    }

    return new Promise<DiagnoseResponse>((resolve, reject) => {
        let settled = false;
        const finish = (fn: () => void) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            fn();
        };

        const child = spawn(process.execPath, [enginePath], {
            env: {
                ...process.env,
                // Makes the Code binary behave as a plain Node interpreter. Without this it
                // launches a second editor window instead of running the script.
                ELECTRON_RUN_AS_NODE: '1',
                // Belt and braces: the bundle is zero-egress by construction, and this
                // makes that explicit to anyone reading a process listing.
                DENPEX_LOCAL: '1',
            },
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
        });

        const timer = setTimeout(() => {
            finish(() => {
                try { child.kill(); } catch { /* already gone */ }
                reject(new LocalEngineError('Local diagnosis timed out. Try a shorter excerpt of the log.'));
            });
        }, LOCAL_TIMEOUT_MS);

        const cancelSub = token?.onCancellationRequested(() => {
            finish(() => {
                try { child.kill(); } catch { /* already gone */ }
                reject(new LocalEngineError('Cancelled.'));
            });
        });

        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => { stdout += d.toString(); });
        // The engine redirects its own console.log to stderr so stdout carries ONLY the
        // JSON response. Captured for the error path; never parsed.
        child.stderr.on('data', (d) => { stderr += d.toString(); });

        child.on('error', (err) => {
            finish(() => reject(new LocalEngineError(`Could not start the local engine: ${err.message}`)));
        });

        child.on('close', (code) => {
            cancelSub?.dispose();
            finish(() => {
                if (code !== 0 && stdout.trim().length === 0) {
                    reject(new LocalEngineError(
                        `Local engine exited with code ${code}. ${stderr.trim().slice(0, 300) || 'No diagnostic output.'}`,
                    ));
                    return;
                }
                try {
                    const parsed = JSON.parse(stdout) as DiagnoseResponse;
                    resolve(parsed);
                } catch {
                    reject(new LocalEngineError('The local engine returned output this build could not read.'));
                }
            });
        });

        try {
            child.stdin.write(JSON.stringify({ logs, jobName }));
            child.stdin.end();
        } catch (err: any) {
            finish(() => reject(new LocalEngineError(`Could not send the log to the local engine: ${err?.message ?? err}`)));
        }
    });
}
