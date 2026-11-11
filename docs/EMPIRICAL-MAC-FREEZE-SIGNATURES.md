# Empirical macOS Coding-Agent Freeze Signatures & Pre-Action Safeguards

This diagnostic guide catalogs the **5 primary macOS system freeze and runaway tool-call failure modes** observed across autonomous coding agents (`Claude Code`, `Cursor`, and `OpenAI Codex`), along with the deterministic `mac-yolo-safeguards` MCP tools that detect, prevent, and remediate them before `WindowServer` swap exhaustion forces a hard reboot.

---

## 1. The 5 Empirical macOS Freeze Signatures (`yolo_empirical_freeze_classifier`)

| Signature ID | Empirical Failure Pattern | Upstream Incident References | Threshold | Deterministic Remediation |
|---|---|---|---|---|
| `orphaned_git_storm` | Timed-out Bash tool calls leave `PPID=1` orphaned `git` subprocess trees holding repo locks and pegging CPU cores | `anthropics/claude-code#108551` (`309` orphaned `git` processes) | `>= 25` orphaned `git` processes (`critical` at `>= 100`) | Reap `PPID=1` orphaned `git` process tree via `yolo_agent_guard` (`action=clean`) |
| `codex_node_repl_or_helper_leak` | Leaked `node_repl` processes or per-thread duplicated `Codex Helper` / MCP stdio servers exhausting unified memory | `openai/codex#53664` (`32 GB` RAM), `openai/codex#54461` (`130+` helpers, `26+ GB` RAM) | `>= 20` leaked helper/REPL processes (`critical` at `>= 50`) | Terminate leaked `node_repl` and duplicate orphaned MCP stdio servers |
| `sleep_wake_zombie_cli_spin` | Detached CLI sessions after macOS sleep/wake or terminal close spinning at `85%–95%` CPU and `6–12.6 GB` RSS while ignoring `SIGTERM` | `anthropics/claude-code#107354` (`7.7–8.7 GB` idle), `anthropics/claude-code#97862` (`93–95%` CPU) | Idle CLI `RSS >= 6 GB` or `RSS >= 3 GB` at `>= 85%` CPU | `SIGKILL` detached post-sleep zombie CLI processes via `yolo_agent_guard` |
| `windowserver_swap_cliff` | Runaway `MLX` / `swiftc` child jobs or unbounded context growth driving macOS swap past `12–18 GB` until `WindowServer` resets | `openai/codex#54416` (`18 GB` swap cliff), `anthropics/claude-code#107755` (`100%` memory pressure) | `swapUsedGb >= 12.0` or child `RSS >= 8.0 GB` | Throttle/reap runaway child builds and route local inference to `e-means` `1.23 GB` codebook tier |
| `claude_vm_storage_bloat` | Stale `claude-code-vm` bundles, `.git` pack bloat, and unpruned session logs consuming `25–100+ GB` of SSD free space | `claude-code-vm-cache-bloat` | `claudeVmDiskGb >= 25.0` | Run `yolo_disk_smart_scan` (`clean=true`) to purge stale agent temp caches safely |

### Quick CLI & MCP Verification

```bash
# Classify a live or simulated host telemetry snapshot via the MCP tool surface
node -e '
const { callTool } = require("./tools/mac-yolo-mcp-server");
console.log(callTool("yolo_empirical_freeze_classifier", {
  orphanedGitCount: 309,
  nodeReplOrHelperCount: 85,
  swapUsedGb: 16.0
}));
'
```

---

## 2. Single-Pass Pre-Action Tool Interdiction (`yolo_gemini_decisions_gate`)

Autonomous coding agents frequently attempt high-blast-radius commands (`git reset --hard`, `git push --force`, `launchctl bootout`, or unapproved outbound scripts) before a human can intervene (`anthropics/claude-code#105342`, `openai/codex#55916`).

Traditional autoregressive LLM-as-a-judge hooks add `2–5 seconds` of token-by-token latency and output-token charges on every tool call. `mac-yolo-safeguards` operationalizes the **Google DeepMind Gemini Decisions API (`gemini-decision-1`)** ([`tools/gemini-decisions-engine.js`](../tools/gemini-decisions-engine.js)) to score all 5 pre-action safety, freeze-risk, routing, and blast-radius questions in a **single forward pass (`150–250 ms`, `$0.10 / 1M` input tokens, `$0.00` output tokens)**:

1. `is_destructive_or_irreversible` (`noul`): Binary probability + confidence that the command mutates shared history, deletes data, or triggers external outreach.
2. `triggers_mac_freeze_signature` (`noul`): Binary probability + confidence that the command triggers one of the 5 macOS freeze signatures above.
3. `interdiction_action` (`choice`): Selects across `{ allow_local_silent, allow_with_lease_guard, require_thumbgate_phone_approval, hard_block_fail_closed }`.
4. `execution_model_lane` (`choice`): Selects the lowest-cost safe execution tier (`local_apple_silicon_emeans_vq`, `gemini_decision_control_plane`, `workhorse_flash_lite`, `frontier_deep_reasoning`).
5. `blast_radius_severity` (`score`): Continuous weighted score across an ordered `0..3` rubric.

**Calibrated Confidence Escalation**: Any tool call whose `interdiction_action` confidence falls below `confidenceThreshold` (default `0.75`) automatically escalates to `require_thumbgate_phone_approval` on [ThumbGate](https://thumbgate.app) rather than executing silently.

---

## 3. Bandwidth-Free Local Model Sizing (`yolo_emeans_quant_router`)

Using Meta FAIR's **Exponential Moving Average (`e-means`)** clustering (`arXiv:2611.09501`) and `@shinboson`'s quantization compiler codebook regime ([`tools/emeans-quant-router.js`](../tools/emeans-quant-router.js)):
- Compresses `Qwen3.5-4B` from `8.41 GB` (`bf16`) to an estimated **`1.23 GB`** (`6.84x` compression, `~2.46` effective bits/weight) while retaining an estimated **`91.9%`** benchmark quality.
- Keeps local coding-agent helper inference inside Apple Silicon unified memory headroom without triggering `windowserver_swap_cliff`.

---

## 4. Upgrade to Mac YOLO Safeguards Pro & ThumbGate

- **Open-Source Guard Kit & MCP Server**: Free in [`IgorGanapolsky/mac-yolo-safeguards`](https://github.com/IgorGanapolsky/mac-yolo-safeguards) (`claude mcp add mac-yolo-safeguards -- node tools/mac-yolo-mcp-server.js`).
- **Mac YOLO Safeguards Pro (`$19/mo`)**: Native macOS Translucent Menu Bar HUD (`MacYoloSafeguards.app` running at `< 0.5%` CPU), 60-second autonomous runaway simulator & orphaned-git reaper, and pre-action safety gates — **[Instant Stripe Checkout](https://buy.stripe.com/cNi6oH1M81eSg4pdKz3sJ10)**.
- **ThumbGate Mobile Pre-Action Control Plane**: Approve or block high-blast-radius coding-agent tool calls from your phone — **[https://thumbgate.app](https://thumbgate.app)**.
