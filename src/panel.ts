import * as vscode from 'vscode';
import { DASHBOARD_URL, SITE_URL, attribute, DiagnoseResponse } from './api';

export function escapeHtml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function nonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
}

function parseJsonArray(raw: unknown): any[] {
    if (Array.isArray(raw)) return raw;
    if (typeof raw !== 'string' || !raw.trim()) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        // Server caps stringified chains at 1200 chars, which can cut mid-object.
        // Recover every complete object we can rather than dropping the section.
        const objects: any[] = [];
        const matches = raw.match(/\{[^{}]*\}/g) || [];
        for (const m of matches) {
            try { objects.push(JSON.parse(m)); } catch { /* skip partial tail */ }
        }
        return objects;
    }
}

function section(title: string, bodyHtml: string, open = false, id?: string): string {
    if (!bodyHtml) return '';
    return `<details${id ? ` id="${escapeHtml(id)}"` : ''}${open ? ' open' : ''}><summary>${escapeHtml(title)}</summary><div class="section-body">${bodyHtml}</div></details>`;
}

function pre(text: unknown): string {
    return `<pre><code>${escapeHtml(text)}</code></pre>`;
}

/**
 * Narrow a nullable wire string to a non-empty string, else undefined.
 * The worker sends `null` (not an absent key) for "no note", and a whitespace-only
 * note would otherwise render an empty warning box that reads as a real warning.
 */
function str(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
}

function actionBlock(label: string, command: string | null | undefined, kind: 'exec' | 'copy' = 'copy'): string {
    if (!command) return '';
    const unavailable = /^unavailable:/i.test(command);
    const btns = kind === 'exec'
        ? `<button type="button" class="btn" data-cmd="runInTerminal" data-text="${escapeHtml(command)}">▶ Execute</button><button type="button" class="btn ghost" data-cmd="insertInTerminal" data-text="${escapeHtml(command)}" title="Insert at terminal prompt without executing">$ Insert</button>`
        : '';
    const copy = unavailable ? '' : `<button type="button" class="btn ghost" data-cmd="copy" data-text="${escapeHtml(command)}">Copy</button>`;
    const body = kind === 'exec' ? pre(command) : `<p class="action-copy">${escapeHtml(command)}</p>`;
    return `<div class="action"><div class="action-head"><strong>${escapeHtml(label)}</strong><span class="btns">${btns}${copy}</span></div>${body}</div>`;
}

function confidenceBar(confidence: number): string {
    const pct = Math.max(0, Math.min(100, Math.round(confidence)));
    const tone = pct >= 80 ? 'var(--vscode-testing-iconPassed)' : pct >= 55 ? 'var(--vscode-editorWarning-foreground)' : 'var(--vscode-editorError-foreground)';
    return `<div class="conf" role="progressbar" aria-label="Diagnosis confidence" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><div class="conf-track" aria-hidden="true"><div class="conf-fill" style="width:${pct}%;background:${tone}"></div></div><span>${pct}% confidence</span></div>`;
}

export function generateIncidentMarkdown(d: DiagnoseResponse): string {
    const fix = d.fix || {};
    const meta = d.meta || {};
    const chain = parseJsonArray(fix.causationChain);
    const initiator = chain.find((c: any) => String(c.role || '').toLowerCase().includes('initiator')) || chain[0];

    const lines: string[] = [
        '### GPU Crash Incident Summary (Denpex)',
        `- **Failure Type**: ${meta.failureType || 'Distributed GPU / ML Incident'}`,
        `- **Diagnosis Tier**: ${meta.tier === 4 ? 'Deep Cloud Analysis' : 'Deterministic Engine'}`,
    ];

    if (initiator && initiator.event) {
        lines.push(`- **Root Cause**: ${initiator.event}`);
    } else if (fix.summary) {
        lines.push(`- **Root Cause**: ${fix.summary}`);
    }

    if (d.costHeadline) {
        lines.push(`- **Impact**: ${d.costHeadline}`);
    }

    if (d.resumeSafetyNote) {
        lines.push(`- **Checkpoint Safety**: ${d.resumeSafetyNote}`);
    }

    if (fix.action) {
        lines.push('\n#### Recommended Fix');
        lines.push('```bash');
        lines.push(fix.action);
        lines.push('```');
    }

    if (fix.fallbackAction) {
        lines.push('\n#### Fallback Action');
        lines.push('```bash');
        lines.push(fix.fallbackAction);
        lines.push('```');
    }

    if (fix.verificationCommand) {
        lines.push('\n#### Verification Command');
        lines.push('```bash');
        lines.push(fix.verificationCommand);
        lines.push('```');
    }

    // This report is pasted by the user into Slack or a GitHub PR, so this link is the
    // only one that reaches people who have not installed anything. Attributed for that
    // reason: it is the extension's single measurable word-of-mouth surface.
    lines.push(`\n*Diagnosed with Denpex GPU & ML Crash Diagnostics (${attribute(SITE_URL, 'incident-report')})*`);
    return lines.join('\n');
}

