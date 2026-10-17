import * as vscode from 'vscode';
import { execFile } from 'child_process';
import * as path from 'path';

export async function inspectGpuArtifact(context: vscode.ExtensionContext): Promise<string | undefined> {
    if (!vscode.workspace.isTrusted) {
        void vscode.window.showInformationMessage('Trust this workspace before running local artifact inspection.');
        return;
    }
    const selected = await vscode.window.showQuickPick([
        { label: 'PyTorch Flight Recorder', description: 'Dedicated folder of JSON rank dumps, no pickle execution', module: 'flight-recorder' },
        { label: 'CUDA memory snapshot', description: 'JSON only, per-device allocations and OOM events', module: 'memory-snapshot' },
        { label: 'Nsight SQLite trace', description: 'Read-only kernel and gap inspection, five-second query deadline', module: 'nsight' },
        { label: 'Checkpoint discovery', description: 'Read-only candidates, never deletes or resumes', module: 'checkpoints' },
        { label: 'Aligned rank step timings', description: 'JSON rank arrays with at least three aligned steps', module: 'stragglers' },
    ], { title: 'Denpex: Inspect GPU Artifact Locally' });
    if (!selected) return;
    const directory = selected.module === 'checkpoints' || selected.module === 'flight-recorder';
    const files = await vscode.window.showOpenDialog({ canSelectMany: false,
        canSelectFiles: !directory, canSelectFolders: directory,
        title: `Select ${selected.label}`, openLabel: 'Inspect locally' });
    if (!files?.[0]) return;
    const python = vscode.workspace.getConfiguration('denpex').get<string>('pythonPath') || 'python';
    const script = path.join(context.extensionPath, 'engine', 'denpex_artifacts.py');
    try {
        return await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification,
            title: 'Inspecting GPU artifact locally. No upload.', cancellable: false }, () =>
            new Promise<string>((resolve, reject) => {
                execFile(python, [script, selected.module, files[0].fsPath],
                    { timeout: 30000, maxBuffer: 256000, windowsHide: true }, (error, stdout) => {
                        try {
                            const result = JSON.parse(stdout);
                            if (result.denpexArtifactVersion !== 1 || result.module !== selected.module) throw new Error('Unsupported artifact response');
                            if (error && result.status !== 'INCOMPLETE') throw error;
                            resolve(JSON.stringify(result));
                        } catch { reject(new Error('Inspection could not finish. Verify Python 3 is installed and the artifact format and size are supported.')); }
                    });
            }));
    } catch (error) {
        void vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Artifact inspection failed.');
        return;
    }
}
