import * as https from 'https';
import * as vscode from 'vscode';
import { apiBase, CLIENT_VERSION, PRIVACY_URL } from './api';

export type ExtensionFunnelEvent =
    | 'consent_granted'
    | 'sample_result'
    | 'own_log_result'
    | 'cloud_result'
    | 'team_trial_requested'
    | 'account_connected';

const CONSENT_KEY = 'denpex.extensionFunnelConsent.v1';
const SENT_KEY = 'denpex.extensionFunnelSent.v1';
const ENDPOINT = 'https://api.denpex.com/v1/extension-activation';
const inFlight = new Set<ExtensionFunnelEvent>();

function consent(context: vscode.ExtensionContext): 'allowed' | 'declined' | undefined {
    return context.globalState.get<'allowed' | 'declined'>(CONSENT_KEY);
}

function sentEvents(context: vscode.ExtensionContext): ExtensionFunnelEvent[] {
    const value = context.globalState.get<unknown>(SENT_KEY, []);
    return Array.isArray(value) ? value.filter((event): event is ExtensionFunnelEvent =>
        event === 'consent_granted' || event === 'sample_result' || event === 'own_log_result'
        || event === 'cloud_result' || event === 'team_trial_requested' || event === 'account_connected') : [];
}

function sendCount(event: ExtensionFunnelEvent): Promise<boolean> {
    // An on-prem or user-supplied API endpoint must never silently send usage
    // information to Denpex. Counts are only for the hosted Denpex product.
    if (apiBase().replace(/\/$/, '') !== 'https://api.denpex.com') return Promise.resolve(false);
    const body = JSON.stringify({ schemaVersion: 1, event, clientVersion: CLIENT_VERSION });
    return new Promise((resolve) => {
        const req = https.request(ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                'X-Denpex-Extension-Opt-In': '1',
            },
            timeout: 4_000,
        }, (res) => {
            res.resume();
            res.on('end', () => resolve(res.statusCode === 204));
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => req.destroy());
        req.end(body);
    });
}

export async function recordExtensionFunnelEvent(
    context: vscode.ExtensionContext,
    event: ExtensionFunnelEvent,
    sender: (event: ExtensionFunnelEvent) => Promise<boolean> = sendCount,
): Promise<boolean> {
    if (consent(context) !== 'allowed' || sentEvents(context).includes(event) || inFlight.has(event)) return false;
    inFlight.add(event);
    try {
        if (!await sender(event)) return false;
        await context.globalState.update(SENT_KEY, [...new Set([...sentEvents(context), event])]);
        return true;
    } catch { return false; }
    finally { inFlight.delete(event); }
}

export async function offerExtensionFunnelConsent(
    context: vscode.ExtensionContext,
    sender: (event: ExtensionFunnelEvent) => Promise<boolean> = sendCount,
): Promise<boolean> {
    const existing = consent(context);
    if (existing) return existing === 'allowed';
    const choice = await vscode.window.showInformationMessage(
        'Help improve Denpex? Share anonymous counts of completed sample, own-log, cloud, Team-trial, and account-connection steps. No logs, email addresses, file paths, or machine details are sent. Optional and off until you allow it.',
        'Allow anonymous counts', 'No thanks', 'Privacy policy',
    );
    if (choice === 'Privacy policy') void vscode.env.openExternal(vscode.Uri.parse(PRIVACY_URL));
    const allowed = choice === 'Allow anonymous counts';
    await context.globalState.update(CONSENT_KEY, allowed ? 'allowed' : 'declined');
    if (allowed) {
        void recordExtensionFunnelEvent(context, 'consent_granted', sender);
    }
    return allowed;
}

export async function manageExtensionFunnelConsent(context: vscode.ExtensionContext): Promise<void> {
    const current = consent(context) === 'allowed';
    const choice = await vscode.window.showQuickPick([
        { label: current ? 'Keep anonymous counts enabled' : 'Enable anonymous counts', value: 'allowed' as const },
        { label: 'Disable anonymous counts', value: 'declined' as const },
        { label: 'Read privacy policy', value: 'privacy' as const },
    ], { placeHolder: 'Optional Denpex product-step counts. Never sends logs, email, paths, or machine details.' });
    if (!choice) return;
    if (choice.value === 'privacy') {
        void vscode.env.openExternal(vscode.Uri.parse(PRIVACY_URL));
        return;
    }
    await context.globalState.update(CONSENT_KEY, choice.value);
    if (choice.value === 'allowed') {
        void recordExtensionFunnelEvent(context, 'consent_granted');
    }
    void vscode.window.showInformationMessage(
        choice.value === 'allowed' ? 'Denpex anonymous step counts enabled.' : 'Denpex anonymous step counts disabled.',
    );
}
