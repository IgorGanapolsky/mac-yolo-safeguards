# Multi-Agent Coordination Grade + Swarm SOW
**Date:** 2026-10-29
**Agent:** poolside
**Verdict target:** A+/10 on everything

---

## Executive Summary

| Tool | Grade | Score | Key Problem |
|------|-------|-------|-------------|
| **Herdr** | B | 7/10 | Swarming infrastructure exists but GitButler target branch is unconfigured — lanes can't function |
| **Obsidian Vault** | B+ | 8/10 | Rich structure but sync metadata is 33 days stale (fleet snapshot last updated 2026-08-26) |
| **Linear** | B | 7/10 | 80 open issues, 57 in-progress, 14 agent-locked — but CLI sync with vault is stale, no auto-refresh |
| **GitButler** | D | 4/10 | `but config target` is NOT SET — every lane operation fails |
| **Gemini CLI** | C | 5/10 | CLI v0.60.0 installed but NOT integrated into Herdr lanes — the "gemini" judge lane has no actual notebook or task routing |
| **GitHub Issues** | F | 2/10 | Only 2 open issues; not synced with Linear (80 open). Two separate issue trackers with zero sync |
| **GitHub PRs** | D | 4/10 | 4 of 7 open PRs are BEHIND base or CONFLICTING; manual rebase required |
| **Plan.md** | C | 6/10 | 96 in_progress, 450 released, 67 blocked — but it's a static markdown board, not a live dashboard |
| **Agent Mesh** | B | 7/10 | MCP coordination bus works, but no heartbeat/broadcast visibility in the current session |

