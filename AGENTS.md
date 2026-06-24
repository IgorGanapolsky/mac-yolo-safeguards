# AGENTS.md — Operating directives for AI agents in this repo

This file is the canonical agent directive. `CLAUDE.md` and `GEMINI.md` redirect here so the rules don't drift.

Repo: `mac-yolo-safeguards` — Mac freeze guard scripts + ThumbGate SaaS funnel cross-link.

---

## Multi-agent coordination (READ FIRST — prevents divergence)

Multiple autonomous agents (Claude Code, Cursor, Antigravity, gemini/codex) work this repo. To NOT
clobber each other, follow the two-layer model (researched 2026-06-24):

1. **Isolation:** one agent per **git worktree + branch**; serialize git ops; **sequential** merge onto `main` (rebase first), gated on `npm test` + Maestro E2E.
2. **Coordination:** [`plan.md`](./plan.md) is the **shared live board**. It is the single source of truth for who is doing what.

**Protocol (every task):**
1. **Read `plan.md`.** Pick a `pending` task whose claimed files are `(free)`.
2. **Claim before you touch** — set Owner+Status in the Task Board AND add your files to the File Ownership Map (your `agent-id` + UTC date), and commit `plan.md` *first*, before editing code.
3. Work only on your claimed files, in your worktree.
4. **Discovered work** → append to plan.md §4; don't silently expand scope.
5. Verify against the task's AcceptanceCheck; on green, set `done`, release your files (append a line), add a Decisions-Log entry.

**The "Never" list (hard rules — violating these is a directive breach):**
- **Never edit a file another agent owns** in `plan.md` §2. Mark your task `blocked`, log it, and **STOP**.
- **Never delete or overwrite another agent's claim, lock, branch, or uncommitted WIP.** (Verified 2026-06-24: gemini had ~330 lines of uncommitted WIP in `GatewayContext.tsx` — barging in would have destroyed it.)
- **Never bypass a verification gate** (tests/E2E) or invent a workaround when blocked — escalate via `blocked` + STOP.
- Logs in `plan.md` (Decisions, Discovered) are **append-only** — add at the end, never rewrite.

Cap concurrency at **2–3 agents** on this tightly-coupled mobile codebase. If your session directive conflicts with an in-progress `plan.md` claim, surface it — do not diverge.

Note: AGENTS.md is read natively by Cursor, gemini/Gemini, Copilot, Aider, Windsurf, Zed, Claude Code. Antigravity may need to be pointed at this file explicitly.

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

Before any non-trivial decision, ship claim, or root-cause call, run the evidence stack — **not** intuition alone.

| Layer | Tool | When |
|-------|------|------|
| **Agentic RAG** | `mcp__thumbgate__recall` or `npx thumbgate lessons "<task>"` | Session start + before claiming fixed/shipped |
| **Code graph RAG** | `.graphify-venv/bin/graphify query "<task>"` | Architecture, CI, cross-file causality |
| **Structured telemetry** | `node tools/agent-decision-stack.js --task "..." --gh-run ID --json` | CI status, timing anomalies, next action |
| **Weak-supervision ML** | `node tools/hermes-decision-loop.js --json` | Telegram / gateway operator safety |
| **Revenue DS** | `node tools/pipeline-data-science.js` | Funnel / propensity (read-only, `business_os/`) |
| **Post-decision capture** | `mcp__thumbgate__capture_memory_feedback` or `thumbgate capture --feedback=down` | Every false ship claim or repeated mistake |

**Protocol**

1. `node tools/agent-decision-stack.js --task "<decision>" [--gh-run ID] --json`
2. If RAG returns a **MISTAKE** matching the current plan → change the plan before acting.
3. Act only when telemetry + verification commands align.
4. Capture features (run id, duration, exit codes) in the lesson — not prose summaries.

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
