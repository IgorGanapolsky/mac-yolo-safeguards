# Hermes Agent Sync

Generated: 2026-06-29T05:19:51.363Z
Machine: Igors-MacBook-Pro.local (darwin/arm64)
Repo: /Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards
Git: main @ 94ec691

## Read First

- Read AGENTS.md and plan.md before editing.
- Claim target files in plan.md before touching code.
- Do not overwrite another agent's active lock or uncommitted work.
- Treat this note as a sync packet, not as proof of external sends, payments, CI pass, or revenue.

## Current Blockers

- dirty worktree has 18 entries; do not overwrite unowned work
- continuous E2E is skipped

## Active Tasks

- T-1 [in_progress] gemini: Off-WiFi LAN/relay detection refactor (`hermes-mobile/src/context/GatewayContext.tsx`, `src/utils/gatewayEndpoint.ts`, `src/__tests__/GatewayContext.test.tsx`, `jest.setup.js`)

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
- `tools/recursive-experiment-loop.js`, `tests/test-recursive-experiment-loop.js`, `docs/RECURSIVE-EXPERIMENT-LOOP.md` → **codex** (T-18) (2026-06-29)
- `tools/recursive-experiment-loop.js`, `tests/test-recursive-experiment-loop.js`, `docs/RECURSIVE-EXPERIMENT-LOOP.md`, `docs/RECURSIVE-IMPROVEMENTS.md` → **codex** (T-20) (2026-06-29)
- `tools/hermes-ai-vault.js`, `tests/test-hermes-ai-vault.js`, `docs/HERMES-AI-VAULT.md` → **codex** (T-19) (2026-06-29)
- `hermes-mobile/scripts/run-continuous-e2e.sh` → **codex** (T-21 emergency load-safety patch) (2026-06-29)
- `tools/hermes-ai-vault.js`, `tests/test-hermes-ai-vault.js`, `docs/HERMES-AI-VAULT.md` → **codex** (T-22 LLM vault wiring) (2026-06-29)
- `tools/recursive-experiment-loop.js`, `tests/test-recursive-experiment-loop.js`, `docs/RECURSIVE-EXPERIMENT-LOOP.md` → **codex** (T-23 Arena-style token efficiency gate) (2026-06-29)
- `AGENTS.md`, `plan.md` → shared coordination files (append-only edits, commit first)

## Dirty Worktree

Dirty entries: 18

- `M "Compiled-Vaults/compiled-vault-brain-2026-06-29/AI Agents/Hermes Agent Sync.json"`
- ` M "Compiled-Vaults/compiled-vault-brain-2026-06-29/AI Agents/Hermes Agent Sync.md"`
- ` M Compiled-Vaults/compiled-vault-brain-2026-06-29/Source-Traces/plan-snapshot.md`
- ` M docs/HERMES-AI-VAULT.md`
- ` M docs/RECURSIVE-EXPERIMENT-LOOP.md`
- ` M plan.md`
- ` M tests/test-hermes-ai-vault.js`
- ` M tests/test-recursive-experiment-loop.js`
- ` M tools/hermes-ai-vault.js`
- ` M tools/recursive-experiment-loop.js`
- `?? .thumbgate/`
- `?? Reports/`
- `?? docs/HERMES-HARDWARE-LEASH.md`
- `?? docs/HERMES-LOOP-ENGINE.md`
- `?? tests/test-hermes-hardware-leash.js`
- `?? tests/test-hermes-loop-engine.js`
- `?? tools/hermes-hardware-leash.js`
- `?? tools/hermes-loop-engine.js`



## Protected State

- Continuous E2E latest: skipped (/Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards/hermes-mobile/docs/proofs/continuous/latest.json)
- Simulator guard LaunchAgent: not running
- Hermes continuous E2E LaunchAgent: running

## Recent Decisions

