import * as vscode from 'vscode';
import * as https from 'https';
import { createHash, randomBytes } from 'crypto';
import { apiBase, apiKey, storeApiKey } from './api';
import { recordExtensionFunnelEvent } from './funnel-events';

const PENDING = 'denpex.pendingConnection.v1';
let connecting = false;
type Pending = { key: string; deviceCode: string; userCode: string; expiresAt: number };
class ConnectionError extends Error {
    constructor(message: string, readonly status: number) { super(message); }
}

function post(action: string, body: Record<string, unknown>, credential?: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = https.request(`https://api.denpex.com/api/extension-connect/${action}`, {
            method: 'POST', timeout: 15_000,
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data),
                ...(credential ? { Authorization: `Bearer ${credential}` } : {}) },
        }, (res) => {
            let response = '';
            res.on('data', (chunk) => {
                response += chunk;
                if (response.length > 8192) req.destroy(new Error('Unexpected connection response'));
            });
            res.on('end', () => {
                try {
                    const value = JSON.parse(response);
                    if ((res.statusCode || 500) >= 400) reject(new ConnectionError(value.error || 'Connection expired. Start again.', res.statusCode || 500));
                    else resolve(value);
                } catch { reject(new Error('Unable to read connection response. Try again.')); }
            });
            res.on('error', reject);
        });
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('Connection timed out. Run Connect Account to retry.')));
        req.end(data);
    });
}

export async function disconnectAccount(context: vscode.ExtensionContext): Promise<void> {
    if (connecting) { void vscode.window.showInformationMessage('Finish or cancel the pending connection first.'); return; }
    const key = apiKey();
    if (!key) { void vscode.window.showInformationMessage('No Denpex account is connected.'); return; }
    if (apiBase() !== 'https://api.denpex.com') {
        void vscode.window.showInformationMessage('Revoke the key on your configured server, then clear it with Denpex: Set API Key.');
        return;
    }
    const choice = await vscode.window.showWarningMessage(
        'Revoke this API key and disconnect? Other clients sharing this key will also lose access. Local diagnosis remains available.',
        { modal: true }, 'Revoke and disconnect',
    );
    if (choice !== 'Revoke and disconnect') return;
    try {
        await post('disconnect', {}, key);
        await storeApiKey(context.secrets, '');
        await context.secrets.delete(PENDING);
        void vscode.window.showInformationMessage('Denpex disconnected and the credential revoked. Local diagnosis remains available.');
    } catch {
        void vscode.window.showErrorMessage('Could not complete disconnection. Retry or revoke the key in Dashboard > Monitoring > API Keys.');
    }
}

export async function connectAccount(context: vscode.ExtensionContext): Promise<void> {
    if (connecting) { void vscode.window.showInformationMessage('A Denpex connection is already waiting for approval.'); return; }
    if (apiBase() !== 'https://api.denpex.com') {
        void vscode.window.showInformationMessage('Browser connection is for hosted Denpex. Use Denpex: Set API Key for your configured server.');
        return;
    }
    connecting = true;
    try {
        const saved = await context.secrets.get(PENDING);
        let pending: Pending | undefined;
        try { pending = saved ? JSON.parse(saved) : undefined; } catch { /* replace invalid local state */ }
        if (pending) {
            // Approval can finish while the editor is closed. Recover before replacing it.
            const recovered = await post('poll', { deviceCode: pending.deviceCode }).catch((error) => {
                if (error instanceof ConnectionError && error.status === 410) return null;
                throw error; // Do not discard a recoverable credential during an outage.
            });
            if (recovered?.status === 'approved') {
                await storeApiKey(context.secrets, pending.key);
                await context.secrets.delete(PENDING);
                void recordExtensionFunnelEvent(context, 'account_connected');
                void vscode.window.showInformationMessage('Denpex connected. Your previous approval was recovered.');
                return;
            }
            if (!recovered || recovered.status === 'denied') pending = undefined;
        }
        if (!pending || pending.expiresAt <= Date.now()) {
            const key = `dpx_${randomBytes(16).toString('hex')}`;
            const result = await post('start', {
                keyHash: createHash('sha256').update(key).digest('hex'),
                keyDisplay: `${key.slice(0, 8)}...${key.slice(-4)}`,
            });
            if (!/^[a-f0-9]{64}$/.test(result.deviceCode) || !/^[A-F0-9]{4}-[A-F0-9]{4}$/.test(result.userCode)) {
                throw new Error('Invalid connection response. No credential was installed.');
            }
            pending = { key, deviceCode: result.deviceCode, userCode: result.userCode, expiresAt: Date.now() + 600_000 };
            // Persist before opening the browser. An editor reload must not lose the credential.
            await context.secrets.store(PENDING, JSON.stringify(pending));
        }
        const session = pending;
        const choice = await vscode.window.showInformationMessage(
            `Connect Denpex: enter ${session.userCode} in your browser. Approve only if the code matches. No logs are uploaded.`,
            'Open approval page', 'Not now',
        );
        if (choice !== 'Open approval page') return;
        const opened = await vscode.env.openExternal(vscode.Uri.parse('https://denpex.com/connect/vscode'));
        if (!opened) throw new Error('Could not open your browser. Visit https://denpex.com/connect/vscode and run Connect Account again.');
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification,
            title: `Denpex: waiting for approval (${session.userCode})`, cancellable: true }, async (_progress, cancel) => {
            while (!cancel.isCancellationRequested && Date.now() < session.expiresAt) {
                const result = await post('poll', { deviceCode: session.deviceCode });
                if (result.status === 'approved') {
                    await storeApiKey(context.secrets, session.key);
                    await context.secrets.delete(PENDING);
                    void recordExtensionFunnelEvent(context, 'account_connected');
                    void vscode.window.showInformationMessage('Denpex connected. Return to your diagnosis and choose a cloud review when ready. No log was uploaded.');
                    return;
                }
                if (result.status === 'denied' || result.status === 'expired') break;
                await new Promise<void>((resolve) => {
                    const timer = setTimeout(() => { listener.dispose(); resolve(); }, 10000);
                    const listener = cancel.onCancellationRequested(() => { clearTimeout(timer); listener.dispose(); resolve(); });
                });
            }
            void vscode.window.showInformationMessage('Connection paused or expired. Run Denpex: Connect Account to continue. Local diagnosis remains available.');
        });
    } catch (err) {
        void vscode.window.showErrorMessage(`Denpex: ${err instanceof Error ? err.message : 'Connection failed. Try again.'}`);
    } finally { connecting = false; }
}
