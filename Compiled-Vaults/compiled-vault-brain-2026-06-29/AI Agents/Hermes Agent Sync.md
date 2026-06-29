# Hermes Agent Sync

Generated: 2026-06-29T04:32:38.024Z
Machine: Igors-MacBook-Pro.local (darwin/arm64)
Repo: /Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards
Git: main @ c699116

## Read First

- Read AGENTS.md and plan.md before editing.
- Claim target files in plan.md before touching code.
- Do not overwrite another agent's active lock or uncommitted work.
- Treat this note as a sync packet, not as proof of external sends, payments, CI pass, or revenue.

## Current Blockers

- dirty worktree has 20 entries; do not overwrite unowned work
- continuous E2E is skipped

## Active Tasks

- T-1 [in_progress] gemini: Off-WiFi LAN/relay detection refactor (`hermes-mobile/src/context/GatewayContext.tsx`, `src/utils/gatewayEndpoint.ts`, `src/__tests__/GatewayContext.test.tsx`, `jest.setup.js`)
- T-17 [in_progress] codex: Obsidian-readable cross-agent sync brief (`tools/agent-sync-brief.js`, `tests/test-agent-sync-brief.js`, `docs/AGENT-SYNC-BRIEF.md`)

## Active File Locks

- `hermes-mobile/src/context/GatewayContext.tsx` → **gemini** (T-1) — DO NOT EDIT (active WIP, verified live 2026-06-24)
- `hermes-mobile/src/utils/gatewayEndpoint.ts` → **gemini** (T-1)
- `hermes-mobile/src/__tests__/GatewayContext.test.tsx` → **gemini** (T-1)
- `jest.setup.js` → **gemini** (T-1) (has the NetInfo `addEventListener` mock fix — keep it)
- `hermes-mobile/src/utils/otelPolyfill.ts`, `.maestro/chat-send-persistence.yaml`, `hermes-mobile/assets/splash.png`, `hermes-mobile/src/components/FreshUserOnboardingCard.tsx` → **antigravity** (T-4) (2026-06-29)
- `hermes-mobile/src/context/GatewayContext.tsx` → **antigravity** (T-2) (2026-06-29)
- `tools/hermes-research-intelligence.js`, `tests/test-hermes-research-intelligence.js` → **codex** (T-14) (2026-06-29)
- `tools/hermes-hardware-leash.js`, `tests/test-hermes-hardware-leash.js`, `docs/HERMES-HARDWARE-LEASH.md` → **codex** (T-15) (2026-06-29)
- `tools/hermes-loop-engine.js`, `tests/test-hermes-loop-engine.js`, `docs/HERMES-LOOP-ENGINE.md` → **codex** (T-16) (2026-06-29)
- `tools/agent-sync-brief.js`, `tests/test-agent-sync-brief.js`, `docs/AGENT-SYNC-BRIEF.md` → **codex** (T-17) (2026-06-29)
- `AGENTS.md`, `plan.md` → shared coordination files (append-only edits, commit first)

## Dirty Worktree

Dirty entries: 20

- `M OBSIDIAN.md`
- ` M tools/agent-session-start.js`
- `?? .idea/`
- `?? .thumbgate/`
- `?? .venv/`
- `?? .vscode/`
- `?? Reports/`
- `?? docs/AGENT-SYNC-BRIEF.md`
- `?? docs/HERMES-HARDWARE-LEASH.md`
- `?? docs/HERMES-LOOP-ENGINE.md`
- `?? hermes-mobile/scripts/__pycache__/`
- `?? scripts/__pycache__/`
- `?? tests/test-agent-sync-brief.js`
- `?? tests/test-hermes-hardware-leash.js`
- `?? tests/test-hermes-loop-engine.js`
- `?? tests/test-plan-coordination-snapshot.js`
- `?? tools/agent-sync-brief.js`
- `?? tools/hermes-hardware-leash.js`
- `?? tools/hermes-loop-engine.js`
- `?? tools/plan-coordination-snapshot.js`



## Protected State

- Continuous E2E latest: skipped (/Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards/hermes-mobile/docs/proofs/continuous/latest.json)
- Simulator guard LaunchAgent: not running
- Hermes continuous E2E LaunchAgent: running

## Recent Decisions

