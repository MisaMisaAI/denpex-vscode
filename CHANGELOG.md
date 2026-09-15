# Changelog

## 1.4.3

- Marketplace SEO & Remote Execution: Enabled remote workspace execution for Remote-SSH and GPU dev containers; added marketplace Q&A and verified status badges.
- Curated Keyword Set: Optimized extension keywords to the maximum allowed 30 high-impact tags across PyTorch, CUDA, distributed training, and LLM fine-tuning.
- Expanded Long-Tail Search Index: Added discoverability index covering modern GPU architectures, cloud providers (RunPod, Lambda, CoreWeave), and inference engines.

## 1.4.2

- Marketplace Search & Discovery: Expanded search indexing for PyTorch, CUDA error codes, multi-GPU training, and LLM fine-tuning failures.
- SEO Error Index: Added indexed error signature reference in extension documentation for instant diagnosis lookups.

## 1.4.1

- Brand & Logo Refresh: Replaced early beta pulse icons with the official Denpex 3x3 GPU cluster die grid logo across the extension marketplace, details page, and VS Code activity bar.
- Clean Status Bar Display: Removed obsolete pulse glyphs from the status bar in favor of clean text status reporting local engine availability and remaining cloud passes.
- Action Icon Update: Updated editor tab diagnostic icons with the signature Denpex orange cross accent.

## 1.4.0

- Local-First Default Architecture: All routine diagnoses run locally on the bundled offline engine in 400ms for free forever with zero server spend and zero token waste.
- 3 Cloud Deep Reasoning Passes: Cloud LLM multi-node reasoning is reserved on-demand for complex cluster crashes via a prominent action button, protecting free passes from being wasted on trivial test errors.
- Interactive Clickable Clarifying Questions: Clarifying questions in the diagnosis panel are now interactive multiple-choice buttons with recommended actions highlighted, enabling instant one-click diagnosis refinement.
- Zero-Prompt Terminal Link Clicks: Clicking a detected error link in any terminal immediately runs diagnosis on the clicked line and context without prompting "where are the crash logs?".
- Expanded Error Pattern Coverage: Terminal error detection coverage more than doubles across real-world ML crash logs, adding support for PyTorch RuntimeError, Horovod, Torchrun ChildFailedError, Ray, vLLM, and Slurm cancellations.
- Single Reused Webview Tab: Prevents editor clutter by reusing and revealing the existing diagnosis tab rather than opening multiple duplicate tabs.
- "Insert at Terminal Prompt" ($): Added staged command insertion button alongside Execute and Copy, allowing cautious engineers to stage remediation commands at their shell prompt without executing.
- Quick Diagnostics Status Bar Menu: Clicking the status bar item opens a quick-pick menu for clipboard diagnosis, workspace Slurm log scans, demo failures, and trial unlocks.

## 1.3.9

- Adds interactive Terminal Link Provider (DenpexTerminalLinkProvider). CUDA OOM, NCCL timeouts, Xid crashes, and vLLM errors in any terminal output become one-click clickable diagnosis links.
- Introduces frictionless in-editor work email trial flow. Users can activate the 30-day Scale evaluation (50 cloud diagnoses/day + fleet telemetry) directly inside VS Code without browser redirects.
- Adds one-click post-mortem export button ("Copy Slack/PR Report") in the diagnosis panel for sharing incident root cause and fixes with team channels.
- Expands Marketplace metadata and discovery keywords for H100, A100, B200, vLLM, DeepSpeed, Unsloth, Axolotl, and Torchtune.
- Embeds the 64-GPU distributed training incident flow directly into the extension overview.

## 1.3.8

- Opens the real Getting Started walkthrough on first install and offers one-click actions
  to diagnose a realistic 64 GPU failure or use the engineer's own log immediately.
- Aligns the Marketplace page and in-extension upgrade path with the 30-day Scale
  evaluation, including up to 50 cloud diagnoses a day, saved history, and fleet findings.
- Keeps local diagnosis unlimited, offline, and account-free. The paid prompt appears only
  after Denpex has returned useful local evidence.

## 1.3.7

- Bundles engine `2026.08.26+trial-control-arm-r16`. An independent audit defeated 1.3.6's
  new control-arm rule in both directions. Both defects were real and both are fixed.
- **A real hardware fault was being silenced.** The rule refused to trust a hardware verdict
  when your log showed the same silicon behaving under different software, but it only knew
  the ECC spelling "uncorrectable". The Linux kernel writes "AER: Uncorrected (Fatal)" for a
  fatal PCIe error, so that case slipped through and a genuine physical fault was reported as
  a software problem. That is the worse direction: it sends you after a driver while a card
  degrades.
- **A software fault was being reported as hardware.** The same rule matched on the words
  alone, so a log where you quoted a manual or pasted an unrelated historical line containing
  "uncorrectable" pinned the answer back to the wrong 88% hardware verdict that 1.3.6 exists
  to prevent. Damage evidence now only overrides the comparison when a tool emitted it
  (kernel, NVRM, nvidia-smi, DCGM, pcieport, AER), never when it appears in prose.
- The offline pattern database grows to 718 entries, adding NVLS and NCCL NVLS invalid
  argument signatures.
