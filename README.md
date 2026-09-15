# Denpex. GPU & ML Crash Diagnostics for VS Code

Find the **first failed rank**, not just the last loud error. Denpex diagnoses CUDA errors,
NCCL hangs, PyTorch crashes, NVIDIA Xid faults, Slurm and Kubernetes GPU failures, and
vLLM/Triton inference incidents without leaving VS Code.

**The diagnosis engine and pattern database are bundled in the extension. Local diagnosis
is unlimited, offline, and requires no account, API key, system Node.js installation, or
network connection.** It also works where GPU logs usually live: Remote-SSH hosts,
containers, Slurm login nodes, and air-gapped training environments.

[Install Denpex from the Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=denpex.denpex-diagnostics)

## Quick Install

Install in VS Code with one command:
```bash
code --install-extension denpex.denpex-diagnostics
```
Or search `Denpex` in the VS Code Extensions tab (`Ctrl+Shift+X` / `Cmd+Shift+X`).

On a remote headless GPU node or Slurm cluster? Run the standalone single-file agent directly:
```bash
curl -fsSL https://denpex.com/agent/denpex.py | python3 - diagnose training.log
```

## Live Product Flow: 64-GPU Distributed Training Crash

```text
+-- 1. CRASH (Log Flood) --------------------------------------------------------+
| [trainer] step 83,998 * loss 1.847 * 64 GPUs * 41.2s/step                      |
| [E ProcessGroupNCCL] [Rank 17] Watchdog caught collective timeout: ALLREDUCE   |
| [E ProcessGroupNCCL] [Rank 03] NCCL watchdog thread terminated with exception  |
| [rank42] ECC uncorrectable error detected on GPU 00000000:8A:00.0              |
| node-05 kernel: NVRM: Xid (PCI:0000:8a:00): 48, Double Bit ECC Error           |
| *** STEP 882190.0 CANCELLED. 64 GPUs idle ***                                  |
+--------------------------------------------------------------------------------+
                                  |
                                  v
+-- 2. FORENSIC DIAGNOSIS (10,989 Signatures Scanned) ---------------------------+
| * SYMPTOM: 64 NCCL timeouts (collateral: healthy ranks were waiting on peer)   |
| * CAUSE:   rank 42 * node-05 * GPU 8A:00 * Xid 48 double-bit ECC               |
| * CLASS:   HARDWARE FAULT (Routed to infrastructure team, not ML engineer)     |
+--------------------------------------------------------------------------------+
                                  |
                                  v
+-- 3. TESTED REMEDIATION -------------------------------------------------------+
| # Drain the failed node and resume training with elastic restarts:             |
| $ scontrol update nodename=node-05 state=drain                                 |
| $ torchrun --max-restarts=3 train.py --resume latest                           |
| * Verification: node-05 drained, 56 GPUs resumed step 83,999 in 12s            |
+--------------------------------------------------------------------------------+
```

## Interactive Terminal Links: Catch Errors Instantly

When a GPU error or crash appears in any VS Code terminal, Denpex automatically detects it and makes it clickable:

```text
torch.OutOfMemoryError: CUDA out of memory. Tried to allocate 6.00 GiB.
👉 [Diagnose with Denpex] (Click to inspect root cause)
```

Clicking the link immediately isolates patient zero, separates root causes from collateral timeouts, and gives you tested remediation commands.

## Get the aha moment in under 60 seconds

The Getting Started walkthrough opens automatically after installation:

1. Diagnose a realistic rank-local CUDA OOM that becomes an NCCL timeout cascade.
2. See rank 3 identified as the initiator and ranks 0 to 2 as collateral victims.
3. Inspect the primary fix, fallback, emergency mitigation, and verification step.
4. Select one of your own tracebacks or click a terminal error link to diagnose it locally.
5. Get 3 free cloud deep reasoning evaluations with zero account, then unlock the 30-day Scale trial directly inside VS Code with your work email (50 cloud diagnoses a day, team fleet findings, and saved history).
6. Click **Copy Slack/PR Report** to paste a complete post-mortem summary into your team's Slack channel or GitHub PR.

No failed job ready? Open the **Denpex** sidebar and run any included sample:

- Rank-local OOM causing an NCCL watchdog cascade
- Xid 79: GPU fallen off the bus
- NCCL interface mismatch (`ib0` on one node, `eth0` on another)
- Kubernetes NVIDIA device-plugin stale GPU health after a recovered Xid
- vLLM KV-cache exhaustion from context length and concurrency

## Denpex is visible where failures happen

- **Selected traceback:** right-click → **Diagnose GPU/ML Error**
- **Integrated terminal:** right-click → **Diagnose Last Failure**
- **Log editor:** use the editor-title action for `.log`, `.out`, and traceback content
- **Activity bar:** open the Denpex sidebar for current logs, recent local diagnoses,
  sample failures, and local/offline privacy status
- **Command Palette:** run any command beginning with `Denpex:`

The status bar always tells you when the unlimited offline engine is active.

## What a diagnosis returns

The report is a forensic explanation, not a failure-class label:

