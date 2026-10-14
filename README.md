# Denpex: GPU, CUDA & PyTorch Crash Diagnostics for VS Code

[![Offline Engine](https://img.shields.io/badge/Offline%20Engine-100%25%20Local-success)](https://denpex.com/vscode)
[![Privacy](https://img.shields.io/badge/Privacy-Zero%20Code%20Upload-blue)](https://denpex.com/privacy)
[![Current release](https://img.shields.io/badge/Current%20release-v1.4.37-orange)](https://marketplace.visualstudio.com/items?itemName=denpex.denpex-diagnostics)

Select a GPU error log. See the supporting evidence, likely cause, and what to check next, without leaving VS Code.

Investigate CUDA out-of-memory errors, NCCL timeouts, PyTorch crashes, NVIDIA Xid faults, Slurm jobs, Kubernetes GPU failures, and vLLM inference errors.

**Local diagnosis is free, unlimited, and offline. No account, API key, or separate Node.js installation required.**

### Start with one useful result

- **Understand the failure:** inspect the likely cause and the log lines supporting it.
- **Know what to do next:** review the recommendation, its prerequisites and the checks needed to establish recovery.
- **Continue when facts are missing:** inspect local findings, or explicitly choose optional cloud review. A diagnosis is not proof that your workload is repaired.

For a one-off error, keep using free local diagnosis. For recurring team incidents, evaluate whether connected evidence, notifications and saved cloud investigations reduce your work. A Team evaluation should use your own incident, not just a sample.

## Quick Install

```bash
code --install-extension denpex.denpex-diagnostics
```

Or search **Denpex** in the VS Code Extensions tab (`Ctrl+Shift+X` / `Cmd+Shift+X`).

## Try a diagnosis

1. Open a log and select the error with its surrounding context.
2. Right-click and choose **Diagnose GPU/ML Error**.
3. Review the evidence and suggested checks. Use **Copy** to take a suggested action back to your workflow.

No log handy? Open the **Denpex** sidebar and run a bundled sample: an OOM followed by NCCL timeouts, GPU device loss, a network-interface mismatch, a Kubernetes device-plugin fault, or vLLM KV-cache exhaustion.

The report separates an initiating failure from downstream symptoms when the log supports that distinction. If it cannot establish the cause, it asks for more evidence instead of treating a timeout as an explanation.

## What a diagnosis shows

The report leads with the likely cause, checkpoint safety when relevant, and recommended actions. Expand the evidence and causal chain to see how Denpex reached its conclusion. If the logs do not establish a cause, the report identifies what evidence is missing.

![Current Denpex Console with a local vLLM diagnosis, likely cause and evidence](https://raw.githubusercontent.com/MisaMisaAI/denpex-vscode/main/screenshots/v1.4.37/diagnosis-vllm-kv-cache.png)

Captured from the current extension's Console renderer after running its bundled synthetic vLLM log through the shipped offline engine. The report shows evidence and suggested checks, not proof of workload recovery.

### Inspect incidents in Fleet

![Denpex extension Fleet with an incident queue and selected incident details](https://raw.githubusercontent.com/MisaMisaAI/denpex-vscode/main/screenshots/v1.4.37/fleet.png)

Search incidents, select a result and review the recorded guidance beside the queue. This capture uses the actual compiled extension workspace with synthetic example telemetry.

### Find the affected host on the map

![Denpex extension Topology map with three clusters, 384 GPUs, a red fault and an orange inspection signal](https://raw.githubusercontent.com/MisaMisaAI/denpex-vscode/main/screenshots/v1.4.37/topology.png)

The map groups reported hosts by cluster and fits the available fleet. Select a host to inspect its GPUs. Red and orange signals identify devices to investigate; they do not establish the root cause.

### Inspect exact device identity and evidence

![Selected host GPU cards and inspector showing the example GPU UUID, PCI address, temperature and reason for inspection](https://raw.githubusercontent.com/MisaMisaAI/denpex-vscode/main/screenshots/v1.4.37/topology-device.png)

The inspector connects device identity, reported measurements and the next evidence step. These Fleet and Topology captures use synthetic example records, not a live customer cluster. Connected users see their account's reported inventory and measurements. Accounts without telemetry see setup instructions. VS Code theme and panel size can change the appearance.

## Use it where you work

- **Editor:** select log text, right-click, then **Diagnose GPU/ML Error**.
- **Terminal:** use **Diagnose Last Failure**, or follow a Denpex link on a recognized error.
- **Sidebar:** diagnose a copied error, use editor or terminal output, scan workspace logs, or try a sample.
- **Team handoff:** choose **Copy Slack/PR Report**, then paste the report where you need it.

### Console, Fleet and Topology

Open **Denpex: Open Console** to paste a log, run a local diagnosis and ask about its recorded cause, evidence, fix or checkpoint safety. These local follow-ups do not invoke an LLM. Arbitrary questions require a separate cloud review.

Choose **Fleet** or **Topology** in the console, or run **Denpex: Open Fleet** and **Denpex: Open Topology**. These editor panels use the website's shared components and read your connected account's reports and telemetry. A plan with the corresponding access is required. With no telemetry, the map shows setup instructions, not demo nodes. Stale telemetry is not presented as healthy.

Account reports are read-only in the editor. Billing, API-key management, integrations and operational changes remain website actions. Opening a fleet view does not upload your local log or start LLM reasoning. Credentials stay in the extension host, not in the webview.

Local diagnosis runs on the extension host, including Remote-SSH hosts and containers. The bundled engine also works without internet access.

### Interactive Terminal Links

Recognized GPU and ML error lines become clickable in the integrated terminal. Open a diagnosis from the error, then check its supporting evidence before making changes.

## Errors you can investigate

| Log or symptom | What to check |
|---|---|
| CUDA OOM followed by NCCL timeouts | Whether an earlier rank ran out of memory while other ranks waited |
| NCCL watchdog timeout | Earlier rank failures, collective mismatches and network evidence |
| NVIDIA Xid 79 | Device loss and associated PCIe, platform or driver evidence |
| Slurm cancellation or Kubernetes OOMKilled | Earlier scheduler events and host or container memory limits |
| vLLM startup or KV-cache failure | GPU memory available for weights, activations and the requested cache |

The engine recognizes patterns across PyTorch, NCCL, DeepSpeed, Slurm, Kubernetes, vLLM, TensorRT-LLM and related GPU tooling. Recognition does not certify every software/hardware combination or prove the cause from a single error line.

## Optional cloud review

Start locally. If you need another pass, choose **Try one free cloud review** in the report. You get one immediate cloud deep analysis without an account. Later anonymous requests may require a browser check on denpex.com.

Cloud review sends the selected log to Denpex. It is optional; local diagnosis stays unlimited.

For regular cloud use:

- **Existing eligible account:** run **Denpex: Connect Account**, approve your editor's short code in the browser, then return to VS Code. No API-key copying.
- **New team:** request a **30-day Team trial** inside VS Code with your work email. Open the emailed link within 7 days of the first request and sign in with the same address. Eligible trials include up to 50 cloud diagnoses a day and saved history, with no card or automatic subscription. Then use **Connect Account**.

Company-domain verification applies. If automatic verification fails, contact support@denpex.com for review. You can keep using the local engine while waiting.

Connecting an account does not upload a log or start a diagnosis. Credentials are stored in VS Code SecretStorage. See the [extension guide](https://denpex.com/vscode) for setup details.

## Privacy

### Return to an investigation

Choose **Save locally** in a report to keep its findings, evidence excerpts and recovery assessment history on the extension host. Saving requires explicit confirmation. These files are not encrypted, are limited to 2 MiB each and remain until deleted; keep sensitive evidence out if your policy prohibits local storage. Up to 100 reports can be saved.

Use **Reopen** or **Denpex: Reopen Saved Investigation** after restarting the editor. **Export report** writes a Markdown handoff to a location you choose. **Delete saved report** removes a selected saved report after confirmation. The original input log is not separately retained, so provide it again for a fresh diagnosis or cloud review.

Recovery assessments are your observations, not independent certification by Denpex. Saving or exporting preserves unsuccessful assessments as well as the latest result.

### Default behavior

Local diagnosis, predictive terminal monitoring, sample failures, and RMA payload
generation run entirely on the extension host. Clipboard text is read only after you
choose it from the source picker. Recent-diagnosis persistence stores only a timestamp,
failure type, and engine source - not logs, evidence excerpts, or the report body.

After your first completed diagnosis, Denpex asks whether you want to share optional
anonymous product-step counts. It is off until you select **Allow anonymous counts**.
If enabled, Denpex sends only the extension version and a completed-step label
(sample diagnosis, own-log diagnosis, cloud review, Team trial request, or account connection). It sends
no log, result, email address, file path, machine detail, or install identifier.
Choose **Denpex: Manage Anonymous Step Counts** at any time to turn it off or on.
An on-prem or custom API setup does not send these counts to Denpex.

In `auto` mode, a local-engine failure does **not** silently fail over and upload the log.
Denpex reports the local failure and asks before cloud escalation. Set `denpex.engine` to
`local` to disable cloud diagnosis entirely.

Read the full [Denpex privacy policy](https://denpex.com/privacy).

## Settings

| Setting | Default | Purpose |
|---|---|---|
| `denpex.engine` | `auto` | Local-first (`auto`), local-only, or explicit cloud mode |
| `denpex.cloud.autoEscalate` | `false` | Opt in to cloud reasoning after local diagnosis |
| Cloud connection | none | Use **Denpex: Connect Account**; credentials stay in SecretStorage. **Set API Key** is the advanced fallback |
| `denpex.apiBase` | `https://api.denpex.com` | Staging or on-prem API override |
| `denpex.predictive.enabled` | `true` | Local pre-crash terminal monitoring |
| `denpex.predictive.notifyCooldownMinutes` | `10` | Minimum minutes between predictive warnings |
| `denpex.remediation.confirmBeforeRun` | `true` | Confirm before running a fix command |
| `denpex.remediation.restartCommand` | empty | Command used by Restart from Checkpoint |

## Support

- [VS Code extension guide and interactive demo](https://denpex.com/vscode)
- [Denpex documentation](https://denpex.com/docs)
- [Contact support](https://denpex.com/contact)
- [Service status](https://denpex.com/status)
- [Security disclosure](https://denpex.com/security/disclosure)

## GPU artifact inspection

Use **Denpex: Inspect GPU Artifact Locally** for Flight Recorder JSON rank dumps, CUDA memory snapshot JSON, Nsight SQLite, checkpoint candidates and aligned rank timings. Python 3 is required. No pickle is executed, no checkpoint is changed, and no artifact is uploaded automatically. Memory measurements stay separate by GPU. Metadata alone does not verify checkpoint recovery.

**Denpex: Shared Cloud History** reads diagnoses saved by the website, extension, API and MCP. Local-only results stay on this machine until you explicitly choose cloud review. Your connected account and effective plan are verified by the server.

## GPU artifact inspection

Use **Denpex: Inspect GPU Artifact Locally** for Flight Recorder JSON rank dumps, CUDA memory snapshot JSON, Nsight SQLite, checkpoint candidates and aligned rank timings. Python 3 is required. No pickle is executed, no checkpoint is changed, and no artifact is uploaded automatically. Memory measurements stay separate by GPU. Metadata alone does not verify checkpoint recovery.

**Denpex: Shared Cloud History** reads diagnoses saved by the website, extension, API and MCP. Local-only results stay on this machine until you explicitly choose cloud review. Your connected account and effective plan are verified by the server.


