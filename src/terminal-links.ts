import * as vscode from 'vscode';

export interface GpuErrorTerminalLink extends vscode.TerminalLink {
    matchedText: string;
    terminalName: string;
    lineContent: string;
}

const GPU_ERROR_PATTERNS: readonly RegExp[] = [
    /torch\.OutOfMemoryError|CUDA out of memory/i,
    /RuntimeError:\s*(?:CUDA error|Expected all tensors|CUDA out of memory|illegal memory access|device-side assert|[^\n]{1,80})/i,
    /NCCL WARN|ProcessGroupNCCL.*Watchdog caught collective|NCCL error/i,
    /NVRM:\s*Xid\s*(?:\(PCI:[^)]+\):)?\s*\d+/i,
    /torch\.distributed\.(?:DistBackendError|elastic)/i,
    /vLLM.*(?:EngineCoreError|KV-?cache exhaustion|out of memory)/i,
    /srun:\s*error:\s*.*Exited with exit code [1-9]/i,
    /CUDA kernel errors might be asynchronously reported/i,
    /CUDA error: (?:illegal memory access|device-side assert|out of memory)/i,
    /deepspeed\.runtime\.zero|DeepSpeedException/i,
    /RayTaskError|RaySystemError/i,
    /ECC uncorrectable error|Double Bit ECC Error|GPU fallen off the bus/i,
    /slurmstepd: error:.*(?:NODE_FAIL|OOM|CANCELLED)/i,
    /(?:OutOfMemoryError|ResourceExhaustedError|HorovodInternalError|XlaRuntimeError):/i,
    /kubelet\.go.*evicted.*(?:memory|OOM)/i,
    /\b(?:OOMKilled|oom-killer|out of memory)\b/i,
];

export class DenpexTerminalLinkProvider implements vscode.TerminalLinkProvider<GpuErrorTerminalLink> {
    constructor(private readonly onDiagnose: (terminal: vscode.Terminal | undefined, lineText?: string) => void) {}

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
                    lineContent: line,
                });
                break;
            }
        }

        return links;
    }

    handleTerminalLink(link: GpuErrorTerminalLink): void {
        const terminals = vscode.window.terminals;
        const target = terminals.find((t) => t.name === link.terminalName) || vscode.window.activeTerminal;
        this.onDiagnose(target, link.lineContent || link.matchedText);
    }
}
