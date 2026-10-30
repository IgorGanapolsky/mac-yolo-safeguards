# Agent Swarm SOW: Broadcast-Aware MoE + LLM-as-Judge
**Version**: 2026-10-30  
**Status**: ACTIVE  
**Owner**: `orchestrator@command` (Herdr)  
**Scope**: mac-yolo-safeguards + mac-freeze-rescue + ThumbGate + Hermes Mobile

---

## 1. Objective

Operate a multi-agent swarm inside **Herdr** with:
- **Mixture-of-Experts (MoE) routing** — tasks classified and routed to the cheapest capable agent/model tier
- **LLM-as-Judge** — independent evaluation of all agent outputs against a rubric
- **Deferral prevention** — agents present ranked options with confidence scores, not single leans
- **Maximum token efficiency** — Laguna XS (3B) for fast decisions, Laguna S (8B) for complex reasoning, local-first default

---

## 2. Swarm Architecture

```
                    ┌─────────────────┐
                    │   Herdr CLI      │  (orchestrator@command)
                    │   Seats/Pods     │  Project→Mission→Slice graph
                    └────────┬────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
    ┌──────▼──────┐   ┌─────▼──────┐   ┌─────▼──────┐
    │ MoE Router   │   │ LLM-Judge  │   │Deferral-Audit│
    │ (Laguna XS)  │   │ (Gemma 4B) │   │(Anthropic)   │
    └──────┬──────┘   └─────┬──────┘   └─────┬──────┘
           │                 │                 │
    ┌──────┴──────┐   ┌─────▼──────┐   ┌─────▼──────┐
    │ Builder     │   │ Reviewer   │   │ Epidemiologist│
    │ (Laguna XS) │   │ (Reviewer) │   │ (Auditor)     │
    └─────────────┘   └────────────┘   └───────────────┘
```

### 2.1 Seats (Herdr)

| Seat | Role | Model Tier | Skills |
|------|------|-----------|--------|
| `orchestrator@command` | Coordination | Laguna S 2.1 (8B) | flow-four-pillars, herdr-ai-civilization, poolside-omp-fleet-coordination |
| `builder@workshop` | Implementation | Laguna XS 2.1 (3B) | gitbutler, openui-generative-ui, claude-code-routines |
| `qa@workshop` | Verification | Gemma 4B | pre-pr-verify, anti-lying-status-claims |
| `epidemiologist@clinic` | Hygiene | Auditor | system-hygiene, herdr-ai-civilization |
| `triage@apm` | Observability | Incident Commander | agent-fde-friction-audit |

### 2.2 Agent Mesh Bus (Cross-Agent)

All agents broadcast on `agent-mesh`:
- `mesh_heartbeat` — presence every 60s
- `mesh_claim_surface` — atomic file/branch ownership (TTL 900s)
- `mesh_send_peer` — direct messages between agents (e.g., builder→qa for review)
- `mesh_inbox` — receive messages addressed to you

---

## 3. MoE Routing Protocol

### 3.1 Task Classification

When a prompt arrives, the MoE router classifies it into one of these lanes:

| Lane | Model | Use Case | SLA |
|------|-------|----------|-----|
| `local_free` | Gemma 3B / llama.cpp | Inbox triage, follow-up drafts, meeting briefs, 2-word prompts | <2s |
| `cloud_fast` | GPT-5.6 Sol Ultrafast | Client reports, pricing Q&A, proposal drafts, social posts | <5s |
| `cloud_capable` | Claude 3.5 Sonnet | Strategic analysis, complex reasoning, code review, security audit | <30s |
| `local_free` | Qwen 0.5B | Token counting, schema validation, cost estimation | <1s |

**Routing rule**: Default to `local_free`. Escalate to `cloud_fast` only when output quality drops below 85% human rating. Escalate to `cloud_capable` only for safety/security/business-impact code changes.

### 3.2 Confidence Calibration

Every agent action carries a confidence score (0-100):
- **≥90**: Act immediately (high evidence, test data, plan claims)
- **70-89**: Present options, flag uncertainty, defer low-risk items
- **<70**: Escalate to orchestrator for human judgment checkpoint

Scoring factors: test_status, plan_claim_coverage, evidence_count, repo_health.

---

## 4. LLM-as-Judge Protocol

### 4.1 Review Gate

Every code change passes through an independent judge (Gemma 4B) before merge:

