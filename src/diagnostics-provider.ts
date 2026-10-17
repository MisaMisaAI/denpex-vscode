import * as fs from 'fs';
import * as readline from 'readline';
import * as vscode from 'vscode';

export class DiagnosticsProvider {
    private diagnosticCollection: vscode.DiagnosticCollection;

    constructor() {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('denpex-tracebacks');
    }

    public getCollection(): vscode.DiagnosticCollection {
        return this.diagnosticCollection;
    }

    /**
     * Scans log text or a log file for Python tracebacks and populates VS Code diagnostics.
     */
    public async parseTracebacksAndPublish(uri: vscode.Uri): Promise<void> {
        const diagnosticsMap = new Map<string, vscode.Diagnostic[]>();

        try {
            const fileStream = fs.createReadStream(uri.fsPath);
            const rl = readline.createInterface({
                input: fileStream,
                crlfDelay: Infinity
            });

            // Standard Python traceback frame pattern: File "path/to/file.py", line 123, in function_name
            const frameRegex = /File\s+"([^"]+)",\s+line\s+(\d+)(?:,\s+in\s+(.+))?/i;

            for await (const line of rl) {
                const match = line.match(frameRegex);
                if (match) {
                    const filePath = match[1];
                    const lineNumber = parseInt(match[2], 10) - 1;
                    const funcName = match[3] ? match[3].trim() : 'unknown';

                    let targetUri: vscode.Uri;
                    if (fs.existsSync(filePath)) {
                        targetUri = vscode.Uri.file(filePath);
                    } else {
                        const workspaceFolders = vscode.workspace.workspaceFolders;
                        if (workspaceFolders && workspaceFolders.length > 0) {
                            const candidate = vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);
                            if (fs.existsSync(candidate.fsPath)) {
                                targetUri = candidate;
                            } else {
                                continue;
                            }
                        } else {
                            continue;
                        }
                    }

                    const range = new vscode.Range(
                        Math.max(0, lineNumber),
                        0,
                        Math.max(0, lineNumber),
                        200
                    );

                    const diagnostic = new vscode.Diagnostic(
                        range,
                        `Python traceback frame in function "${funcName}" (detected from GPU log)`,
                        vscode.DiagnosticSeverity.Error
                    );
                    diagnostic.source = 'Denpex PyTorch Analyzer';

                    const key = targetUri.toString();
                    if (!diagnosticsMap.has(key)) {
                        diagnosticsMap.set(key, []);
                    }
                    diagnosticsMap.get(key)!.push(diagnostic);
                }
            }

            this.diagnosticCollection.clear();
            for (const [key, diagnostics] of diagnosticsMap.entries()) {
                this.diagnosticCollection.set(vscode.Uri.parse(key), diagnostics);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to parse tracebacks for diagnostics: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    public clear(): void {
        this.diagnosticCollection.clear();
    }

    public dispose(): void {
        this.diagnosticCollection.dispose();
    }
}
