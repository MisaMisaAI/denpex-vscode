import * as vscode from 'vscode';
import type { DiagnoseResponse } from './api';
import { SAMPLE_FAILURES } from './samples';

const RECENT_KEY = 'denpex.recentLocalDiagnoses.v1';
const MAX_RECENT = 10;

interface RecentDiagnosis {
    id: string;
    failureType: string;
    source: string;
    diagnosedAt: number;
}

type NodeKind = 'action' | 'group' | 'sample' | 'recent' | 'privacy';

interface SidebarNode {
    kind: NodeKind;
    label: string;
    description?: string;
    tooltip?: string;
    collapsibleState?: vscode.TreeItemCollapsibleState;
    command?: vscode.Command;
    icon?: vscode.ThemeIcon;
    id?: string;
}

export class DenpexSidebarProvider implements vscode.TreeDataProvider<SidebarNode> {
    private readonly changed = new vscode.EventEmitter<SidebarNode | undefined | void>();
    readonly onDidChangeTreeData = this.changed.event;
    private readonly liveResults = new Map<string, DiagnoseResponse>();

    constructor(private readonly context: vscode.ExtensionContext) {}

    refresh(): void {
        this.changed.fire();
    }

    async recordLocal(result: DiagnoseResponse): Promise<void> {
        const failureType = result.meta?.failureType || 'Local diagnosis';
        const diagnosedAt = Date.now();
        const id = `${diagnosedAt}-${Math.random().toString(36).slice(2, 8)}`;
        const record: RecentDiagnosis = {
            id,
            failureType,
            source: result.meta?.source || 'canonical-offline',
            diagnosedAt,
        };
        this.liveResults.set(id, result);
        const recent = [record, ...this.recent().filter((item) => item.id !== id)].slice(0, MAX_RECENT);
        // Store metadata only. Logs, evidence excerpts, and the diagnosis body remain in
        // memory for the current session and are not written to disk behind the user's back.
        await this.context.globalState.update(RECENT_KEY, recent);
        this.refresh();
    }

    openRecent(id: string): DiagnoseResponse | undefined {
        return this.liveResults.get(id);
    }

    getTreeItem(element: SidebarNode): vscode.TreeItem {
        const item = new vscode.TreeItem(element.label, element.collapsibleState ?? vscode.TreeItemCollapsibleState.None);
        item.description = element.description;
        item.tooltip = element.tooltip;
        item.command = element.command;
        item.iconPath = element.icon;
        item.contextValue = `denpex.${element.kind}`;
        return item;
    }

    getChildren(element?: SidebarNode): SidebarNode[] {
        if (!element) {
            return [
                {
                    kind: 'action',
                    label: 'Paste & diagnose clipboard',
                    description: 'one-click',
                    tooltip: 'Diagnose text currently copied in your clipboard. No file selection needed.',
                    command: { command: 'denpex.diagnoseClipboard', title: 'Paste & diagnose clipboard' },
                    icon: new vscode.ThemeIcon('clippy'),
                },
                {
                    kind: 'action',
                    label: 'Scan cluster & Slurm logs',
                    description: 'workspace',
                    tooltip: 'Find and diagnose recent slurm-*.out, slurm-*.err, and GPU failure logs in the workspace.',
                    command: { command: 'denpex.scanClusterLogs', title: 'Scan cluster & Slurm logs' },
                    icon: new vscode.ThemeIcon('search'),
                },
                {
                    kind: 'action',
                    label: 'Diagnose current logs',
                    description: 'cloud/offline',
                    tooltip: 'Diagnose selected text, the current log file, terminal output, or pasted logs.',
                    command: { command: 'denpex.diagnoseCurrentLogs', title: 'Diagnose current logs' },
                    icon: new vscode.ThemeIcon('pulse'),
                },
                {
                    kind: 'action',
                    label: 'Unlock 30-day Scale trial',
                    description: 'in-editor',
                    tooltip: 'Activate 30 days of Scale (50 analyses/day + multi-node reasoning) with your work email.',
                    command: { command: 'denpex.startInEditorTrial', title: 'Unlock 30-day Scale trial' },
                    icon: new vscode.ThemeIcon('key'),
                },
                {
                    kind: 'group',
                    id: 'recent',
                    label: 'Recent local diagnoses',
                    description: String(this.recent().length),
                    collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
                    icon: new vscode.ThemeIcon('history'),
                },
                {
                    kind: 'group',
                    id: 'samples',
                    label: 'Sample failures',
                    description: '5 one-click demos',
                    collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
                    icon: new vscode.ThemeIcon('beaker'),
                },
                {
                    kind: 'privacy',
                    label: 'Local/offline privacy: on',
                    description: 'unlimited',
                    tooltip: 'Local diagnosis is unlimited. Logs leave this machine only when you explicitly run cloud deep reasoning.',
                    command: { command: 'denpex.showPrivacyStatus', title: 'Show privacy status' },
                    icon: new vscode.ThemeIcon('shield'),
                },
            ];
        }
        if (element.id === 'samples') {
            return SAMPLE_FAILURES.map((sample) => ({
                kind: 'sample',
                label: sample.title,
                tooltip: `${sample.description} Runs locally; no account or network required.`,
                command: { command: 'denpex.runSample', title: sample.title, arguments: [sample.id] },
                icon: new vscode.ThemeIcon('play-circle'),
            }));
        }
        if (element.id === 'recent') {
            const recent = this.recent();
            if (!recent.length) {
                return [{
                    kind: 'recent',
                    label: 'No diagnoses yet',
                    description: 'try a sample below',
                    tooltip: 'Run a sample or diagnose one of your own logs.',
                    icon: new vscode.ThemeIcon('info'),
                }];
            }
            return recent.map((record) => ({
                kind: 'recent',
                label: record.failureType,
                description: relativeTime(record.diagnosedAt),
                tooltip: this.liveResults.has(record.id)
                    ? 'Open this local diagnosis from the current VS Code session.'
                    : 'Only privacy-safe metadata persists between sessions; the report body was not stored.',
                command: { command: 'denpex.openRecent', title: 'Open recent diagnosis', arguments: [record.id] },
                icon: new vscode.ThemeIcon('check'),
            }));
        }
        return [];
    }

    private recent(): RecentDiagnosis[] {
        const value = this.context.globalState.get<RecentDiagnosis[]>(RECENT_KEY, []);
        return Array.isArray(value) ? value.filter((item) => item && typeof item.failureType === 'string') : [];
    }
}

function relativeTime(timestamp: number): string {
    const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
    if (seconds < 60) return 'just now';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
}