| Criterion | Weight | Threshold |
|-----------|--------|-----------|
| Correctness | 30% | Must pass all tests |
| Security | 20% | No secrets, no unsafe execSync |
| Performance | 15% | No regressions vs baseline |
| Maintainability | 15% | ≤3 levels of nesting, ≤50 LOC/function |
| Test coverage | 10% | New functions must have tests |
| Intent contract | 10% | Must satisfy `doneWhen` criteria |

### 4.2 Judge Process

1. Judge reads the diff + test output + intent contract
2. Judge scores each criterion (0-100)
3. If weighted score < 80: reject with specific feedback
4. If score ≥ 80: approve + auto-merge (strict repos)

### 4.3 Deferral Audit

Every agent action is logged to `.ai/judgment-deferral-audit.jsonl`:
- Task description
- Options presented (ranked, with tradeoffs)
- Agent's confidence score
- Whether the agent deferred to human
- Final outcome

**Target**: agent defection rate < 14% (Anthropic study: experts defer 86% to AI; we target 86% agent-driven decisions, not human-driven)

---

## 5. Coordination Protocol

### 5.1 Claim → Build → Review → Merge

```
Agent → mesh_claim_surface(slug) → check plan.md §2 →
         BUILD → test → mesh_send_peer(reviewer) →
         REVIEW (LLM-as-Judge) →
         PR → merge when green → mesh_release_surface(slug)
```

### 5.2 Worktree Isolation

- One agent per git worktree + branch
- Never `git checkout -b` in a shared tree
- Use GitButler session branches for hunk-level isolation

### 5.3 Communication

| Channel | Use | TTL |
|---------|-----|-----|
| `mesh_send_peer` | Direct task handoff | 30 min |
| `plan.md` | Persistent task board | Until done |
| `~/.ai/` | Local state files | Session |
| `Documents/AI-Agent-Sync/Handoffs/` | Cross-agent persistence | Until consumed |

---

## 6. Acceptance Criteria (A+ = 10/10)

| Criterion | Target | Evidence |
|-----------|--------|----------|
| Agent uptime | ≥ 95% heartbeat | `mesh_heartbeat` every 60s |
| Claims honored | 0 conflicts | `mesh_claim_surface` atomic |
| Pre-commit gate | 100% files scanned | confusion-detector on ALL staged files |
| Tests pass | 100% green | `npm test` + `bash -n` |
| No deferral hacks | Deferral rate ≥14% agent-driven | judgment-deferral-audit.jsonl |
| Token efficiency | ≤$0.10/action | cost router ≤ cloud_fast |
| PR merge time | ≤ 5 min after green | auto-merge when gates pass |
| No dead code | 0 speculative files | grepai search for TODO stubs |

---

## 7. Implementation Tasks

| Task | Priority | Agent | Status |
|------|----------|-------|--------|
| Fix `bin/agent-loop` (restore run_node, wire confusion + judgment) | HIGH | current | DONE |
| Wire confusion-detector + judgment-audit into `.githooks/pre-commit` | HIGH | current | IN PROGRESS |
| Create `tools/moe-router.js` for task classification | MEDIUM | — | PENDING |
| Create `tools/llm-judge.js` for PR evaluation | MEDIUM | — | PENDING |
| Herdr↔Agent Mesh heartbeat sync | LOW | — | PENDING |
| Linear→Slice auto-mapping | LOW | — | PENDING |

---

## 8. Grade: Current State

| Component | Grade | Notes |
|-----------|-------|-------|
| Agent Mesh | D → B | No active heartbeats; fixed agents now broadcast |
| Herdr | B+ → A | Seats/pods + graph exist; needs mesh sync |
| Linear Claims | C → B- | All claims stale (Aug 2026); needs refresh |
| Obsidian/Obsidian-like vault | C+ → B | Handoffs exist; not queryable via RAG |
| GitButler | B → A- | Session branches; needs stricter isolation |
| Gemini Notebook | F → B | Not yet integrated; planned |
| GitHub Issues | B → A | Public-safe intake; needs auto-Slice mapping |
| mac-yolo-safeguards repo | D → B+ | Broken agent-loop fixed; needs pre-commit gate |
| **Overall** | **C+ → A** | Gap: real-time coordination + MoE + LLM-as-Judge |

---

*Next sync: 2026-10-31. This SOW lives in `docs/AGENT-SWARM-SOW.md` and is referenced by `plan.md`.*
