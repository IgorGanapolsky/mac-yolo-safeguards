# Decision stack, RAG learning & research routing — full detail

> Extracted verbatim from `AGENTS.md` on 2026-07-29 to keep the always-injected core small.

## Continuous learning (RAG)

- At session start: query `mcp__thumbgate__recall` for relevant lessons. If the index returns nothing for the current task — that itself is signal (capture-gap on prior incidents).
- After every fix / incident / non-trivial decision: capture via `mcp__thumbgate__capture_memory_feedback`.
- Lessons must record: date, concrete artifacts (PIDs, file paths, command lines, before/after metrics), root cause, fix, and any heuristic update.
- Vague captures ("worked great!") are worse than no capture — they pollute retrieval.

## Closed feedback loop on discovered bug classes (added 2026-07-22)

When a session finds a real, recurring failure class — not a one-off typo — encode a
deterministic check for it in `tools/` and wire it into `.github/workflows/ci.yml`,
rather than relying on remembering to re-verify by hand next time. Pattern from
Anthropic's AI-native SDLC security writeup: shift detection left, prefer deterministic
checks over agentic re-verification for facts that are cheap to check by URL/API.

Example: `tools/check-store-links.js` — added after a stale ground-truth table caused
six live social posts to link a Play package Igor had ordered unpublished (2026-07-22).
Checks live Play/App Store state plus scans `docs/social/hermes-mobile-content-*` for
dead-link promotion; runs in the `revenue-public-checks` CI job. Network failures warn,
they never fail CI — only a confirmed contradicting state (or a doc scan hit, which is
network-independent) fails the build.

## Parallel research routing (added 2026-07-13)

**Default:** `parallel-cli search` (web-search) for lookups, pricing, API docs, and current events. Fast and cost-effective.

**Deep research** (`parallel-cli research run`) — **only** when the user explicitly asks for exhaustive/comprehensive/deep research, or a decision-grade report (e.g. platform migration, vendor comparison).

**Protocol (every deep-research task):**

1. **Recall first** — `mcp__thumbgate__recall` or `parallel-cli` lessons before launching a new run (avoid duplicate spend).
2. **Record run_id** — append to `plan.md` Decisions log or task comment immediately after launch.
3. **Poll and ingest same session** — `parallel-cli research poll <run_id>` → write `docs/RESEARCH-<topic>-YYYY-MM.md` with run_id, verdict, and action checklist. Raw output stays in `parallel-research/`.
4. **Capture** — `mcp__thumbgate__capture_memory_feedback` if a run completes without ingest (orphan-run lesson).

Orphan deep-research runs block downstream decisions and waste API spend. Never fire-and-forget.

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
