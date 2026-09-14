import * as vscode from 'vscode';

export interface GpuErrorTerminalLink extends vscode.TerminalLink {
    matchedText: string;
    terminalName: string;
}

const GPU_ERROR_PATTERNS: readonly RegExp[] = [
    /torch\.OutOfMemoryError|CUDA out of memory/i,
    /RuntimeError:\s*CUDA error/i,
    /NCCL WARN|ProcessGroupNCCL.*Watchdog caught collective/i,
    /NVRM:\s*Xid\s*(?:\(PCI:[^)]+\):)?\s*\d+/i,
    /torch\.distributed\.DistBackendError/i,
    /vLLM.*(?:EngineCoreError|KV-?cache exhaustion|out of memory)/i,
    /srun:\s*error:\s*.*Exited with exit code [1-9]/i,
    /CUDA kernel errors might be asynchronously reported/i,
];

export class DenpexTerminalLinkProvider implements vscode.TerminalLinkProvider<GpuErrorTerminalLink> {
    constructor(private readonly onDiagnose: (terminal: vscode.Terminal) => void) {}

    provideTerminalLinks(context: vscode.TerminalLinkContext, _token: vscode.CancellationToken): GpuErrorTerminalLink[] {
        const line = context.line;
        const links: GpuErrorTerminalLink[] = [];

        for (const pattern of GPU_ERROR_PATTERNS) {
            const match = pattern.exec(line);
            if (match) {
                links.push({
                    startIndex: match.index,
                    length: match[0].length,
                    tooltip: 'Denpex: Click to diagnose this GPU/ML failure',
                    matchedText: match[0],
                    terminalName: context.terminal.name,
                });
                break;
            }
        }

        return links;
    }

    handleTerminalLink(link: GpuErrorTerminalLink): void {
        const terminals = vscode.window.terminals;
        const target = terminals.find((t) => t.name === link.terminalName) || vscode.window.activeTerminal;
        if (target) {
            this.onDiagnose(target);
        } else {
            void vscode.commands.executeCommand('denpex.diagnoseCurrentLogs');
        }
    }
}
