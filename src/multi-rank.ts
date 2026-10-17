import * as fs from 'fs';
import * as readline from 'readline';
import * as vscode from 'vscode';

export interface LogLineInfo {
    rank: number;
    timestamp: string | null;
    rawText: string;
    lineNumber: number;
    isError: boolean;
    isWatchdogTimeout: boolean;
}

export interface RankAnalysis {
    rank: number;
    uri: vscode.Uri;
    totalLines: number;
    errorCount: number;
    firstErrorLine: LogLineInfo | null;
    isPatientZero: boolean;
}

export interface MultiRankReport {
    ranks: RankAnalysis[];
    patientZeroRank: number | null;
    summary: string;
}

const ERROR_PATTERNS = [
    /error/i,
    /exception/i,
    /traceback \(most recent call last\):/i,
    /segmentation fault/i,
    /cuda error/i,
    /nccl error/i,
    /outofmemoryerror/i,
    /device-side assert/i
];

const WATCHDOG_PATTERNS = [
    /watchdog caught/i,
    /distributed package watchdog/i,
    /timed out/i,
    /net_gloo/i,
    /ncclCommunicator/i,
    /workNCCL.*timed out/i
];

export async function analyzeMultiRankLogs(fileUris: vscode.Uri[]): Promise<MultiRankReport> {
    const analysisPromises = fileUris.map(async (uri, index) => {
        const match = uri.fsPath.match(/(?:rank[._-]?|gpu[._-]?|[\-_])(\d+)/i);
        const rank = match ? parseInt(match[1], 10) : index;
        return scanLogFile(uri, rank);
    });

    const rankAnalyses = await Promise.all(analysisPromises);

    let patientZeroRank: number | null = null;
    let earliestError: { rank: number; line: LogLineInfo } | null = null;

    for (const analysis of rankAnalyses) {
        if (!analysis.firstErrorLine) {
            continue;
        }

        // Prioritize non-watchdog root errors over pure timeout cascades
        const isTimeoutOnly = analysis.firstErrorLine.isWatchdogTimeout && !analysis.firstErrorLine.isError;
        if (isTimeoutOnly && earliestError && !earliestError.line.isWatchdogTimeout) {
            continue;
        }

        if (!earliestError) {
            earliestError = { rank: analysis.rank, line: analysis.firstErrorLine };
        } else {
            const currentTs = analysis.firstErrorLine.timestamp;
            const earliestTs = earliestError.line.timestamp;

            if (currentTs && earliestTs) {
                if (currentTs < earliestTs) {
                    earliestError = { rank: analysis.rank, line: analysis.firstErrorLine };
                }
            } else if (analysis.firstErrorLine.lineNumber < earliestError.line.lineNumber) {
                earliestError = { rank: analysis.rank, line: analysis.firstErrorLine };
            }
        }
    }

    if (earliestError) {
        patientZeroRank = earliestError.rank;
        for (const analysis of rankAnalyses) {
            analysis.isPatientZero = (analysis.rank === patientZeroRank);
        }
    }

    const summary = patientZeroRank !== null
        ? `Patient zero identified as Rank ${patientZeroRank}. Other ranks show cascading errors or watchdog timeouts.`
        : 'No explicit error signatures identified across analyzed rank logs.';

    return {
        ranks: rankAnalyses,
        patientZeroRank,
        summary
    };
}

async function scanLogFile(uri: vscode.Uri, rank: number): Promise<RankAnalysis> {
    const fileStream = fs.createReadStream(uri.fsPath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let totalLines = 0;
    let errorCount = 0;
    let firstErrorLine: LogLineInfo | null = null;

    const timestampRegex = /\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?/;

    for await (const line of rl) {
        totalLines++;
        const tsMatch = line.match(timestampRegex);
        const timestamp = tsMatch ? tsMatch[0] : null;

        const isError = ERROR_PATTERNS.some(p => p.test(line));
        const isWatchdogTimeout = WATCHDOG_PATTERNS.some(p => p.test(line));

        if (isError || isWatchdogTimeout) {
            errorCount++;
            if (!firstErrorLine) {
                firstErrorLine = {
                    rank,
                    timestamp,
                    rawText: line.trim(),
                    lineNumber: totalLines,
                    isError,
                    isWatchdogTimeout
                };
            }
        }
    }

    return {
        rank,
        uri,
        totalLines,
        errorCount,
        firstErrorLine,
        isPatientZero: false
    };
}
