import * as vscode from 'vscode';
import { apiBase, apiKey, attribute, REDEEM_URL } from './api';
import * as https from 'https';
import * as http from 'http';
import { recordExtensionFunnelEvent } from './funnel-events';

const CONSUMER_DOMAINS = new Set([
    'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com',
    'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.com', 'msn.com',
    'aol.com', 'icloud.com', 'me.com', 'mac.com', 'protonmail.com', 'proton.me',
    'gmx.com', 'web.de', 'mail.com', 'zoho.com', 'yandex.com', 'qq.com',
    '163.com', 'naver.com', 'fastmail.com', 'tutanota.com', 'duck.com',
]);

const ANONYMOUS_CLOUD_KEY = 'denpex.anonymousCloudCount';
// The API may require a browser challenge after the first anonymous request.
// VS Code cannot solve that challenge, so promise only the immediate pass here.
const MAX_FREE_ANONYMOUS_CLOUD = 1;

export function getRemainingFreeCloudDiagnoses(context: vscode.ExtensionContext): number {
    if (apiKey()) return 0; // Anonymous passes only. Authenticated allowance comes from quota().
    const used = context.globalState.get<number>(ANONYMOUS_CLOUD_KEY, 0);
    return Math.max(0, MAX_FREE_ANONYMOUS_CLOUD - used);
}

export async function consumeFreeCloudDiagnosis(context: vscode.ExtensionContext): Promise<number> {
    const current = context.globalState.get<number>(ANONYMOUS_CLOUD_KEY, 0);
    const next = current + 1;
    await context.globalState.update(ANONYMOUS_CLOUD_KEY, next);
    return Math.max(0, MAX_FREE_ANONYMOUS_CLOUD - next);
}

export function isConsumerDomain(email: string): boolean {
    const domain = email.split('@').pop()?.trim().toLowerCase() ?? '';
    return CONSUMER_DOMAINS.has(domain);
}

function postJson(urlStr: string, body: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: any }> {
    return new Promise((resolve, reject) => {
        const url = new URL(urlStr);
        const payload = JSON.stringify(body);
        const lib = url.protocol === 'http:' ? http : https;
        const req = lib.request({
            hostname: url.hostname,
            port: url.port || undefined,
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
            },
            timeout: 15000,
        }, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ ok: (res.statusCode || 500) < 400, status: res.statusCode || 500, data: parsed });
                } catch {
                    resolve({ ok: false, status: res.statusCode || 500, data: { message: data } });
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('Trial request timed out. Try again.')));
        req.write(payload);
        req.end();
    });
}

export async function startInEditorTrialFlow(_context: vscode.ExtensionContext): Promise<boolean> {
    const email = await vscode.window.showInputBox({
        title: 'Try Team Free for 30 Days',
        prompt: 'Enter your work email for a single-use link. Established company domains can activate after verification, regardless of mail provider. No card. Uncertain domains can request review.',
        placeHolder: 'alex@yourcompany.com',
        ignoreFocusOut: true,
        validateInput: (val) => {
            const trimmed = val.trim();
            if (!trimmed || !trimmed.includes('@') || !trimmed.includes('.')) {
                return 'Enter a valid email address (e.g. name@company.com)';
            }
            if (isConsumerDomain(trimmed)) {
                return 'Team evaluations require a work email domain (e.g. @company.com, not @gmail.com)';
            }
            return null;
        },
    });

    if (!email) return false;

    const endpoint = `${apiBase()}/api/trial/request`;
    let res: { ok: boolean; status: number; data: any };
    try {
        res = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Requesting Denpex Team evaluation...',
            cancellable: false,
        }, async () => postJson(endpoint, { email: email.trim(), source: 'vscode-extension' }));
    } catch (err: any) {
        void vscode.window.showErrorMessage(`Denpex: could not request evaluation (${err?.message || 'network error'})`);
        return false;
    }

    if (!res.ok) {
        const msg = res.data?.message || res.data?.error || `Request failed (HTTP ${res.status})`;
        void vscode.window.showErrorMessage(`Denpex: ${msg}`);
        return false;
    }

    void recordExtensionFunnelEvent(_context, 'team_trial_requested');

    void vscode.window.showInformationMessage(
        `Check ${email.trim()} for your trial link and sign in with that same address. After activation, choose Connect Account here. No card or automatic subscription. Local diagnosis remains available.`,
        'Connect Account', 'Activation help',
    ).then((choice) => {
        if (choice === 'Connect Account') {
            void vscode.commands.executeCommand('denpex.connectAccount');
        } else if (choice === 'Activation help') {
            void vscode.window.showInformationMessage('Open your emailed link within 7 days of the first request. Company verification is required; uncertain domains need support review. For an expired link or review, contact support@denpex.com.', 'Open Redeem Page').then((action) => {
                if (action === 'Open Redeem Page') {
            void vscode.env.openExternal(vscode.Uri.parse(attribute(REDEEM_URL, 'trial')));
                }
            });
        }
    });
    return true;
}