- Version bump is REQUIRED, not cosmetic: 1.3.6 was published carrying the r14 engine and the
  repository has since moved to r16, so the Marketplace build and the source disagreed about
  what 1.3.6 contains. Marketplace versions are immutable, so 1.3.6 keeps its original
  contents and this ships as 1.3.7.

## 1.3.6

- Bundles engine `2026.08.24+cycle10-repair-r14`. A controlled comparison in your log now
  outranks the "stronger lower layer wins" rule. A display wedge that reported a GSP
  firmware fault at 88% confidence, on a log stating three times that the same GPU is fine
  under X11, fine on a bare TTY, and fine on the proprietary driver of the same version, is
  no longer reported as a committed hardware verdict. Firmware faults do not depend on which
  compositor is running, and a wrong hardware verdict sends you to replace a healthy card.
- An answer the engine is not fully confident about now keeps the reasoning that justified
  it. Previously the explanation was replaced with "these logs don't contain the hard
  evidence", so a correctly-identified failure arrived as a bare error-class name with no
  why. The uncertainty is still stated plainly and the follow-up checks are still requested.
- Version bump is REQUIRED, not cosmetic: 1.3.5 was published carrying the previous engine
  and the repository has since moved to r14, so the Marketplace build and the source
  disagreed about what 1.3.5 contains. Marketplace versions are immutable, so 1.3.5 keeps
  its original contents and this ships as 1.3.6.

## 1.3.5

- Bundles engine `2026.08.24+cycle9-repair-r12`. Deep diagnoses now SHOW THEIR WORK.
  The engine returns the log lines that justify a verdict under a ranked structure, and
  nothing previously mapped those back to the field the UI reads, so a diagnosis named a
  cause and quoted nothing from your log. Measured across ten real incidents on two
  different models: evidence present on 0 of 10 answers before, 10 of 10 after.
- Every diagnosis ends with a short "what to do" block: the steps, how to confirm the fix
  worked, and the one thing to try if it did not. When the engine cannot name a cause it
  says so plainly and gives the narrowing step instead, rather than presenting a guess in
  the shape of a fix.
- A fix can now be verified. The engine is required to return a command that checks
  whether the remedy worked, which was previously absent from every deep answer.
- Long answers are no longer truncated into a false "UNKNOWN". A response cut off
  mid-JSON used to degrade silently into an abstention with the summary
  "Analysis complete.", which is indistinguishable from the engine declining to answer.
- A verdict that does not explain the
  earliest device-level fault in the log is now capped and labelled downstream, instead
  of being reported at high confidence. On a vLLM worker killed by a cuBLAS SM90
  split-K GEMM fault, the extension previously led with the EngineCore teardown; it now
  leads with the kernel that actually faulted.
- The offline triage path names the component the log itself names, and treats a
  control experiment already present in the log as evidence rather than asking you to
  run it again.
- The engine's internal annotations no longer appear as quoted evidence. A
  `[SYSTEM_WARNING] This job may not have crashed` line could previously be shown as
  the first evidence on a log that had plainly crashed.
- Version bump is required rather than cosmetic: a repo-wide punctuation sweep changed
  the bundled payload while the manifest still read 1.3.4, so the published 1.3.4 and
  the repository disagreed about what 1.3.4 contains. Marketplace versions are
  immutable, so 1.3.4 keeps its original contents and this ships as 1.3.5.

## 1.3.4

- Reissued the reviewed r9 build after the Marketplace's immutable 1.3.3 upload was
  found to contain an older engine artifact.
- Bundles engine `2026.08.24+cycle8-revealed-r9` and its current behavior fingerprint.

## 1.3.3

- Updated the bundled canonical offline engine and pattern database to the current
  source fingerprint.
- Moved cloud API keys into VS Code SecretStorage and migrate legacy plaintext settings
  without weakening local/offline diagnosis.
- Replaced heuristic pre-crash confidence percentages with evidence-labelled severity.
- Kept the walkthrough, sample diagnoses, editor/terminal actions, sidebar, and final
  Marketplace SEO overview from 1.3.2.

## 1.3.2

- Rewrote the Marketplace overview around searchable GPU/ML failure terms and the
  under-60-second first-install experience.
- Clarified that local diagnosis is unlimited, offline, and requires no account or
  system Node.js installation.
- Documented every in-editor discovery surface, included sample, and supported runtime.

## 1.3.1

- Added an install-time walkthrough with an offline NCCL cascade diagnosis.
- Added five one-click sample failures for NCCL, Xid, Kubernetes, and vLLM incidents.
- Added editor, selection, terminal, and editor-title diagnosis actions.
- Added a Denpex sidebar with current logs, recent local diagnoses, samples, and privacy status.
- Added a visible cloud-escalation action to local diagnosis reports.
- Clarified that local diagnosis is unlimited; only optional cloud use is metered.
- Added Marketplace discovery metadata and support resources.

## 1.3.0

- Bundled the canonical deterministic engine for unlimited offline diagnosis.
- Added local-first engine selection and explicit cloud deep reasoning.
- Added calibrated confidence, causal-chain, checkpoint-safety, and remediation reporting.