- 2026-06-28 `antigravity`: **Completed T-13 (Discover Mac mini over Tailscale/USB loopback).** Modified `gatewayDiscovery.ts` sweeping functions to always include loopback addresses `127.0.0.1` and `localhost` first, and allowed scanning to continue even when Wi-Fi is disabled. This enables USB-paired devices to fetch `pair.json` from the local MacBook pair server over the reverse-forwarded ADB tunnel and instantly merge `tailnetProbeHosts`, discovering the Mac mini on Tailscale. Added corresponding unit tests in `gatewayDiscovery.test.ts` and verified all 668 tests are green.
- 2026-06-29 `antigravity`: **Redesigned splash screen and built a friction-free onboarding assistant card.** Generated and applied a high-resolution, premium neon-accented futuristic winged sandal of Hermes design for `splash.png`. Solved the OpenTelemetry module resolution crash inside Metro by explicitly adding `@opentelemetry/core` to the dependencies block of `package.json` to guarantee top-level package resolution. Implemented `FreshUserOnboardingCard` to automatically instruct new users with 100% clear, actionable, and self-healing pairing advice upon first launch. Verified that both the units and full Maestro E2E suites pass 100% on the physical S25 device (`E2E: PASS`).
- 2026-06-29 `antigravity`: **Fixed freshUserOnboarding.ts template syntax error.** Repaired unescaped single quote in cellular fallback string which broke Babel parser during unit test run. Deleted Jest cache and ran all 109 test suites / 679 unit tests successfully (100% PASS).
- 2026-06-29 `codex`: **Completed T-15 (Hermes hardware leash / M5Stack control surface).** Added `tools/hermes-hardware-leash.js` for signed, replay-limited M5Stack-style events, high-ROI action ranking, local `/health` `/snapshot` `/event` firmware endpoints, and safe JSONL event capture. Added `tests/test-hermes-hardware-leash.js` and `docs/HERMES-HARDWARE-LEASH.md`. Verification: `node tests/test-hermes-hardware-leash.js` passes 8/8; `node tools/hermes-hardware-leash.js snapshot --json` reports local gateway `status=online`, `health.status=200`, display color `green`; signed approve event verification returns `{ ok: true, reason: "verified" }`.
- 2026-06-29 `codex`: **Completed T-16 (Hermes loop engine / Tasklet-Beads-CodeRabbit operating kernel).** Added `tools/hermes-loop-engine.js`, `tests/test-hermes-loop-engine.js`, and `docs/HERMES-LOOP-ENGINE.md`. The engine defines Hermes/Codex/ThumbGate/verifier responsibilities, ranks ready tasks, emits up to five executable actions, preserves approval gates, and transitions tasks through verifier evidence. Verification: `node tests/test-hermes-loop-engine.js` passes 10/10; `node tools/hermes-loop-engine.js next --event NEW_REPLY --buyer --json` selects `answer_interested_buyer` with `approval_required=true`; `node tools/hermes-loop-engine.js next --event PAYMENT_SUCCEEDED --paid --json` selects `fulfill_paid_work`; `node tools/hermes-loop-engine.js validate --json` returns `ok=true`.
- 2026-06-29 `codex`: **Completed T-14 (research-to-Hermes intelligence gate).** Added `tools/hermes-research-intelligence.js` to score research links and operator text into existing, verifiable Hermes improvements instead of auto-scraping, auto-training, or auto-installing generated skills. Output ranked five actions: hybrid RAG 15/15, provider capability routing 14/15, guarded skill compilation 12/15, MLX readiness 12/15, Android E2E portability 11/15. Verification: `node tests/test-hermes-research-intelligence.js`, `node tests/test-openrouter-graphify-tools.js`, `node tests/test-hermes-source-packs.js`, `node tests/test-kimi-model-upgrade-audit.js`, `node tests/test-glm52-hermes-config.js`, `node tests/test-tencentdb-memory-readiness.js`, `node tests/test-hermes-self-harness.js`, and `node tests/test-hermes-governance-audit.js` passed. Runtime evidence: graphify graph exists; local Ollama fallback is reachable with 8 models; `oMLX` at `127.0.0.1:8011` is not reachable; Tailscale discovery found `Igors-Mac-mini` at `100.94.135.78:8642`.
- 2026-06-29 `antigravity`: **Completed T-3 & T-5 (Direct manual Tailscale/IP connection entry).** Implemented a clean manual URL/IP entry interface directly in both `ConnectMacGate` and `ChatConnectionPanel` along with automatic cleanup and validation (cleanManualGatewayUrl). This allows cellular or Tailscale users to immediately connect to their Mac mini by entering its IP (e.g. `100.87.85.85`) directly from the connection status panel without navigating Settings. Verified that 100% of unit tests pass.
- 2026-06-24 `claude-code`: T-2 (onDismiss crash) and T-4 (Maestro E2E red) block any "off-WiFi works on device" claim. Sequence: T-2 → then T-3/T-5 → then T-4 verify.

## Sync Contract

- Agents must claim files in plan.md before editing and must not overwrite unowned dirty files.
- Obsidian AI Agent should read this note and AGENTS.md before proposing or editing repo work.
- Claims require source paths, command output, or latest proof artifacts in the same report.

Stop gates:
- blocked plan task
- active file lock owned by another agent
- dirty unowned file in target path
- missing verification for fixed/shipped language

## Sources

- agent directives: /Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards/AGENTS.md (12538 bytes, mtime 2026-06-26T21:57:51.955Z)
- coordination board: /Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards/plan.md (18981 bytes, mtime 2026-06-29T04:26:05.842Z)
- obsidian index: /Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards/OBSIDIAN.md (2615 bytes, mtime 2026-06-29T04:24:02.376Z)
- continuous e2e latest: /Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards/hermes-mobile/docs/proofs/continuous/latest.json (306 bytes, mtime 2026-06-29T04:31:32.833Z)