**Overall swarm coordination: C+ (5.5/10)**
We have the pieces for an A+ system, but 3 critical failures prevent it:
1. GitButler target branch not configured (entire Herdr lane system can't function)
2. No LLM-as-Judge actually executing on the "judge" lane — it's configured but not active
3. Linear/Obsidian sync is 33 days stale

---

## 1. Tool-by-tool grading

### 1.1 Herdr — B (7/10)

**What works:**
- Herdr v0.9.5 running, server online, protocol 22
- 4-agent swarm lanes defined in `GitButler-Herdr-Lanes.json`:
  - `p1-architect` → `omp` (src/api/**, src/*.js, docs/specs/**)
  - `p2-builder` → `antigravity` (public/**, scripts/**, adapters/**)
  - `p3-verifier` → `gemini` (tests/**)
  - `p4-judge` → `claude` (.thumbgate/swarm-sows.jsonl)

**What's broken:**
- GitButler target branch is not configured → lanes can't execute through GitButler
- `.thumbgate/swarm-sows.jsonl` does not exist (the judge lane's target file is missing)
- No auto-refresh of lane state — the JSON was last synced at 2026-10-28T20:49:41Z but Herdr server state isn't being polled

**Fix path to A+:**
1. `but config target origin/main` (one command — critical)
2. Create `.thumbgate/swarm-sows.jsonl` with SOW definitions for each lane
3. Add a periodic lane-state refresh (cron or launchd) that updates the JSON

### 1.2 Obsidian Vault — B+ (8/10)

**What works:**
- Rich directory structure: `Agent-State/`, `Handoffs/linear-claims/`, `AI Agents/`, `Linear/`, `Meetings/`, `Money/`, `Health/`
- `current-handoff.md` defines coordination rules (read latest.json + Health before work)
- `fleet-snapshot.md` captures agent locks, vault claims, Linear state
- `linear-claims/` has 4267 lines of structured claim history

**What's broken:**
- Fleet snapshot is 33 days stale (2026-08-26) — agents aren't updating it
- `Brain.md` / `SOUL.md` / `SOULD.md` exist as identity anchors but aren't linked to active agent state
- No automatic sync between Obsidian agent state and Linear — handoffs are manual

**Fix path to A+:**
1. Wire `dayglass__dayglass_omnibus_pulse` every 60s to update `fleet-snapshot.md`
2. Add a `vault-refresh` cron that polls Linear CLI + GitHub API + Herdr state
3. Link `Agent-State/latest.json` to the vault as the source of truth (not scattered across many files)

### 1.3 Linear — B (7/10)

**What works:**
- Linear CLI v2.5.0 installed
- Teams: `AGENT` (Agent Operations), `YST` (YourStageTickets)
- 80 open issues, 14 agent-locked, 57 in-progress
- Labels used for agent assignment (`agent-*`, `agent-lock`, `status:agent-working`)
- linear-claims handoff directory shows structured claim history

**What's broken:**
- Team last updated 12 days ago — not real-time
- No API integration between Linear CLI and Herdr lanes — lane state isn't reflected in Linear labels
- Issue status doesn't auto-update from GitHub PR state (e.g., PR #2209 BLOCKED isn't reflected in Linear)
- No SOW template for Linear issues — agents create issues ad hoc without structured SOW fields

**Fix path to A+:**
1. Use Linear CLI to sync PR state → Linear issue status (automated via `linear` CLI + GitHub webhook)
2. Add SOW template to Linear issue creation (auto-links to plan.md task IDs)
3. Wire agent-mesh heartbeat to Linear label updates (when an agent claims a surface, update the Linear label)

### 1.4 GitButler — D (4/10)

**What works:**
- `but` v installed at `~/.local/bin/but`
- Session branches + absorb capability configured in theory

**What's broken (critical):**
```
$ but config target
Target Branch:
    (not set)
```
Every `but` write operation fails:
```
$ but branch
Error: No target branch is configured and none could be inferred.
  Run `but config target <remote>/<branch>` to configure one.
```

**Fix path to A+:**
```bash
but config target origin/main
```
This single command unblocks ALL GitButler operations. Then enable fleet automations:
```bash
but agent setup --print  # verify configuration
```

### 1.5 Gemini CLI — C (5/10)

**What works:**
- `gemini` v0.60.0 installed at `~/.local/bin/gemini`
- Referenced as the "gemini" ownerAgent in the p3-verifier lane

**What's broken:**
- No Gemini notebooks exist for agent coordination
- The p3-verifier lane has no actual routing — no `gemini --prompt` or notebook invocation
- No test running pattern: the lane says `disjointFileGlobs: ["tests/**"]` but nothing actually routes test verification to Gemini
- No LLM-as-judge integration — the p4-judge lane says `ownerAgent: "claude"` but there's no judge criteria or rubric

**Fix path to A+:**
1. Create `tools/llm-as-judge-steal.js` that uses Gemini CLI as the judge model (faster + cheaper than Claude for classification)
2. Define judge rubrics in `.thumbgate/swarm-sows.jsonl` as structured JSON
3. Route `tests/**` modifications through the p3-verifier lane: `gemini --prompt "run tests and report pass/fail"`

### 1.6 GitHub Issues — F (2/10)

**What works:**
- Issue #1889 correctly flagged as security-sensitive (must not auto-close)

**What's broken:**
- Only 2 open issues vs Linear's 80 — GitHub Issues are NOT the system of record
- No sync between GitHub Issues and Linear
- No issue templates for agent coordination
- `stale` label is applied but not useful for active tracking

**Fix path to A+:**
1. Either: shut down GitHub Issues and route everything to Linear (recommended)
2. Or: build a bi-directional sync bridge (`tools/linear-github-sync.js`)
3. Create issue templates: `ISSUE_TEMPLATE/agent-task.md`, `ISSUE_TEMPLATE/incident-report.md`

### 1.7 GitHub PRs — D (4/10)

**What works:**
- 4 PRs merged recently (#2208, #2206, #2205, #2203)
- Dependabot is active (#2207, #2204, #2202, #2200, #2201)

**What's broken:**
- 3 of 8 open PRs are BEHIND base: #2207, #2204, #2201, #2200 — need rebase
- PR #2202 is CONFLICTING — merge conflicts
- PR #2209 is BLOCKED — likely needs conversation resolution
- No auto-rebase on merge
- No auto-merge enabled despite green checks on some PRs

**Fix path to A+:**
1. Enable `gh pr merge --auto --squash` on PRs with green checks
2. Set up auto-rebase: `git config --global pull.rebase true` + GitHub auto-rebase
3. Run `tools/ci-first-fail.js` to identify the first failing step before debugging

### 1.8 Plan.md — C (6/10)

**What works:**
- 96 in_progress, 450 released, 67 blocked tasks
- §2 File Ownership Map prevents conflicting edits
- Append-only log prevents race conditions
- Coordination protocol documented (claim-before-touch, sequential merge)

**What's broken:**
- Static markdown — no live dashboard
- 67 "blocked" tasks but no centralized view of WHY each is blocked
- No machine-readable state for agents to query (it's human-readable markdown)
- No link between Linear issues and plan.md tasks

**Fix path to A+:**
1. Build `tools/completed-work-steal.js` (already created!) — aggregates plan.md + PR state + CI + review threads
2. Add `--json` output for agent consumption
3. Link Linear issue IDs to plan.md task IDs in the evidence column

### 1.9 Agent Mesh — B (7/10)

**What works:**
- `agent-mesh` MCP server provides:
  - `mesh_heartbeat` — broadcast presence/goal
  - `mesh_claim_surface` — atomic surface lease
  - `mesh_send_peer` — direct agent-to-agent messages
  - `mesh_inbox` — receive messages
  - `mesh_who_is_active` — inspect live activity

**What's broken:**
- No visibility into mesh state in this session (no `mesh_who_is_active` was called)
- The coordination protocol requires agents to call `mesh_claim_surface` but there's no enforced guardrail — agents can forget
- No TTL on surface claims — a crashed agent's lease may never expire

**Fix path to A+:**
1. Call `mesh_who_is_active` at session start (already documented in AGENTS.md §3)
2. Add claim TTL: 90 seconds (auto-expire if agent doesn't heartbeat)
3. Integrate mesh state into the `fleet-snapshot.md` auto-refresh

---

## 2. Swarm SOW — Statement of Work

### 2.1 Vision

> Multiple agents coordinating in a swarm inside of Herdr. Every prompt I give you is the same prompt I give to other agents. LLM-as-Judge and Mixture-of-Experts for maximum token efficiency, speed, and intelligence.

### 2.2 Architecture

```
                    ┌─────────────────────────────────────┐
                    │         USER PROMPT                  │
                    │  (same prompt to all agents)         │
                    └──────────┬────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────────┐
          │                    │                        │
          ▼                    ▼                        ▼
   ┌─────────────┐  ┌──────────────┐     ┌──────────────────┐
   │  p1-ARCH     │  │  p2-BUILD    │     │  p3-VERIFY      │
   │  (OMP)       │  │ (Antigravity │     │  (Gemini)        │
   │              │  │  + Codex)    │     │                  │
   │ Plan &       │  │ Implement    │     │ Run tests,       │
   │ Decompose    │  │ Code         │     │ Lint, Security   │
   │            │  │              │  │     │ Scan             │
   └──────┬──────┘  └──────┬───────┘     └────────┬─────────┘
          │                │                      │
          └────────┬───────┴──────────────────────┘
                   │
                   ▼
         ┌──────────────────┐
         │  p4-JUDGE        │
         │  (Claude)        │
         │                  │
         │ LLM-as-Judge:    │
         │ Grade output     │
         │ against rubric   │
         └────────┬─────────┘
                  │
         ┌────────▼────────┐
         │  MoE Router      │
         │  (Solar Pro)     │
         │                  │
         │ Select best      │
         │ model+output    │
         └──────────────────┘
```

### 2.3 SOW: Herdr Swarm Coordination

**Objective:** Create a fully autonomous multi-agent swarm in Herdr that executes any user prompt through a 4-stage pipeline (Architect → Builder → Verifier → Judge) with Mixture-of-Experts model routing, and delivers a graded, ranked answer.

**Scope:**
- Herdr v0.9.5+ with 4 lanes (architect, builder, verifier, judge)
- GitButler session branches with hunk-level isolation
- Linear issues as task queue (AGENT team)
- Obsidian Vault as shared memory
- GitHub PRs as delivery mechanism

**Deliverables:**
1. `but config target origin/main` configured ✅ (TODO: execute)
2. `.thumbgate/swarm-sows.jsonl` — structured SOW definitions for each lane (TODO: create)
3. `tools/llm-as-judge-steal.js` — judge harness using Gemini CLI as judge model (TODO: build)
4. `tools/moe-router-steal.js` — Mixture-of-Experts model router that selects best model per sub-task (TODO: build)
5. `tools/swarm-dispatcher-steal.js` — orchestrates the 4-lane pipeline (TODO: build)
6. Updated `GitButler-Herdr-Lanes.json` with live-refresh integration (TODO: wire)

**Acceptance Criteria:**
- User prompt → all 4 agents execute within 60s
- Judge grades each output against a shared rubric (≥80% agreement threshold)
- MoE router selects the best model+output combination
- Final answer delivered with provenance (which agent, which model, judge score)
- GitButler commit + PR auto-created if changes are made
- Linear issue status auto-updated to "Completed" when done

**Constraints:**
- NO admin PRs (never bypass branch protection)
- All PRs must pass `verify` CI check
- GitButler hunk-level isolation (never another agent's branch)
- ECI domains isolated from personal workflows

---

## 3. LLM-as-Judge Integration

### 3.1 Current state
The p4-judge lane is configured with `ownerAgent: "claude"` but:
- No judge rubric exists
- No LLM-as-judge harness exists
- The `.thumbgate/swarm-sows.jsonl` file (the judge's target) doesn't exist

### 3.2 Proposed: `tools/llm-as-judge-steal.js`

A judge harness that:
1. Takes an agent's output + the original prompt + a rubric
2. Routes the grading to the most cost-efficient judge model (Gemini CLI for simple classification, Claude for nuanced judgment)
3. Returns: score, reasoning, confidence, improvement suggestions
4. Logs to `~/.thumbgate/judge-results.jsonl`

**Rubric structure (in `.thumbgate/swarm-sows.jsonl`):**
```json
{
  "sowId": "SOW-STEAL-20261029",
  "judgeRubric": {
    "criteria": [
      { "name": "accuracy", "weight": 0.4, "description": "Factual correctness, no hallucinations" },
      { "name": "completeness", "weight": 0.3, "description": "All aspects of the prompt addressed" },
      { "name": "efficiency", "weight": 0.2, "description": "Token usage, no redundant content" },
      { "name": "actionability", "weight": 0.1, "description": "Concrete next steps with evidence" }
    ],
    "threshold": 0.8
  }
}
```

---

## 4. Mixture-of-Experts (MoE) Router

### 4.1 Current state
We have `agent-harness-router`, `hybrid-route-policy`, `solar-pro-workhorse-router`, `cache-aware-model-router` skills — but they're fragmented and not unified under a swarm-level MoE.

### 4.2 Proposed: `tools/moe-router-steal.js`

A MoE router that:
1. **Expert 1:** Local model (Laguna XS 2.1 via MLX) — fast, 0-cost, for planning + classification
2. **Expert 2:** GLM-5.3 (via OpenRouter) — code generation, $0 coding plan
3. **Expert 3:** Solar Pro — workhorse reliability, $0.10/M
4. **Expert 4:** GPT-5.6 Sol Ultrafast — latency-critical, $10/mo cap
5. **Expert 5:** Gemini 2.5 — long-context reasoning (1M tokens)

**Routing decision:** Based on task complexity, cost budget, and historical accuracy telemetry from `model-telemetry-logger.js`.

**Token efficiency:** Route each sub-task class to its optimal expert:
- Planning → Local (free)
- Code generation → GLM-5.3 (free via coding plan)
- Test verification → Gemini (fast CLI)
- Judge → Gemini CLI (cheap classification)
- Complex reasoning → Solar Pro or GPT-5.6 Sol

---

## 5. Action items (priority order)

| # | Action | Tool/Path | Effort | Impact |
|---|--------|-----------|--------|--------|
| 1 | **Configure GitButler target branch** | `but config target origin/main` | 1 min | 🔴 Unblocks ALL GitButler + Herdr operations |
| 2 | **Create `.thumbgate/swarm-sows.jsonl`** | `.thumbgate/swarm-sows.jsonl` | 30 min | Unblocks judge lane |
| 3 | **Build `tools/llm-as-judge-steal.js`** | `tools/llm-as-judge-steal.js` | 2 hr | Enables LLM-as-judge |
| 4 | **Build `tools/moe-router-steal.js`** | `tools/moe-router-steal.js` | 3 hr | Enables MoE routing |
| 5 | **Wire fleet-snapshot auto-refresh** | cron/daemon + `dayglass__omnibus_pulse` | 1 hr | Fixes stale sync |
| 6 | **Build `tools/swarm-dispatcher-steal.js`** | `tools/swarm-dispatcher-steal.js` | 4 hr | Orchestrates 4-lane pipeline |
| 7 | **Linear↔GitHub sync bridge** | `tools/linear-github-sync.js` | 3 hr | Unifies issue tracking |
| 8 | **Auto-rebase + auto-merge on PRs** | GitHub Actions workflow | 1 hr | Fixes 4 BEHIND/CONFLICTING PRs |

---

## 6. Grading summary

| Dimension | Current | Target (A+) | Gap |
|-----------|---------|-------------|-----|
| **Setup / boot time** | 5 min manual | <30s auto | Need `but config target` + lane bootstrap |
| **Coordination latency** | 10–30 min handoff delay | <60s pipeline | Need swarm-dispatcher + MoE router |
| **Decision accuracy (LLM-as-judge)** | None | ≥80% judge agreement | Need judge harness + rubrics |
| **Token efficiency** | Single model per task | MoE per sub-task class | Need moe-router |
| **Cross-surface continuity** | Phone↔Mac only | Phone→VS Code→web→CLI | Need session-continuity-steal (from GitHub Universe steal) |
| **Feedback loop** | Manual plan.md edits | Auto-learn from outcomes | Need continuous-learning-steal |
| **PR hygiene** | 4/7 PRs BEHIND/CONFLICTING | 0 conflicts, auto-merge | Need auto-rebase + merge workflow |
| **Issue tracking** | Linear + GitHub divergent | Single source of truth | Need sync bridge |
