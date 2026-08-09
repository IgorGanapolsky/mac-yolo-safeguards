---
name: linear-agent-skills
description: Complete skill suite for Linear AI Agent workspace automation, multi-agent tagging, cycle-time telemetry, automated project health updates, and ThumbGate RAG retrospective promotion.
---

# Linear Agent Skills & Automation Suite (August 2026 Edition)

This skill equips coding agents (Antigravity, Claude Code, Cursor, Codex, Gemini, Herdr) to interact autonomously with the Linear Agent interface (`https://linear.app/docs/linear-agent`), manage issue locks, record resolution cycle metrics, generate automated project health reports, and auto-promote retrospective learnings to ThumbGate RAG memory.

---

## Skill Components

### 1. `linear-agent-closeout`
**Trigger**: When closing or marking a Linear issue as `Done`.
**Command**:
```bash
node tools/linear-agent-bridge.js --done <ISSUE_ID> \
  --agent <PRIMARY_AGENT> \
  --co-agents <SECONDARY_AGENTS> \
  --duration "<CYCLE_TIME>" \
  --bottleneck "<BOTTLENECK_DESCRIPTION>" \
  --improvement "<ACTIONABLE_STRATEGY>" \
  --comment "<PR_OR_SHA_PROOF>"
```
**Effect**:
- Sets Linear issue state to `Done`.
- Attaches labels: `agent:<primary>`, `agent:<co-agent>`, and `agents-multi` (if multiple agents).
- Posts structured **Agent Completion & Cycle Time Report** markdown comment.
- Auto-promotes `--improvement` strategy to **ThumbGate RAG memory** via `npx thumbgate capture`.
- Writes mirror claim note in Obsidian Vault (`~/Documents/AI-Agent-Sync/Handoffs/linear-claims/`).

---

### 2. `linear-agent-project-health`
**Trigger**: At session end, weekly review, or when updating Linear project status.
**Command**:
```bash
node tools/linear-project-update.js
```
**Effect**:
- Queries live GitHub open PR count, auto-merge queue state, CI test suite pass rate, and physical device E2E proofs.
- Publishes an updated `ProjectUpdate` to Linear GraphQL API (`health: onTrack`).
- Updates project overview dashboard on `linear.app`.

---

### 3. `linear-agent-swarm-lock`
**Trigger**: Before starting multi-file work on a new ticket.
**Command**:
```bash
node tools/linear-agent-bridge.js --claim <ISSUE_ID> \
  --agent <PRIMARY_AGENT> \
  --co-agents <SECONDARY_AGENTS> \
  --files <FILE_LIST>
```
**Effect**:
- Sets Linear issue state to `In Progress`.
- Attaches `agent-lock` and agent attribution labels.
- Creates local WIP lock in Obsidian Vault (`~/Documents/AI-Agent-Sync/Handoffs/linear-claims/`).
- Verifies zero file-contention collisions across active agent worktrees.

---

## Linear Agent Workspace Prompt Template

When configuring custom skills in the Linear Agent UI (`linear.app` -> `Agent` -> `Skills` -> `+ Create skill`), use the following system prompt definitions:

### Skill: **Closeout & Cycle Time Telemetry**
```text
When an issue is completed or resolved:
1. Verify PR commit SHA or CI test proof.
2. Label issue with agent attribution (agent:<name>, agents-multi).
3. Compute cycle time from claim timestamp to closure.
4. Extract bottlenecks and retrospective improvement strategy.
5. Post completion report comment and sync to Obsidian Vault + RAG memory.
```

### Skill: **Project Health Auditor**
```text
When drafting a project status update:
1. Audit open PRs, auto-merge queue, and CI build status.
2. Verify physical device E2E pass rates (Android Galaxy & iPad).
3. Mark project health as onTrack (or atRisk/offTrack if blockers exist).
4. Publish formatted status update to Linear project overview.
```

---

## Verification & Health Check

Run the coordination health check at any time:
```bash
node tools/linear-agent-bridge.js --coord-status
```
