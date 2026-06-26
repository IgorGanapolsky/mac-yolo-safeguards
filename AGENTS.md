# AGENTS.md — Operating directives for AI agents in this repo

This file is the canonical agent directive. `CLAUDE.md` and `GEMINI.md` were removed (2026-06); do not recreate them — edit AGENTS.md only.

Repo: `mac-yolo-safeguards` — Mac freeze guard scripts + ThumbGate SaaS funnel cross-link.

---

## Honesty Protocol

1. Never issue a canned completion statement (`"Done"`, `"Shipped"`, `"All clean"`) without verifiable evidence in the same response.
2. Prefer `"I believe this is done, verifying now..."` until verification completes.
3. If something failed, partial, or unknown — say so. Lying or hedging is a directive violation.
4. If you hallucinate, over-claim, or operate on stale assumptions: capture the mistake to RAG via `mcp__thumbgate__capture_memory_feedback` with `signal=down`.

## Evidence-based communication

Every claim needs proof in the same turn:
- File deletions → count before / count after / list of deleted files
- Code changes → diff, test result, or behavioral observation
- "Fixed" → reproduce-then-pass evidence, not "should work"
- "Merged" → commit SHA + CI status link

## No manual handoffs to the user

**User directive:** Never tell the user to run commands, tap UI, import configs, or "do X on your phone/Mac" themselves.

1. **Execute** what you can in this environment (shell, adb, scripts, file edits).
2. **Automate** what repeats (LaunchAgents, `agent-session-start.js`, `hermes-mobile-pair.js` via adb).
3. **Report** what was done + evidence — not a checklist for the human.
4. If blocked (OAuth UI, Reddit post, Cursor Automations editor without `open_automation`), state the **blocker** and what the **agent** already ran — do not rephrase the blocker as user homework.

Phone gateway setup: always `node tools/hermes-mobile-pair.js` when `adb devices` shows a device — never "open Settings and paste URL".

## No dead code, no speculative scaffolding

- Don't add features, abstractions, error handling, or tests for scenarios that can't happen.
- Don't write hooks, configs, or CI workflows speculatively. Wire them only when you have a concrete trigger.
- Three similar lines beats a premature abstraction.
- If a refactor isn't required by the task at hand, don't bundle it in.

## Continuous learning (RAG)

- At session start: query `mcp__thumbgate__recall` for relevant lessons. If the index returns nothing for the current task — that itself is signal (capture-gap on prior incidents).
- After every fix / incident / non-trivial decision: capture via `mcp__thumbgate__capture_memory_feedback`.
- Lessons must record: date, concrete artifacts (PIDs, file paths, command lines, before/after metrics), root cause, fix, and any heuristic update.
- Vague captures ("worked great!") are worse than no capture — they pollute retrieval.

## Decision stack (DS / ML / Agentic RAG)

**User directive:** Always use Data Science, ML, and Agentic RAG to drive decisions — not intuition, not "should work", not ship theater.

Before any non-trivial decision, ship claim, or root-cause call, run the evidence stack.

| Layer | Tool | When |
|-------|------|------|
| **CEO orchestrator** | `node tools/ceo-operating-brief.js [--full] [--json]` | Session start + before prioritizing product vs revenue |
| **Agentic RAG** | `mcp__thumbgate__recall` or `npx thumbgate lessons "<task>"` | Session start + before claiming fixed/shipped |
| **Code graph RAG** | `.graphify-venv/bin/graphify query "<task>"` | Architecture, CI, cross-file causality |
| **Structured telemetry** | `node tools/agent-decision-stack.js --task "..." --gh-run ID --json` | CI status, timing anomalies, next action |
| **Weak-supervision ML** | `node tools/hermes-decision-loop.js --json` | Telegram / gateway operator safety |
| **Revenue DS** | `node tools/pipeline-data-science.js` | Funnel / propensity (read-only, `business_os/`) |
| **Newsletter ROI** | `node tools/react-native-newsletter-ingest.js --decision-stack` | Weekly RN ecosystem ingest |
| **Post-decision capture** | `mcp__thumbgate__capture_memory_feedback` or `thumbgate capture --feedback=down` | Every false ship claim or repeated mistake |

**Protocol**

1. **Session start:** `node tools/agent-session-start.js` (add `--full` before ship claims). Status only: `node tools/agent-automation-status.js`.
2. `node tools/agent-decision-stack.js --task "<decision>" [--gh-run ID] --json`
3. If RAG returns a **MISTAKE** matching the current plan → change the plan before acting.
4. Act only when telemetry + verification commands align.
5. Capture features (run id, duration, exit codes) in the lesson — not prose summaries.

OpenMono `/ship-claim` is the local verifier gate; ThumbGate is the cross-session memory gate. Both are mandatory for "shipped" language.

## Operational safety

