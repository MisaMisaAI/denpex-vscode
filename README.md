# Denpex: GPU, CUDA & PyTorch Crash Diagnostics for VS Code

[![Offline Engine](https://img.shields.io/badge/Offline%20Engine-100%25%20Local-success)](https://denpex.com/vscode)
[![Privacy](https://img.shields.io/badge/Privacy-Zero%20Code%20Upload-blue)](https://denpex.com/privacy)
[![Marketplace](https://img.shields.io/badge/VS%20Marketplace-v1.4.42-orange)](https://marketplace.visualstudio.com/items?itemName=denpex.denpex-diagnostics)

Select a GPU error log. See the supporting evidence, likely cause, and what to check next, without leaving VS Code.

Investigate CUDA out-of-memory errors, NCCL timeouts, PyTorch crashes, NVIDIA Xid faults, Slurm jobs, Kubernetes GPU failures, and vLLM inference errors.

> **Denpex provides unlimited, 100% free offline GPU crash diagnostics powered by our local deterministic engine. No sign-up, credit card, or API key required.**
>
> *Optional cloud deep reasoning and shared team history are available when you need cloud-assisted analysis for complex, unclassified crashes.*

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

**Find the first failure and act on it.** This bundled incident has a CUDA OOM on rank 3 followed by NCCL timeouts on other ranks. The extension identifies the initiating fault, flags unknown checkpoint safety, and shows the first fix in the same editor view.

![Denpex running in VS Code: sidebar sample, rank 3 OOM diagnosis, checkpoint warning, and recommended actions](https://denpex.com/marketplace/vscode-diagnosis-sidebar.png)

**Check the source lines.** Open the evidence section to inspect the OOM and downstream timeout lines that support the diagnosis.

![Denpex running in VS Code with the matched log evidence expanded below the recommended actions](https://denpex.com/marketplace/vscode-diagnosis-evidence.png)

Both screenshots were captured from the installed extension using its bundled synthetic sample. Your VS Code theme and window size may vary.


## Use it where you work

- **Editor:** select log text, right-click, then **Diagnose GPU/ML Error**.
- **Terminal:** use **Diagnose Last Failure**, or follow a Denpex link on a recognized error.
- **Sidebar:** diagnose a copied error, use editor or terminal output, scan workspace logs, or try a sample.
- **Team handoff:** choose **Copy Slack/PR Report**, then paste the report where you need it.

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

Use **Denpex: Inspect GPU Artifact Locally** for Flight Recorder JSON rank dumps, CUDA memory snapshot JSON, Nsight SQLite traces, checkpoint candidates and aligned rank timings. It requires Python 3 and uses the bundled read-only inspector. No pickle files are executed and no checkpoint is changed. Basic local inspection remains account-free.

Memory inspection separates requested allocations, awaiting-free blocks and inactive memory per GPU. A large allocation is a contributor, not automatically the cause of an OOM. Checkpoint metadata alone cannot establish a safe resume point.

![Synthetic CUDA memory snapshot inspected by the local Denpex engine](https://raw.githubusercontent.com/MisaMisaAI/denpex-vscode/main/screenshots/diagnosis-memory-snapshot.png)

Choose cloud review explicitly to save a diagnostic summary to your account. **Denpex: Shared Cloud History** reads the same saved summaries as the website and MCP, including older pages. Local-only results and raw artifact files remain on this machine. Account status shows the server-confirmed email and effective plan; an API key's presence alone does not verify access.

Start locally. If you need another pass, choose **Try one free cloud review** in the report. You get one immediate cloud deep analysis without an account. Later anonymous requests may require a browser check on denpex.com.

Cloud review sends the selected log to Denpex. It is optional; local diagnosis stays unlimited.

For regular cloud use:

- **Existing eligible account:** run **Denpex: Connect Account**, approve your editor's short code in the browser, then return to VS Code. No API-key copying.
- **New team:** request a **30-day Team trial** inside VS Code with your work email. Open the emailed link within 7 days of the first request and sign in with the same address. Eligible trials include up to 50 cloud diagnoses a day and saved history, with no card or automatic subscription. Then use **Connect Account**.

Company-domain verification applies. If automatic verification fails, contact support@denpex.com for review. You can keep using the local engine while waiting.

Connecting an account does not upload a log or start a diagnosis. Credentials are stored in VS Code SecretStorage. See the [extension guide](https://denpex.com/vscode) for setup details.

## Privacy

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