- 2026-06-29 `codex`: **Completed T-17 (Obsidian-readable cross-agent sync brief).** Added `tools/agent-sync-brief.js`, `tests/test-agent-sync-brief.js`, and `docs/AGENT-SYNC-BRIEF.md`. The tool writes gitignored Markdown+JSON sync packets for Codex, Claude, Cursor, Gemini, Hermes, and Obsidian AI Agent, includes plan tasks/locks, dirty worktree state, latest E2E proof state, LaunchAgent state, recent decisions, source mtimes, and redacts common secrets. Verification: `node tests/test-agent-sync-brief.js` passes 6/6; `node tools/agent-sync-brief.js` wrote `artifacts/agent-sync/Hermes-Agent-Sync.md` and `.json`, observed 15 dirty entries and 2 active tasks.
- 2026-06-29 `codex`: **Completed T-18 (Recursive experiment loop evaluator).** Added `tools/recursive-experiment-loop.js`, `tests/test-recursive-experiment-loop.js`, and `docs/RECURSIVE-EXPERIMENT-LOOP.md`. The tool turns public Recursive-style automated research patterns into Hermes gates: closed loops, tight evaluators, retained context, branch-combine plans, reward-hack checks, and variance checks. Verification: `node tests/test-recursive-experiment-loop.js` passes 9/9; `node tools/recursive-experiment-loop.js plan --json --task "recursive automated research hermes llm second brain sync"` selected `cross_agent_sync_packet` first with score 153 and no rejected experiments.
- 2026-06-29 `codex`: **Completed T-20 (Recursive-style experiment ledger and adoption gate).** Extended `tools/recursive-experiment-loop.js` with private JSONL outcome recording at `~/.hermes/recursive-experiment-ledger.jsonl`, `adopt`/`retry`/`reject` evaluation, lower-is-better metric support, evaluator/reward-hack/variance gates, and ledger summary output. Cleaned `docs/RECURSIVE-IMPROVEMENTS.md` to say adapted public pattern instead of sloppy "stolen idea" language. Verification: `node tests/test-recursive-experiment-loop.js` passes 16/16; CLI smoke recorded `cross_agent_sync_packet` as `adopt` in a temp ledger and summarized `total=1, adopt=1`.
- 2026-06-29 `codex`: **Completed T-21 (continuous E2E load-safety patch).** Live Mac load was `142.13 81.13 108.37`; top offenders were Gradle 9 daemon, KotlinCompileDaemon, Maestro, iOS simruntime services, and continuous E2E. Stopped the current E2E/simulator/build storm, reducing load to `11.88 36.60 77.54` after rolling average decay. Patched `hermes-mobile/scripts/run-continuous-e2e.sh` so continuous E2E skips when load exceeds `6` or simruntime process count exceeds `80` unless `HERMES_E2E_FORCE=1`. Verification: `bash -n` passed; `bash hermes-mobile/scripts/run-continuous-e2e.sh --once` wrote `unit=skipped`, `e2e=skipped`, detail `load 16.84 exceeds max 6`; LaunchAgent reloaded, exited `0`, stayed loaded on 900s interval, and simruntime count stayed `0`.
- 2026-06-29 `codex`: **Completed T-19 (vendor-agnostic Hermes AI vault context packs).** Added `tools/hermes-ai-vault.js`, `tests/test-hermes-ai-vault.js`, and `docs/HERMES-AI-VAULT.md`. The compiler builds a local Markdown+JSON vault for Hermes and LLM tools with README, AGENTS, source manifest, state, validation report, source index, context packs, procedures, recent decisions, Kubernetes-style status conditions, and Arena-inspired token-efficiency context. Verification: `node tests/test-hermes-ai-vault.js` passes 8/8; `node tools/hermes-ai-vault.js build --json` wrote 13 files under `artifacts/hermes-ai-vault`; `node tools/hermes-ai-vault.js validate --vault artifacts/hermes-ai-vault --json` returned `ok=true`, 13 files checked, 0 missing required paths, 0 secret findings, and 0 provenance findings.
- 2026-06-29 `codex`: **Completed T-22 (Hermes AI vault wired into all LLM tools).** Extended `tools/hermes-ai-vault.js` with generated entrypoints for Codex, Claude, Gemini, GPT, Hermes, Ollama Local, and Obsidian; added `Routing/llm-routing.json`, task/context templates, vault interview procedure, and `install` mode to write the live vault to `~/.hermes/ai-vault` plus pointer `~/.hermes/AI_VAULT.md`. Verification: `node tests/test-hermes-ai-vault.js` passes 11/11; repo vault validation returned `ok=true`, 24 files, 0 missing, 0 secret findings, 0 provenance findings; installed Hermes vault validation at `/Users/igorganapolsky/.hermes/ai-vault` also returned `ok=true`, 24 files, 0 missing, 0 secret findings, 0 provenance findings.
- 2026-06-29 `codex`: **Completed T-23 (Arena-style token efficiency gate).** Added `arena_token_efficiency_benchmark` and `efficiency` scoring to `tools/recursive-experiment-loop.js`, measuring verified task improvement per 1k output tokens and subtracting penalties for tool hallucinations, bash recovery failures, latency, cost, and evaluator failure. Verification: `node tests/test-recursive-experiment-loop.js` passes 20/20; good CLI smoke returned `route=cheap_or_local_candidate`, `score=30`, `per1kOutputTokens=[REDACTED]`; hallucinated CLI smoke returned `route=do_not_promote`, `score=-20`, and exited non-zero as expected; `node tools/recursive-experiment-loop.js validate --json` returned `ok=true` for all 7 default experiments; planner ranked `arena_token_efficiency_benchmark` first for `arena token efficiency model routing` with score 151.
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
- coordination board: /Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards/plan.md (26916 bytes, mtime 2026-06-29T05:14:32.818Z)
- obsidian index: /Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards/OBSIDIAN.md (2615 bytes, mtime 2026-06-29T05:01:01.433Z)
- continuous e2e latest: /Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards/hermes-mobile/docs/proofs/continuous/latest.json (375 bytes, mtime 2026-06-29T05:01:40.905Z)