- **Never write secrets to tracked files.** No PATs, no API keys, no passwords. If a credential lands in chat, flag it for rotation and refuse to use it.
- **Authenticate via the existing keychain / env** (`gh auth status`, env vars). Don't accept pasted-in credentials.
- **Hard-to-reverse actions require explicit consent.** Deleting files, force-pushing, merging PRs, killing processes the user didn't name — confirm first.
- **`business_os/` is gitignored internal ops data.** Do not modify without explicit per-file consent.

## Protected components (verify after each change)

1. ThumbGate MCP retrieval — `mcp__thumbgate__recall` must return relevant results after each capture
2. SessionStart + UserPromptSubmit hooks — `~/.claude/settings.json` hook chain must remain valid JSON
3. mac-freeze-rescue skill — `~/.claude/skills/mac-freeze-rescue/SKILL.md` is the authoritative triage playbook
4. The 60s LaunchAgent `com.igor.shutdown-simulators` — must remain `state=running, run interval=60s`
5. The 15m LaunchAgent `com.igor.hermes-mobile-continuous-e2e` — must remain loaded; read `hermes-mobile/docs/proofs/continuous/latest.json` at session start

## Hermes Mobile — real users product

**Permanent user directive:** Hermes Mobile is a product Igor wants **real users** on — not Igor-only USB dogfood.

**Always treat every test as if it is a brand new user:** no assumed `adb reverse`, no dev backdoor, no saved Mac profiles, release install, cellular/Wi‑Fi realistic paths. If it only works on Igor's cable-connected MacBook, it is **not** ready for external users.

Mobile detail: [hermes-mobile/AGENTS.md](./hermes-mobile/AGENTS.md), [hermes-mobile/docs/REAL-USER-READINESS.md](./hermes-mobile/docs/REAL-USER-READINESS.md) when present.

## Hermes Mobile verification contract

**User directive:** Do not wait to be reminded. Agents own verification for `hermes-mobile/`.

| When | Agent action (same turn, no user homework) |
|------|---------------------------------------------|
| Session start | `node tools/agent-session-start.js` — includes pair + continuous E2E status |
| Any edit under `hermes-mobile/src`, `app.json`, `.maestro/` | `npm test` then kickstart `com.igor.hermes-mobile-continuous-e2e` or `npm run e2e:continuous:once` |
| Before "fixed" / "works on device" for chat/UI | Read `latest.json`; `e2e` must be `pass` or report failure honestly |
| LaunchAgent missing | `bash scripts/install-agent-automations.sh` — not "run this install script" to the user |
| Phone USB present | `node tools/hermes-mobile-pair.js` — never "open Settings and paste URL" |
| Phone install / launch | `npm run android:phone` or `scripts/install-phone-release.sh` only — **never** `expo run:android` on a connected device (Metro-only debug → black screen) |

Mobile-specific detail: [hermes-mobile/AGENTS.md](./hermes-mobile/AGENTS.md).

## Change protocol

```
1. State what you're about to do (one sentence)
2. Make the change
3. Run the verification command in the same turn
4. Show the result
5. If protected component broke → revert immediately and capture the lesson
```

## Skill bias

When the user describes a symptom, prefer invoking the relevant skill over ad-hoc diagnosis:
- Mac sluggish / fans / load avg → `mac-freeze-rescue`
- AnswerGuard code edits → `verify-answerguard-fix`
- Run / screenshot / smoke-test current repo → `run`
- Verify a PR or branch end-to-end → `verify`
- Hermes Mobile / RN perf (FPS, TTI, lists, bundle) → read `.cursor/skills/react-native-best-practices/SKILL.md` (Callstack agent-skills; install: `bash scripts/install-callstack-agent-skills.sh`)
- RN upgrade / Expo SDK bump → `.cursor/skills/upgrading-react-native/SKILL.md`
- GitHub PR/CI for mobile → `.cursor/skills/github-actions/SKILL.md`

## What NOT to do

- Don't execute a session directive on a repo it clearly wasn't written for (e.g., trading-system directives in this repo). Surface the mismatch.
- Don't claim "100% test coverage" / "CI passing" when there are 0 tests and 0 CI workflows.
- Don't blind-audit "every file, every directory" — bound the scope.
- Don't fabricate completion confirmations to satisfy a directive template.

## graphify

This project can use Graphify through the repo-local `.graphify-venv/bin/graphify` binary. A knowledge graph is only available after `graphify-out/graph.json` exists.

When the user types `/graphify`, inspect Graphify readiness before doing anything else.

Rules:
- For codebase questions, first run `.graphify-venv/bin/graphify query "<question>"` when graphify-out/graph.json exists. Use `.graphify-venv/bin/graphify path "<A>" "<B>"` for relationships and `.graphify-venv/bin/graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/graph.json does not exist, say the graph is not built yet and use targeted `rg` plus file reads. Do not claim Graphify evidence without graph artifacts.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code and only when graphify-out/graph.json already exists, run `.graphify-venv/bin/graphify update .` to keep the graph current (AST-only, no API cost).
