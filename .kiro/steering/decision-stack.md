---
inclusion: always
---

# Decision stack — DS / ML / Agentic RAG

**Always** ground decisions in Data Science, ML, and Agentic RAG — user directive.

Before any non-trivial decision, root-cause call, or ship claim:

0. **Orchestrator** — `node tools/ceo-operating-brief.js` (session start; `--full` before ship claims)
1. **RAG** — `node tools/agent-decision-stack.js --task "<decision>" --json` (or `mcp__thumbgate__recall`)
2. **If MISTAKE lesson matches current plan** — change the plan before acting
3. **Telemetry** — structured metrics (CI run ids, test counts, gateway health, durations) not intuition
4. **Hermes operator ML** — `node tools/hermes-decision-loop.js --json` when Telegram/gateway is involved
5. **Revenue DS** — `node tools/pipeline-data-science.js` when prioritizing dollars
6. **Verify** — scoped proof commands in the same turn
7. **Capture** — `mcp__thumbgate__capture_memory_feedback` after fixes/incidents with concrete artifacts

Never claim "synced", "fixed", or "shipped" without evidence + RAG check. See [AGENTS.md](../../AGENTS.md) Decision stack section.