- root cause with calibrated confidence (withheld when a precise number is not justified)
- causal chain ordered by evidence
- initiating rank or node versus collateral timeout victims
- competing hypotheses and evidence for and against each one
- contradictions that ruled out the obvious-but-wrong answer
- primary fix, fallback, emergency mitigation, prevention, and evidence-specific verification step
- checkpoint resume-safety warning
- explicit Execute and Copy actions for remediation commands

When a local result needs more, the report contains a visible **Run cloud deep reasoning**
button. Nothing is uploaded until you choose that action (unless you deliberately enable
the opt-in auto-escalation setting).

## Supported GPU and ML systems

The bundled deterministic engine covers:

- **GPU/runtime:** CUDA, NVIDIA Xid, NVLink, NVSwitch, ECC, DCGM, ROCm
- **Distributed training:** NCCL, PyTorch DDP/FSDP, DeepSpeed ZeRO, Megatron-LM, MPI
- **Fabrics:** InfiniBand, RoCE, EFA, GPUDirect RDMA, socket-interface mismatches
- **Schedulers/orchestrators:** Slurm, Kubernetes, NVIDIA GPU Operator and device plugin,
  Ray and Volcano
- **Inference:** vLLM, TensorRT-LLM, Triton Inference Server, FlashAttention, tensor and
  pipeline parallelism
- **Frameworks/data:** PyTorch, JAX/XLA, Hugging Face, checkpoint, storage, and data-loader
  failures

### Common Signatures Diagnosed Instantly

| Failure Signature | What Denpex Isolates |
|---|---|
| `torch.cuda.OutOfMemoryError` | Exact initiating rank and tensor allocation vs collateral NCCL watchdog timeouts |
| `NCCL watchdog timeout: ALLREDUCE` | Separates the 1 slow or dead rank from the 63 waiting ranks |
| `CUDA error: device-side assert triggered` | Precise kernel launch and tensor indexing bug without requiring host re-runs |
| `NVRM: Xid 79 (GPU fallen off bus)` | Hardware PCIe link failure routed to infra team instead of ML code debugging |
| `NVRM: Xid 48 (Double Bit ECC Error)` | Uncorrectable SRAM/HBM fault with automated Slurm drain commands |
| `vLLM Engine killed by SIGKILL / OOM` | KV-cache allocation exhaustion vs context length concurrency limit |
| `CUDA error: misaligned address` | Unaligned pointer arithmetic in custom Triton/CUDA kernels |
| `SLURM STEP CANCELLED / Node Fail` | Distinguishes job preemption, OOM kills, and node power loss |
| `NCCL_SOCKET_IFNAME mismatch` | Multi-node network interface mismatch (`ib0` vs `eth0`) causing silent hangs |
| `Kubernetes device-plugin stale health` | Unrecovered GPU state causing pod crash loops on healthy worker nodes |

## Local engine versus cloud deep reasoning

| | Local engine | Cloud deep reasoning |
|---|---|---|
| Account required | No | Trial or plan after the anonymous allowance |
| Limit | **Unlimited** | Cloud quota |
| Network | None | Required |
| Logs uploaded | No | Only when explicitly requested |
| Remote-SSH / air-gapped | Yes | Air-gapped: no |
| Best for | Known and evidence-owned failures | Novel, ambiguous, multi-cause incidents |

Only cloud compute, saved organization history, monitoring, alerts, collaboration, and
fleet workflows are metered. Local diagnosis is free forever because it runs on your
machine.

## Privacy

Local diagnosis, predictive terminal monitoring, sample failures, and RMA payload
generation run entirely on the extension host. Clipboard text is read only after you
choose it from the source picker. Recent-diagnosis persistence stores only a timestamp,
failure type, and engine source - not logs, evidence excerpts, or the report body.

In `auto` mode, a local-engine failure does **not** silently fail over and upload the log.
Denpex reports the local failure and asks before cloud escalation. Set `denpex.engine` to
`local` to disable cloud diagnosis entirely.

Read the full [Denpex privacy policy](https://denpex.com/privacy).

## Settings

| Setting | Default | Purpose |
|---|---|---|
| `denpex.engine` | `auto` | Local-first (`auto`), local-only, or explicit cloud mode |
| `denpex.cloud.autoEscalate` | `false` | Opt in to cloud reasoning after local diagnosis |
| Cloud API key |, | Set with **Denpex: Set API Key**; stored in VS Code SecretStorage, never plaintext settings |
| `denpex.apiBase` | `https://api.denpex.com` | Staging or on-prem API override |
| `denpex.predictive.enabled` | `true` | Local pre-crash terminal monitoring |
| `denpex.predictive.notifyCooldownMinutes` | `10` | Minimum minutes between predictive warnings |
| `denpex.remediation.confirmBeforeRun` | `true` | Confirm before running a fix command |
| `denpex.remediation.restartCommand` |, | Command used by Restart from Checkpoint |

## Support

- [VS Code extension guide and interactive demo](https://denpex.com/vscode)
- [Denpex documentation](https://denpex.com/docs)
- [Contact support](https://denpex.com/contact)
- [Service status](https://denpex.com/status)
- [Security disclosure](https://denpex.com/security/disclosure)
