const EVIDENCE_RE = /error|fail|fatal|traceback|exception|assert|panic|segfault|xid|nvrm|ecc|fallen off the bus|nccl|cuda|oom|out of memory|timeout|nan\b|\binf\b|node_fail|killed|terminated|version|driver|kernel|container|slurm|kubernetes|rank|node|host|gpu|pci|topology|nvlink|nvswitch|infiniband|rdma|roce/i;
const CAUSAL_RE = /fatal|critical|traceback|exception|assert|panic|segfault|xid|uncorrectable|fallen off the bus|out of memory|watchdog timeout|crc mismatch|loss\s*=\s*(?:nan|inf)|insufficient|unhealthy|ibv_modify_qp|no space left|compil(?:e|ation) (?:error|failed)|no available memory|checksum mismatch|childfailederror|backendcompilerfailed|failedscheduling|input\/output error|nonfinite|divergence|first failure|initiator|caused by/i;
const MAX_LINE_CHARS = 2_000;

function clipLine(line: string): string {
    if (line.length <= MAX_LINE_CHARS) return line;
    const marker = ' [line clipped by Denpex] ';
    const side = Math.max(1, Math.floor((MAX_LINE_CHARS - marker.length) / 2));
    return `${line.slice(0, side)}${marker}${line.slice(-side)}`.slice(0, MAX_LINE_CHARS);
}

function selectByCharacters(logs: string, max: number): string {
    const lines = logs.split(/\r?\n/);
    const candidates = new Map<number, number>();
    const add = (index: number, radius: number, priority: number) => {
        for (let i = Math.max(0, index - radius); i <= Math.min(lines.length - 1, index + radius); i++) {
            candidates.set(i, Math.max(priority, candidates.get(i) ?? 0));
        }
    };
    for (let i = 0; i < Math.min(48, lines.length); i++) candidates.set(i, 300);
    for (let i = Math.max(0, lines.length - 96); i < lines.length; i++) candidates.set(i, 800);
    let foundFirst = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? '';
        if (!EVIDENCE_RE.test(line)) continue;
        const causal = CAUSAL_RE.test(line);
        add(i, causal ? 3 : 1, causal ? 1_000 : 700);
        if (!foundFirst) {
            add(i, 6, 1_100);
            foundFirst = true;
        }
    }
    const warning = `[Denpex condensed input: input exceeded the VS Code request limit. Environment, causal, rank, topology, middle, and final-tail evidence were selected.]`;
    let used = warning.length;
    const selected = new Set<number>();
    for (const [index] of [...candidates].sort((a, b) => b[1] - a[1] || a[0] - b[0])) {
        const line = clipLine(lines[index] ?? '');
        if (used + line.length + 1 > max) continue;
        selected.add(index);
        used += line.length + 1;
    }
    return [warning, ...[...selected].sort((a, b) => a - b).map((index) => clipLine(lines[index] ?? ''))].join('\n');
}

export function selectEvidenceForRequest(logs: string, maxBytes: number): { text: string; truncated: boolean } {
    if (Buffer.byteLength(logs, 'utf8') <= maxBytes) return { text: logs, truncated: false };
    let budget = maxBytes;
    let text = selectByCharacters(logs, budget);
    while (Buffer.byteLength(text, 'utf8') > maxBytes && budget > 512) {
        budget = Math.max(512, Math.floor(budget * 0.8));
        text = selectByCharacters(logs, budget);
    }
    return { text, truncated: true };
}
