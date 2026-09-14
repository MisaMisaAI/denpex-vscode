import * as vscode from 'vscode';
import * as os from 'os';
import { execFile } from 'child_process';
import { DiagnoseResponse } from './api';

function run(cmd: string, args: string[], timeoutMs = 12000): Promise<string | null> {
    return new Promise((resolve) => {
        try {
            execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
                resolve(err && !stdout ? null : String(stdout || '').trim() || null);
            });
        } catch {
            resolve(null);
        }
    });
}

function parseEccCounters(nvidiaSmiQ: string | null): Record<string, string> {
    if (!nvidiaSmiQ) return {};
    const out: Record<string, string> = {};
    const grab = (label: string, re: RegExp) => {
        const m = nvidiaSmiQ.match(re);
        if (m) out[label] = m[1].trim();
    };
    grab('doubleBitAggregate', /Double Bit\s*(?:ECC)?[\s\S]{0,200}?Aggregate[\s\S]{0,80}?Total\s*:\s*(\S+)/i);
    grab('singleBitAggregate', /Single Bit\s*(?:ECC)?[\s\S]{0,200}?Aggregate[\s\S]{0,80}?Total\s*:\s*(\S+)/i);
    grab('retiredPagesDoubleBit', /Double Bit ECC\s*:\s*(\d+)/i);
    grab('pendingPageRetirement', /Pending Page (?:Blacklist|Retirement)\s*:\s*(\S+)/i);
    grab('remappedRowsUncorrectable', /Uncorrectable Error\s*:\s*(\d+)/i);
    grab('remappedRowsPending', /Pending\s*:\s*(Yes|No)/i);
    return out;
}

function extractXidLines(dmesg: string | null, logs?: string): string[] {
    const lines: string[] = [];
    const scan = (text: string | null | undefined) => {
        if (!text) return;
        for (const line of text.split('\n')) {
            if (/NVRM:\s*Xid|\bXid\s+\d+|GPU has fallen off the bus|uncorrectable ECC|double[- ]bit/i.test(line)) {
                lines.push(line.trim());
            }
        }
    };
    scan(dmesg);
    scan(logs);
    return [...new Set(lines)].slice(0, 40);
}

export async function generateRmaPayload(lastDiagnosis?: DiagnoseResponse, lastLogs?: string): Promise<Record<string, unknown>> {
    const isLinux = process.platform === 'linux';
    const [gpuCsv, smiQuery, dmesg, topo, dmidecode] = await Promise.all([
        run('nvidia-smi', ['--query-gpu=index,name,serial,uuid,pci.bus_id,driver_version,vbios_version,memory.total', '--format=csv,noheader']),
        run('nvidia-smi', ['-q', '-d', 'ECC,ROW_REMAPPER,TEMPERATURE,CLOCK']),
        isLinux ? run('bash', ['-lc', 'dmesg -T 2>/dev/null | grep -iE "xid|nvrm|ecc|nvlink|pcie|aer" | tail -80']) : Promise.resolve(null),
        isLinux ? run('nvidia-smi', ['topo', '-m']) : Promise.resolve(null),
        isLinux ? run('bash', ['-lc', 'sudo -n dmidecode -s system-serial-number 2>/dev/null || echo "Requires sudo or dmidecode not installed"']) : Promise.resolve(null),
    ]);

    const gpus = (gpuCsv || '').split('\n').filter(Boolean).map((line) => {
        const [index, name, serial, uuid, pciBusId, driverVersion, vbios, memory] = line.split(',').map((s) => s.trim());
        return { index, name, serial, uuid, pciBusId, driverVersion, vbios, memory };
    });

    const engineRma = lastDiagnosis?.forensicReport?.vendorRmaPayload;

    const payload: Record<string, unknown> = {
        schema: 'denpex.rma.v2',
        generatedAt: new Date().toISOString(),
        generatedBy: 'denpex-vscode',
        host: {
            hostname: os.hostname(),
            platform: `${process.platform} ${os.release()}`,
            arch: os.arch(),
            chassisSerialNumber: dmidecode ? dmidecode.replace(/\r?\n/g, ' ').trim() : 'Unknown',
        },
        gpus: gpus.length ? gpus : 'nvidia-smi unavailable on this machine, run this command on the failing node',
        eccCounters: parseEccCounters(smiQuery),
        xidEvents: extractXidLines(dmesg, lastLogs),
        rawTelemetry: {
            nvidiaSmiQuery: smiQuery ? smiQuery.slice(0, 20000) : null,
            nvlinkTopology: topo ? topo.slice(0, 10000) : null,
            dmesgExcerpt: dmesg ? dmesg.slice(0, 10000) : null,
        }, ...(lastDiagnosis?.meta?.failureType ? {
            denpexDiagnosis: {
                diagnosisId: lastDiagnosis.diagnosisId || null,
                failureType: lastDiagnosis.meta.failureType,
                confidence: lastDiagnosis.meta.confidence,
                summary: lastDiagnosis.fix?.summary || null,
            },
        } : {}), ...(engineRma ? { engineGeneratedTicket: engineRma } : {}),
        vendorInstructions: 'Attach this JSON to your Dell/NVIDIA/Supermicro support case. Serial + UUID identify the exact GPU; the ECC/Xid sections are the fault evidence vendors ask for first. If the vendor explicitly requests full system logs, run `sudo nvidia-bug-report.sh` on the affected node and attach the resulting .gz file.',
    };
    return payload;
}

export async function runGenerateRmaCommand(lastDiagnosis?: DiagnoseResponse, lastLogs?: string): Promise<void> {
    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Denpex: collecting hardware diagnostics (nvidia-smi, dmesg, ECC counters)...' },
        async () => {
            const payload = await generateRmaPayload(lastDiagnosis, lastLogs);
            const hasHardwareEvidence = (payload.xidEvents as string[]).length > 0
                || Object.keys(payload.eccCounters as Record<string, string>).length > 0;

            const doc = await vscode.workspace.openTextDocument({
                language: 'json',
                content: JSON.stringify(payload, null, 2),
            });
            await vscode.window.showTextDocument(doc, { preview: false });

            const note = hasHardwareEvidence
                ? 'Hardware fault evidence found, payload is ready to attach to a vendor ticket.'
                : 'No local hardware fault evidence found. If the fault is on a remote node, open a Remote-SSH window to that node and run this command there.';
            const choice = await vscode.window.showInformationMessage(`Denpex RMA payload generated. ${note}`, 'Copy JSON');
            if (choice === 'Copy JSON') {
                await vscode.env.clipboard.writeText(JSON.stringify(payload, null, 2));
            }
        },
    );
}