export function renderDiagnosis(d: DiagnoseResponse, focusSection?: string): string {
    const fix = d.fix || {};
    const meta = d.meta || {};
    const n = nonce();

    const tierLabel = meta.tier === 4 ? 'Deep Analysis' : meta.tier === 2 ? 'Community Match' : meta.tier === 1.5 ? 'Encyclopedia' : meta.tier === 1.6 ? 'Keyword Match' : 'Deterministic Engine';
    const badges = [
        `<span class="badge">${escapeHtml(tierLabel)}</span>`,
        d.costHeadline ? `<span class="badge cost">${escapeHtml(d.costHeadline)}</span>` : '',
    ].filter(Boolean).join(' ');
    const isLocal = d.source === 'canonical-offline'
        || meta.source === 'canonical-offline'
        || /offline|local/i.test(String(d.source || meta.source || ''));
    const nextActionHtml = isLocal
        ? `<div class="next-actions" aria-label="Optional next actions">
            <div class="next-heading"><strong>Continue investigating</strong><span class="meta">Local diagnosis is free, unlimited, and private.</span></div>
            <button type="button" class="btn" data-cmd="diagnoseOwnLog">Try my own log</button>
            <button type="button" class="btn ghost" data-cmd="copyIncidentReport">Copy Slack/PR Report</button>
            <details class="cloud-option"><summary>Need deeper analysis?</summary><p class="meta">Cloud review sends this log to Denpex only if you choose it.</p><button type="button" class="btn cloud" data-cmd="escalateCloud">Try one free cloud review</button><button type="button" class="btn ghost" data-cmd="startInEditorTrial">Try Team free for 30 days</button></details>
        </div>`
        : `<div class="next-actions">
            <button type="button" class="btn ghost" data-cmd="copyIncidentReport">📋 Copy Slack/PR Report</button>
            <button type="button" class="btn ghost" data-cmd="open" data-text="${escapeHtml(attribute(DASHBOARD_URL, 'dashboard'))}">Save or share in Dashboard</button>
        </div>`;

    // ── Traceback / causal chain analysis ──
    const chain = parseJsonArray(fix.causationChain);
    const chainHtml = chain.length ? `<ol class="chain">${chain.map((c: any) => `
        <li class="chain-${escapeHtml(String(c.role || '').toLowerCase().replace(/_/g, '-'))}">
            <span class="chain-role">${escapeHtml(c.role || '')}</span>
            <div>${escapeHtml(c.event || '')}</div>
            ${c.evidence ? `<code class="evidence-line">${escapeHtml(c.evidence)}</code>` : ''}
        </li>`).join('')}</ol>` : '';
    const evidence = Array.isArray(fix.evidence) ? [...new Set(fix.evidence.filter(Boolean))] : [];
    const evidenceHtml = evidence.length ? `<ul>${evidence.slice(0, 6).map((e) => `<li><code>${escapeHtml(e)}</code></li>`).join('')}</ul>${evidence.length > 6 ? `<details><summary>Show ${evidence.length - 6} more evidence lines</summary><ul>${evidence.slice(6).map((e) => `<li><code>${escapeHtml(e)}</code></li>`).join('')}</ul></details>` : ''}` : '';
    const tracebackBody = (chainHtml || evidenceHtml)
        ? `${chainHtml}${evidenceHtml ? `<h3>Matched evidence</h3>${evidenceHtml}` : ''}` : '';

    // ── Competing hypotheses ──
    const hyps = parseJsonArray(fix.competingHypotheses);
    const hypsHtml = hyps.length ? `<table><tr><th>Theory</th><th>Score</th><th>Supporting</th><th>Contradicting</th></tr>${hyps.map((h: any) => `
        <tr><td>${escapeHtml(h.theory || '')}</td><td>${escapeHtml(h.score ?? '')}</td><td>${escapeHtml(h.supporting || '')}</td><td>${escapeHtml(h.contradicting || '')}</td></tr>`).join('')}</table>` : '';

    // ── Confidence detail ──
    const fr = d.forensicReport || {};
    const artifacts = Array.isArray(fr.diagnosticArtifacts) ? fr.diagnosticArtifacts.slice(0, 5) : [];
    const artifactHtml = artifacts.length ? section('GPU artifact measurements', artifacts.map((artifact: any) => {
        const names: Record<string, string> = { 'flight-recorder': 'Collective flight recorder', 'memory-snapshot': 'CUDA memory snapshot',
            nsight: 'Nsight kernel trace', checkpoints: 'Checkpoint candidates', stragglers: 'Aligned rank timings' };
        const devices = artifact.module === 'memory-snapshot' && Array.isArray(artifact.metrics?.devices) ? artifact.metrics.devices.slice(0, 256) : [];
        const mib = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? `${(value / 1048576).toFixed(2)} MiB` : 'Unknown';
        const table = devices.length ? `<div role="region" tabindex="0" aria-label="CUDA memory measurements" style="overflow:auto"><table><caption>Per-device allocator memory</caption><thead><tr><th scope="col">GPU</th><th scope="col">Reserved</th><th scope="col">Requested</th><th scope="col">Awaiting free</th><th scope="col">Inactive</th></tr></thead><tbody>${devices.map((device: any) => `<tr><td>${escapeHtml(device.device)}</td><td>${mib(device.reservedBytes)}</td><td>${mib(device.requestedBytes)}</td><td>${mib(device.awaitingFreeBytes)}</td><td>${mib(device.inactiveBytes)}</td></tr>`).join('')}</tbody></table></div>` : pre(JSON.stringify(artifact.metrics || {}, null, 2));
        const limitations = Array.isArray(artifact.limitations) ? `<ul>${artifact.limitations.map((item: unknown) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '';
        const findings = Array.isArray(artifact.findings) ? `<ul>${artifact.findings.map((finding: any) => `<li>${escapeHtml(finding.detail)}</li>`).join('')}</ul>` : '';
        return `<p><strong>${escapeHtml(names[artifact.module] || 'GPU artifact')}</strong>: ${artifact.status === 'COMPLETE' ? 'Local inspection completed' : 'Inspection incomplete'}.</p>${table}${findings}${limitations}`;
    }).join(''), true, 'gpu-artifacts') : '';
    const confDetail = fr.confidenceDetail || {};
    const confParts: string[] = [];
    // CALIBRATED value only. This read `meta.confidence`, the raw score, which
    // includes confidence bands whose measured top-1 accuracy does not justify
    // printing a number. The API already decides that and returns
    // `fix.confidenceDisplay: null` to mean "withheld", a distinct claim from
    // "zero", so it is checked with an explicit typeof rather than coerced.
    //
    // When it IS withheld, say so: a missing bar reads as "no confidence data",
    // which understates a verdict the engine is otherwise sure about.
    const displayConfidence = fix.confidenceDisplay;
    if (typeof displayConfidence === 'number') {
        confParts.push(confidenceBar(displayConfidence));
    } else if (fix.confidenceBand) {
        confParts.push(`<p class="muted">Confidence: ${escapeHtml(fix.confidenceBand)}, a precise figure is withheld because this calibration band is not accurate enough to report.</p>`);
    }
    const confList = (label: string, items: unknown) => Array.isArray(items) && items.length
        ? `<h3>${escapeHtml(label)}</h3><ul>${(items as unknown[]).map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>` : '';
    confParts.push(confList('Supporting', confDetail.supporting));
    confParts.push(confList('Contradicting', confDetail.contradicting));
    confParts.push(confList('Unknowns', confDetail.unknowns));
    confParts.push(confList('Missing telemetry', confDetail.missingTelemetry));
    const confBody = confParts.filter(Boolean).join('');

    // ── Hardware telemetry ──
    const hwParts: string[] = [];
    const detectors = d.advanced?.detectors || [];
    if (detectors.length) {
        hwParts.push(`<table><tr><th>Detector</th><th>Severity</th><th>Finding</th></tr>${detectors.map((det) =>
            `<tr><td>${escapeHtml(det.title || det.id || '')}</td><td>${escapeHtml(det.severity || '')}</td><td>${escapeHtml(det.summary || '')}</td></tr>`).join('')}</table>`);
    }
    const telemetryEvidence = (fr as any).telemetryEvidence || {};
    if (Array.isArray(telemetryEvidence.indicting) && telemetryEvidence.indicting.length) {
        hwParts.push(`<h3>Indicting signals</h3><ul>${telemetryEvidence.indicting.map((s: string) => `<li><code>${escapeHtml(s)}</code></li>`).join('')}</ul>`);
    }
    if (Array.isArray(telemetryEvidence.exonerating) && telemetryEvidence.exonerating.length) {
        hwParts.push(`<h3>Exonerating signals</h3><ul>${telemetryEvidence.exonerating.map((s: string) => `<li><code>${escapeHtml(s)}</code></li>`).join('')}</ul>`);
    }
    if (fr.predictiveMaintenance) {
        const pm = fr.predictiveMaintenance;
        hwParts.push(`<p><strong>Predictive maintenance:</strong> ${escapeHtml(pm.metric || '')}, ${escapeHtml(pm.probabilityOfFailure ?? '?')}% failure risk within ${escapeHtml(pm.timeframe || 'N/A')}. ${escapeHtml(pm.recommendation || '')}</p>`);
    }
    if (d.advanced?.predictive?.score) {
        const p = d.advanced.predictive;
        hwParts.push(`<p><strong>Degradation forecast:</strong> score ${escapeHtml(p.score)} (${escapeHtml(p.level || '')}), ${escapeHtml((p.signals || []).join(', '))}</p>`);
    }
    const hwBody = hwParts.join('');

    // ── Recommended actions ladder ──
    const steps = Array.isArray(fix.steps) && fix.steps.length ? `<h3>Full fix procedure</h3><ol>${fix.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>` : '';
    const planActions = d.executionPlan?.actions || [];
    const planActionKind = str(d.resumeSafetyNote) ? 'copy' : 'exec';
    const planHtml = planActions.length ? `<h3>Closed-loop remediation plan</h3>${planActions.map((a) =>
        actionBlock(`${a.action || 'STEP'}, ${a.reason || ''}`, a.command, planActionKind)).join('')}` : '';

    const textToScan = `${d.meta?.failureType || ''} ${fix.summary || ''} ${Array.isArray(fix.evidence) ? fix.evidence.join(' ') : ''}`.toLowerCase();
    const envActions: string[] = [];
    if (textToScan.includes('nccl') || textToScan.includes('timeout') || textToScan.includes('watchdog') || textToScan.includes('processgroup')) {
        envActions.push(actionBlock('Distributed Debugging', 'export TORCH_DISTRIBUTED_DEBUG=DETAIL'));
        envActions.push(actionBlock('NCCL Socket Fallback', 'export NCCL_IB_DISABLE=1 NCCL_DEBUG=INFO'));
    }
    if (textToScan.includes('out of memory') || textToScan.includes('oom')) {
        envActions.push(actionBlock('PyTorch Allocator Fragmentation Guard', 'export PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:128'));
    }
    if (textToScan.includes('xid') || textToScan.includes('bus error') || textToScan.includes('fallen off')) {
        envActions.push(actionBlock('Hardware ECC & State Probe', 'nvidia-smi -q -d ECC,VOLTAGE,TEMPERATURE'));
    }
    const envMatrixHtml = envActions.length ? `<h3>Remediation Environment Flags</h3>${envActions.join('')}` : '';

    const actionsBody = [
        actionBlock('Primary fix', fix.action),
        actionBlock('If that doesn\'t work', fix.fallbackAction),
        actionBlock('Emergency mitigation', fix.emergencyAction),
        actionBlock('Verify the fix', fix.verificationCommand),
        envMatrixHtml,
        fix.prevention ? `<div class="action"><strong>Prevention</strong><p>${escapeHtml(fix.prevention)}</p></div>` : '',
        steps,
        planHtml,
    ].filter(Boolean).join('');

    // ── Advisories ──
    const advisories = d.advisory || [];
    const advBody = advisories.length ? advisories.map((a) =>
        `<div class="advisory advisory-${escapeHtml(a.severity || 'info')}"><strong>${escapeHtml(a.summary || '')}</strong><p>${escapeHtml(a.action || '')}</p></div>`).join('') : '';

    // ── Alternatives ──
    const alts = fix.alternatives || [];
    const altBody = alts.length ? `<ul>${alts.map((a) => `<li><strong>${escapeHtml(a.title || a.failureType || '')}</strong>${typeof a.confidence === 'number' ? ` (${escapeHtml(a.confidence)}%)` : ''}</li>`).join('')}</ul>` : '';

    // ── Sources ──
    const refs = [...(d.communityRefs || []), ...(d.researchRefs || [])];
    const refBody = refs.length ? `<ul>${refs.map((r) => `<li><a href="#" data-cmd="open" data-text="${escapeHtml((r as any).url || '')}">${escapeHtml(r.title || (r as any).url || '')}</a> <span class="dim">${escapeHtml((r as any).source || '')}</span></li>`).join('')}</ul>` : '';

    // ── Prior incident / clarifying questions ──
    const prior = d.priorIncident?.note ? `<div class="advisory advisory-info"><strong>You've hit this before</strong><p>${escapeHtml(d.priorIncident.note)}</p>${d.priorIncident.action ? pre(d.priorIncident.action) : ''}</div>` : '';
    // Structured questions preferred; the plain list is the fallback for an older worker.
    // `(Recommended)` is emitted ONLY for an `action` question: recommending an answer
    // to a question of fact returns the hinted answer instead of the observed one, and
    // the next verdict is then built on an observation nobody made.
    const choices = fix.clarifyingChoices || [];
    const choicesHtml = choices.length
        ? `<div class="advisory advisory-info"><strong>To narrow it down:</strong>${choices.map((q) => {
            if (!q || !q.question) { return ''; }
            const opts = (q.options || []).filter((o) => o && o.label).map((o) => {
                const rec = o.recommended && q.kind === 'action' ? ' <em>(Recommended)</em>' : '';
                const recClass = o.recommended ? ' choice-recommended' : '';
                const detail = o.detail ? ` <span class="dim">${escapeHtml(o.detail)}</span>` : '';
                const cmdBtn = o.command ? ` <button class="btn ghost btn-sm" data-cmd="insertInTerminal" data-text="${escapeHtml(o.command)}" title="Insert check command at terminal prompt">$</button>` : '';
                return `<li><button class="btn choice-btn${recClass}" data-cmd="selectClarifyingChoice" data-qid="${escapeHtml(q.id || '')}" data-oid="${escapeHtml(o.id || '')}" data-question="${escapeHtml(q.question || '')}" data-text="${escapeHtml(o.label || '')}" data-reason="${escapeHtml(o.detail || '')}">${escapeHtml(o.label || '')}${rec}</button>${cmdBtn}${detail}</li>`;
            }).join('');
            const note = q.kind === 'fact'
                ? `<p class="dim">Answer only from what you saw. Say you do not know rather than guessing.</p>`
                : '';
            return `<p><strong>${escapeHtml(q.question)}</strong></p><ul class="choice-list">${opts}</ul>${note}`;
        }).join('')}</div>`
        : '';
    const questions = (fix.clarifyingQuestions || []).filter(Boolean);
    const questionsHtml = choicesHtml ? choicesHtml : questions.length ? `<div class="advisory advisory-info"><strong>The engine would like to know:</strong><ul>${questions.map((q) => `<li>${escapeHtml(q)}</li>`).join('')}</ul></div>` : '';

    // ── Checkpoint resume safety ──
    // This panel renders an unconditional "Restart from Checkpoint" button. If the
    // engine says the checkpoint may be poisoned and we do not show that, the button
    // is a one-click way to resume onto corrupt state and lose the run. The warning
    // is rendered ABOVE the fold (before the action ladder) and again at the button.
    const resumeSafety = str(d.resumeSafetyNote);
    const resumeSafetyHtml = resumeSafety
        ? `<div class="advisory advisory-critical"><strong>⛔ Checkpoint safety, read before restarting</strong><p>${escapeHtml(resumeSafety)}</p></div>`
        : '';
    const resumeFrom = str(fix.resumeFrom) ?? str(d.resumeFrom);
    const resumeFromHtml = resumeFrom
        ? `<div class="advisory"><strong>Resume from</strong><p>${escapeHtml(resumeFrom)}</p></div>`
        : '';

    // Shown only when a numeric confidence was withheld, so the reader learns the
    // engine declined to commit rather than seeing a blank where a score should be.
    const confidenceBand = str(d.confidenceBand) ?? str(fix.confidenceBand);

    // Detection site ≠ origin site. Without this the reader blames the node that logged.
    const originNote = str(d.originNote);
    const originHtml = originNote
        ? `<div class="advisory advisory-warning"><strong>Detection ≠ origin</strong><p>${escapeHtml(originNote)}</p></div>`
        : '';

    // ── The honesty trail ──
    const contradictions = (d.contradictions || []).filter(Boolean);
    const ranked = d.rankedHypotheses || [];
    const secondaryHw = str(d.secondaryHardwareNote);
    const trailBody = [
        contradictions.length
            ? `<h3>Why not the obvious answer (rejected on evidence)</h3><ul>${contradictions.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul>`
            : '',
        secondaryHw
            ? `<h3>Also found, real, but not the root cause</h3><p>${escapeHtml(secondaryHw)}</p><p class="dim">Do not raise an RMA on this alone.</p>`
            : '',
        ranked.length
            ? `<h3>Leading hypotheses</h3><ul>${ranked.map((h) => {
                const conf = typeof h.confidence === 'number' ? ` <span class="dim">(${escapeHtml(h.confidence)}%)</span>` : '';
                const ev = (label: string, xs?: string[]) => xs && xs.length
                    ? `<span class="evidence-line">${label}: ${escapeHtml(xs.join('; '))}</span>` : '';
                return `<li><strong>${escapeHtml(h.label || h.key || 'hypothesis')}</strong>${conf}${ev('For', h.evidenceFor)}${ev('Against', h.evidenceAgainst)}</li>`;
            }).join('')}</ul>`
            : '',
    ].filter(Boolean).join('');

    const remainingNote = typeof d.remaining === 'number' && isFinite(d.remaining)
        ? `<p class="meta">${d.remaining} free diagnos${d.remaining === 1 ? 'is' : 'es'} remaining today · <a href="#" data-cmd="open" data-text="${escapeHtml(attribute(DASHBOARD_URL, 'panel'))}">denpex.com/dashboard</a></p>`
        : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${n}';">
<style>
    body { font-family: var(--vscode-font-family); padding: 22px max(20px, calc((100% - 960px) / 2)); color: var(--vscode-editor-foreground); background-color: var(--vscode-editor-background); line-height: 1.5; }
    h1 { font-size: 1.5em; margin: 0 0 6px; }
    h3 { font-size: 0.95em; margin: 12px 0 4px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 0.78em; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); margin-right: 4px; }
    .badge.type { background: #CC5A37; color: #0A0A0A; font-weight: 600; text-transform: capitalize; }
    .badge.cost { background: var(--vscode-editorError-foreground); color: var(--vscode-editor-background); }
    .badge.dim.dim { opacity: 0.7; }
    .box { border: 1px solid var(--vscode-widget-border); border-left: 3px solid #CC5A37; padding: 16px 18px; border-radius: 6px; margin: 16px 0; background: var(--vscode-editorWidget-background); }
    details { border: 1px solid var(--vscode-widget-border); border-radius: 6px; margin: 8px 0; background: var(--vscode-editorWidget-background); }
    summary { cursor: pointer; padding: 9px 14px; font-weight: 600; user-select: none; }
    summary:hover { background: var(--vscode-list-hoverBackground); }
    .section-body { padding: 4px 14px 12px; border-top: 1px solid var(--vscode-widget-border); }
    pre { white-space: pre-wrap; word-break: break-word; background: var(--vscode-textCodeBlock-background); padding: 8px 10px; border-radius: 4px; margin: 6px 0; }
    table { border-collapse: collapse; width: 100%; font-size: 0.9em; }
    th, td { border: 1px solid var(--vscode-widget-border); padding: 5px 8px; text-align: left; vertical-align: top; }
    .btn { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 4px 12px; border-radius: 3px; cursor: pointer; margin-left: 6px; }
    .btn:hover { background: var(--vscode-button-hoverBackground); }
    .btn.ghost { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    .btn.cloud { margin-left: 0; font-weight: 600; }
    .choice-list { list-style: none; padding-left: 0; margin: 8px 0; display: flex; flex-direction: column; gap: 6px; }
    .choice-list li { display: flex; align-items: center; gap: 8px; }
    .choice-btn { margin-left: 0 !important; font-size: 0.9em; padding: 4px 10px; }
    .choice-recommended { border: 1px solid var(--vscode-testing-iconPassed); background: var(--vscode-button-background); }
    .next-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 20px 0; padding: 14px 16px; border: 1px solid var(--vscode-widget-border); border-radius: 6px; }
    .next-actions .btn { margin-left: 0; }
    .next-heading { display: flex; flex-direction: column; width: 100%; margin-bottom: 4px; }
    .cloud-option { width: 100%; margin-top: 10px; }
    .cloud-option p { margin: 8px 14px; }
    .cloud-option .btn { margin: 0 0 10px 14px; }
    .action { margin: 10px 0; }
    .action-head { display: flex; justify-content: space-between; align-items: center; }
    .action-copy { margin: 5px 0 14px; padding: 11px 12px; border-radius: 4px; background: var(--vscode-textCodeBlock-background); }
    .section-body code { overflow-wrap: anywhere; }
    .chain { list-style: none; padding-left: 0; }
    .chain li { border-left: 3px solid var(--vscode-widget-border); padding: 4px 10px; margin: 6px 0; }
    .chain-root-cause { border-left-color: var(--vscode-editorError-foreground) !important; }
    .chain-downstream-symptom { border-left-color: var(--vscode-editorWarning-foreground) !important; }
    .chain-role { font-size: 0.75em; font-weight: 700; letter-spacing: 0.05em; opacity: 0.8; }
    .evidence-line { display: block; margin-top: 3px; opacity: 0.85; font-size: 0.85em; }
    .advisory { border-left: 3px solid var(--vscode-editorInfo-foreground); padding: 6px 10px; margin: 8px 0; background: var(--vscode-textBlockQuote-background); }
    .advisory-critical { border-left-color: var(--vscode-editorError-foreground); }
    .advisory-warning { border-left-color: var(--vscode-editorWarning-foreground); }
    .conf { display: flex; align-items: center; gap: 10px; margin: 6px 0 10px; max-width: 300px; }
    .conf-track { flex: 1; height: 8px; border-radius: 4px; background: var(--vscode-widget-border); overflow: hidden; }
    .conf-fill { height: 100%; }
    .meta { color: var(--vscode-descriptionForeground); }
    a { color: var(--vscode-textLink-foreground); }
</style>
</head>
<body>
    <h1>Diagnosis</h1>
    <p>${badges}</p>
    ${typeof displayConfidence === 'number'
        ? confidenceBar(displayConfidence)
        : confidenceBand
            ? `<p class="meta">Confidence withheld, below the evidence bar (${escapeHtml(confidenceBand)} band).</p>`
            : ''}

    <div class="box">
        <h2 style="margin-top:0;font-size:1em">${artifacts.length ? 'Observed artifact findings' : 'Likely cause'}</h2>
        <p>${escapeHtml(fix.summary || 'No root cause identified.')}</p>
    </div>

    ${resumeSafetyHtml}
    ${originHtml}
    ${prior}
    ${questionsHtml}

    ${artifactHtml}
    ${section('Recommended Actions', actionsBody || pre(fix.action || 'Check logs for details.'), true, 'recommended-actions')}
    ${section('Evidence and causal chain', tracebackBody, false, 'causal-chain')}
    ${nextActionHtml}
    ${trailBody ? section('Why this answer (audit trail)', trailBody) : ''}
    ${section('Competing Hypotheses', hypsHtml)}
    ${section('Confidence & Calibration', confBody)}
    ${section('Hardware Telemetry', hwBody)}
    ${section('Advisories', advBody)}
    ${section('Alternative Diagnoses', altBody)}
    ${section('Sources & Research', refBody)}
    ${meta.failureType ? section('Technical details', `<p>Pattern: ${escapeHtml(meta.failureType)}</p>${meta.source ? `<p>Engine source: ${escapeHtml(meta.source)}</p>` : ''}`) : ''}

    ${resumeFromHtml}
    ${resumeSafety ? `<div class="advisory advisory-critical"><strong>⛔ Do not restart until you have read the checkpoint safety warning above.</strong></div>` : ''}
    <p class="meta">
        <button class="btn${resumeSafety ? ' ghost' : ''}" data-cmd="restartCheckpoint">⟳ Restart from Checkpoint${resumeSafety ? ' (unsafe, see warning)' : ''}</button>
        <button class="btn ghost" data-cmd="generateRma">Generate Hardware RMA</button>
        <button class="btn ghost" data-cmd="open" data-text="${escapeHtml(attribute(DASHBOARD_URL, 'dashboard'))}">Open Dashboard</button>
    </p>
    ${remainingNote}

    <script nonce="${n}">
        const vscode = acquireVsCodeApi();
        document.addEventListener('click', (e) => {
            const el = e.target.closest('[data-cmd]');
            if (!el) return;
            e.preventDefault();
            vscode.postMessage({
                command: el.dataset.cmd,
                qid: el.dataset.qid || '',
                oid: el.dataset.oid || '',
                question: el.dataset.question || '',
                text: el.dataset.text || '',
                reason: el.dataset.reason || '',
            });
        });
        const focusSection = ${JSON.stringify(focusSection || '')};
        if (focusSection) {
            const target = document.getElementById(focusSection);
            if (target) {
                target.open = true;
                target.scrollIntoView({ block: 'start' });
            }
        }
    </script>
</body>
</html>`;
}

let currentPanel: vscode.WebviewPanel | undefined;

export function showDiagnosisPanel(
    d: DiagnoseResponse,
    onMessage: (message: { command: string; text?: string; reason?: string; qid?: string; oid?: string; question?: string }) => void,
    focusSection?: string,
): vscode.WebviewPanel {
    if (currentPanel) {
        currentPanel.title = 'Denpex: Diagnosis';
        currentPanel.webview.html = renderDiagnosis(d, focusSection);
        currentPanel.reveal(vscode.ViewColumn.Active, true);
        return currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
        'denpexDiagnosis',
        'Denpex: Diagnosis',
        vscode.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] },
    );
    currentPanel = panel;
    panel.onDidDispose(() => {
        if (currentPanel === panel) currentPanel = undefined;
    });
    panel.webview.html = renderDiagnosis(d, focusSection);
    panel.webview.onDidReceiveMessage(onMessage);
    return panel;
}
