# How Grok Build Workflows improve this system (Aug 2026)

**Source:** [Workflows in Grok Build](https://x.ai/news/workflows) (Jul 23, 2026)  
**Local surface:** Grok Build `workflow` tool · Rhai scripts · `/workflows` dashboard · `.grok/workflows/`  
**Related:** [Linear + vault coord](./agents/linear-obsidian-coordination.md) · [Research](./RESEARCH-LINEAR-OBSIDIAN-MULTIAGENT-AUG-2026.md)

---

## One-sentence answer

Workflows give **one Grok session** a durable, budgeted **fan-out → verify → synthesize** engine; Linear + vault still own **who** across Claude/Codex/Cursor/Hermes. Together they fix “one chat can’t hold the work” *and* “five vendors thrash the same tree.”

---

## What Workflows are (product facts)

| Capability | Detail |
|------------|--------|
| **Shape** | Deterministic Rhai script: `phase` → `agent` / `parallel` → `complete` |
| **Scale** | Default **128** logical agents/run; up to **1,024** |
| **Isolation** | Each child starts **clean focused context** (not one bloated chat) |
| **Verification** | Built-in pattern: independent skeptics before a finding ships |
| **UX** | Background run; session free; `/workflows` phase rail + pause/resume |
| **Reuse** | Save to `.grok/workflows/<name>.rhai` → slash command with args |
| **Built-in** | `/deep-research` (parallel investigators + claim verify + citations) |

Demo from the post: large PR review → Context → Review → Verify → Synthesize.

---

## What this repo already has (and gaps)

| Layer | Today | Gap Workflows close |
|-------|--------|---------------------|
| **Cross-agent ownership** | Linear `agent-lock` + vault `## In flight` + plan.md megafiles | **Not replaced** — still required for multi-vendor fleet |
| **Isolation of code writes** | git worktrees | Workflows can set `isolation_worktree` per child; still merge carefully |
| **Honesty / ship claims** | `ship-claim-gate.js`, taste, harness-smeval | Workflows add **adversarial multi-agent verification** of claims |
| **Planner/worker swarm** | `agent-swarm-harness.js`, plan.md roles | Workflows are a **stronger planner fan-out** *inside Grok only* |
| **Research** | parallel-cli deep research | Overlaps `/deep-research`; use either, record run_id |
| **Background daemons** | LaunchAgent fleet loop (display + scrub dry-run) | Workflows are **on-demand bursts**, not 15m hygiene |

**Anti-confusion:** a Workflow is **not** a second Linear. Subagents under Grok share one budget and one journal; they do not automatically respect another agent’s vault claim unless the **script and prompts** force `--coord-status` / worktree isolation.

---

## How Workflows improve *our* system specifically

### 1. Bounded fan-out with adversarial verify (highest ROI)

**Pain:** One agent “reviews the PR” and hallucinates findings or rubber-stamps green.  
**Workflow win:** N specialist reviewers in parallel → M independent skeptics must mark `real=true` with evidence → ranked report.  
**Maps to:** Greptile-adjacent quality without waiting on external bots; complements CI.

### 2. Linear fleet triage at human scale

**Pain:** 25–35 open Linear issues; agents pick randomly or re-do Done work.  
**Workflow win:** One phase pulls `--coord-status` + open list; parallel scorers rank by revenue/user impact/blockers; synthesize **top-10 action list** with owner suggestions.  
**Maps to:** CEO operating brief + AGENT board hygiene.

### 3. Ship-claim / honesty panels

**Pain:** Agents say “all LIVE / shipped” without evidence (CEO: stop lying).  
**Workflow win:** Parallel claim checkers against `ship-claim-gate` inputs + URL proofs; skeptic panel rejects empty gates.  
**Maps to:** `tools/ship-claim-gate.js` as the **deterministic** gate; Workflow as the **multi-agent** audit when the claim set is large.

### 4. Codebase class-of-bug audits

**Pain:** “Audit every route for missing auth” doesn’t fit one context window.  
**Workflow win:** Shard by directory/file list in Rhai (script owns scope — not the agent); verify each finding.  
**Maps to:** Closed feedback loop / deterministic CI checks when a class stabilizes; Workflow for **discovery**.

### 5. Session stays free

**Pain:** Long multi-agent thrash monopolizes the interactive session.  
**Workflow win:** Background journaled run; pause/resume without redoing finished phases.  
**Maps to:** Humans-on-the-loop without blocking the founder chat.

### 6. Standardized Grok boundary (research: “standardize boundary, not model”)

**Pain:** Ad-hoc subagent spawns with different prompts every session.  
**Workflow win:** Named scripts in `.grok/workflows/` become the Grok adapter contract — same as claim/done for Linear.

---

## What Workflows do **not** replace

| Keep | Why |
|------|-----|
| **Linear claim/done/scrub** | Multi-vendor ownership across machines/processes |
| **Vault Agent-State** | File-level WIP outside git |
| **plan.md megafiles** | Serialize hot files when two *products* (not just Grok children) edit |
| **Node gates (ship-claim, social-publish, taste)** | Deterministic, cheap, CI-wired — research said prefer these for facts |
| **Worktrees for other agents** | Codex/Claude still need isolation even if Grok uses workflows |

**Rule of thumb**

```
If work is “many independent judgment tasks → one report”     → Workflow
If work is “who owns this issue across the fleet”              → Linear + vault
If work is “is this URL/test gate green”                       → Node gate / CI
If work is “two products editing GatewayContext.tsx”         → plan.md + worktree
```

---

## Integration architecture

```
                    ┌─────────────────────────────┐
                    │  Founder / Grok session     │
                    │  /workflows · /linear-triage│
                    └─────────────┬───────────────┘
                                  │
              ┌───────────────────▼───────────────────┐
              │  Grok Workflow (Rhai, budget 128+)    │
              │  phase → parallel agents → verify     │
              └─┬───────────────┬───────────────┬─────┘
                │               │               │
     read-only tools     shell: bridge     write (careful)
     grep/read/git       --coord-status    isolation_worktree
                         --list            + explicit merge
                │               │               │
                ▼               ▼               ▼
         evidence        Linear labels     PR / scratch report
                         vault claims
```

**Session-start still:**

```bash
node tools/linear-agent-bridge.js --coord-status
node tools/coord-setup.js   # optional ensure
```

Before a **write** workflow:

```bash
node tools/linear-agent-bridge.js --claim AGENT-N --agent grok --files …
# run workflow with isolation_worktree for writers
node tools/linear-agent-bridge.js --done AGENT-N --agent grok --comment "…"
```

---

## Recommended saved workflows (this repo)

| Slash / name | Job | Mode | Priority |
|--------------|-----|------|----------|
| `linear-fleet-triage` | Open Linear + locks → top-10 actions | read-only + shell | **P0** |
| `adversarial-pr-review` | PR features → reviewers → skeptics → report | read-only | **P0** |
| `ship-claim-audit` | Batch-verify LIVE/ship claims with evidence | read-only + shell | P1 |
| `megafile-risk-scan` | Diff vs MEGAFILES list + plan.md ownership | read-only | P1 |
| `rag-gap-harvest` | Find missing lessons / eval cases | read-only | P2 |

Scripts live under [`.grok/workflows/`](../.grok/workflows/).

---

## Economics (when to spend the budget)

| Use Workflow | Skip / use something cheaper |
|--------------|------------------------------|
| ≥5 independent judgment units | Single-file fix |
| Need adversarial verify | `npm test` already proves it |
| Report must outlive the chat | One-shot Q&A |
| >128 agents of real work | Cap + shard across runs; don’t burn budget on discovery spam |

Research lease defaults (15m claim) still apply **outside** the workflow journal: if a Workflow claims Linear, heartbeats/done still matter when the run is long.

---

## AcceptanceCheck for “Workflows integrated”

1. At least two named scripts in `.grok/workflows/` with `validate_only` smoke-check documented.  
2. Protocol doc links Workflows ≠ Linear locks.  
3. Write workflows either use `isolation_worktree` or refuse multi-file writes without a Linear claim note in the parent prompt.  
4. Prefer Node gates for binary facts; Workflows for multi-finding judgment.  
5. CEO can run `/linear-fleet-triage` or `/adversarial-pr-review` without re-prompting the architecture.

---

## Bottom line

| System | Role after Workflows |
|--------|----------------------|
| **Grok Workflows** | Intra-Grok swarm: plan, fan-out, verify, synthesize, background |
| **Linear + vault** | Inter-agent fleet bus across vendors and sessions |
| **plan.md + worktrees** | Code exclusivity for megafiles / shared trees |
| **Node gates + CI** | Deterministic truth for ship/social/tests |

Workflows are the missing **horizontal** scale inside Grok. They do not obsolete the **vertical** ownership stack we just hardened (AGENT-29). Use both.
