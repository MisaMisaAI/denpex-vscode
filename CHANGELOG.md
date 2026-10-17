# Changelog

## 1.4.43

- Added Local GPU Preflight Check (`denpex.runPreflightCheck`) to audit GPU count, compute capability, ECC memory state, /dev/shm shared memory volume, and PyTorch/CUDA driver alignment before training.
- Added Multi-Rank Log Correlation (`denpex.correlateRankLogs`) to parse multi-node logs concurrently, isolate patient zero ranks, and separate initiating crashes from downstream NCCL timeout cascades.
- Added In-Editor Diagnostics Provider with editor gutter squiggles and Problems panel integration for traceback crash frames.
- Added Remediation Action Matrix with one-click copyable environment variables (`TORCH_DISTRIBUTED_DEBUG`, `NCCL_IB_DISABLE`, `PYTORCH_CUDA_ALLOC_CONF`) and inspection commands.
- Expanded predictive offline signatures for NaN/Inf loss divergence and CUDA device-side assertions.

## 1.4.42

- Added transparent free/paid architecture positioning to the extension listing.
- Updated marketplace screenshot links to reliable repository assets to resolve asset loading issues.
- Synchronized local offline diagnostic engine bundle with latest patterns.

## 1.4.41

- Integrated the verified differential diagnosis engine with candidate cause scoring (supported, contradicted, unconfirmed) and distinguishing test guidance.
- Added bidirectional 500ms causal tolerance filtering to isolate patient zero faults and suppress secondary NCCL timeout cascades.
- Updated bundled offline engine with anchor-weighted confidence gating and hardened read-only test verification.

## 1.4.14

- Replaced the command list in the Denpex sidebar with clear actions for copied logs, editor or terminal output, workspace logs, and bundled samples.
- Opened local diagnoses in a full editor tab with the likely cause, safety guidance, supporting evidence, and next actions in reading order.
- Kept run buttons off remediation plans when a checkpoint safety warning is present.
- Updated the Marketplace listing with a screenshot captured from the extension running in VS Code.

## 1.4.13

- Shortened the Marketplace listing around trying a diagnosis, retained discovery keywords, and clarified the sample-image provenance.
- Made every getting-started action available directly in the walkthrough description, including narrow editor layouts.
- Replaced outdated trial key-copy instructions with the activation and Connect Account flow. Manual keys remain an advanced option.
- Updated the offline engine with source-backed TensorRT-LLM FP8 guidance covering Ada support and backend and model limitations.

## 1.4.12

- Added Connect Account: approve a short code in the browser and return to VS Code without copying an API key. An active eligible plan or approved trial is still required.
- Connection credentials stay in SecretStorage, expire after 90 days, and cannot change billing or execute remote commands. Disconnect Account revokes the current credential on the server.
- Kept diagnosis context in the editor while connecting. Connection never uploads a log or starts a paid analysis.
- Split trial instructions into clear activation and connection steps. Manual API key setup remains available for advanced and self-hosted use.
- Clarified that incomplete logs may require more evidence before identifying an initiating failure.

## 1.4.11

- Rebuilt the packaged offline engine from the verified website release, including the source-backed Xid 79 correction.
- Synchronized the published extension with the current consent-based funnel, in-editor Team evaluation request, and copy-first remediation controls.
- Included the canonical engine fingerprint so the public VSIX can be checked against the release source.

## 1.4.10

- The packaged sidebar now says Team rather than Scale for the 30-day evaluation.
- Rebuilt the bundled offline engine from the current diagnosis source and kept the reported client version in sync with the package.
- Added optional, consent-based counts for completed sample, own-log, cloud, and Team-trial steps. No log, result, email, path, machine detail, or install identifier is sent.

## 1.4.9

- The first local result leads with diagnosing your own log, then offers one optional cloud review of that same log. The cloud handoff explains when the log leaves VS Code.
- Free-form fix and verification text can be copied but no longer has an Execute button. Only structured remediation commands can be run directly.
- The trial action says Team and requests the code inside VS Code. The emailed link still handles activation, with key setup on denpex.com.
- Established company mailboxes can activate Team after an address-bound code and current domain checks without depending on Google Workspace. Uncertain domains receive a review path.
- The bundled engine is rebuilt from the current source so the published package can be checked against the repository.

## 1.4.8

- The bundled offline engine requires explicit evidence before naming missing torchrun ranks, FSDP desynchronization, or another rank as the cause of a generic NCCL communicator abort. When the initiating cause is absent, it asks for more evidence.
- The offline diagnosis engine version now matches the website's updated engine.

## 1.4.7

- The public 30-day evaluation now activates Team, matching the $499 month-to-month plan. Existing Scale codes still redeem at their original tier, and larger teams can request a reviewed Scale evaluation.
- Trial labels and cloud quota guidance in the extension match the website and emailed offer.

## 1.4.6

- Release package for the 30-day evaluation funnel shared by VS Code and denpex.com. The local diagnosis, one immediate account-free cloud analysis, email activation, and personal API key setup follow the same steps on both surfaces.

## 1.4.5

- Trial handoff: Request a Scale evaluation code in VS Code, then activate it through the emailed redemption link with the same work address. The extension now explains the website step and the 7-day redemption window instead of implying the trial starts inside the editor.
- Marketplace and website parity: The extension walkthrough, diagnosis panel, and listing describe the same 30-day evaluation path.
- Cloud allowance honesty: The extension offers one immediate account-free cloud analysis. Further anonymous analyses may require a browser check, so the extension directs users to the browser or to the Scale trial instead of promising three headless passes.
- Secure VS Code connection: After redeeming the trial, create an API key in Dashboard > Monitoring, copy it once, and paste it into VS Code SecretStorage. The trial code is never used as a cloud credential.

## 1.4.4

- Funnel Attribution: Every link the extension opens on denpex.com now carries campaign parameters naming the in-editor surface the click came from, so the path from Marketplace install to site visit to trial is measurable for the first time. Links to any other host are never rewritten, and a user-configured on-prem or air-gapped API endpoint is left untouched. Existing query strings survive, which trial code redemption depends on.
- Accurate Client Version Reporting: The version this extension reported to the API was hardcoded at 1.4.0 and never updated through 1.4.1, 1.4.2 and 1.4.3, so four releases of traffic were indistinguishable and per-release error rates could not be answered. It now reports its real version, and a parity test fails the build if the reported version and the package version ever disagree again.
- Shareable Incident Reports: The incident report text copied out of the diagnosis panel carries its own attribution, so a report pasted into Slack or a pull request is traceable back to the extension that produced it.

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
