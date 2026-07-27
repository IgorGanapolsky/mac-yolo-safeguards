# Agent swarm harness (high-ROI coordination)

Implements the durable parts of [Cursor’s agent-swarm model economics](https://cursor.com/blog/agent-swarm-model-economics) for **this** multi-agent repo at human tempo (2–3 agents, git worktrees, sequential merge) — not a custom 1k-commits/sec VCS.

## Tools

| Command | Purpose |
|---------|---------|
| `node tools/agent-swarm-harness.js` | Session brief: role, contention, megafiles, SDD loop, Field Guide, actions |
| `node tools/agent-swarm-harness.js --json` | Machine-readable brief |
| `node tools/agent-swarm-harness.js --role planner` | Planner guidance (design + AC only) |
| `node tools/agent-swarm-harness.js sdd` | Specification-Driven Design loop map (specs → gap analysis → verify) |
| `node tools/agent-swarm-harness.js session-contract` | Tenacious-model boundaries (write/publish/send/effort/stop_when + keep/drop) |
| `node tools/agent-swarm-harness.js effort-policy` | Task class → default effort (step-down; max only for hard work) |
| `node tools/agent-swarm-harness.js state-layers` | Stateless vs session-stateful vs shared-board matrix (Pro + mini) |
| `node tools/agent-swarm-harness.js where-is-state` | Three session-start checks: chat / ownership / resume evidence |
| `node tools/agent-swarm-harness.js toolboxes` | Domain packs × auth type × host allowlist (Foundry-style) |
| `node tools/agent-swarm-harness.js where-is-auth --task "..."` | Toolbox + identity + host/gates for this task |
| `node tools/agent-swarm-harness.js worker-toolbox --task "..."` | Thin worker prompt: entrypoints only (no skill soup) |
| `node tools/agent-swarm-harness.js check-hot-files --stdin --body-file pr.md` | Megafile + decision-ref gate |
| `node tools/agent-swarm-harness.js field-guide` | Print `docs/agent-field-guide/index.md` |
| `node tools/plan-coordination-snapshot.js` | Active tasks + §2 locks (named + numeric task ids) |
| `node tools/agent-session-start.js` | Injects coordination + swarm harness automatically |

## What improved

1. **Named task visibility** — `parseActiveTasks` matches `T-LEASH-…` / `T-TINKER-…`, not only `T-123`.
2. **Planner ≠ worker** — explicit roles in AGENTS.md + harness role guidance.
3. **Thrash detection** — multi-owner overlapping claims and megafile watch list.
4. **Field Guide** — short shared successor context (`docs/agent-field-guide/index.md`, ≤80 lines).
5. **Model economics default** — frontier plans; cheap/local executes explicit leaves.
6. **Stacked review lenses** — verification checklist; hot-file PRs need decision refs.
7. **SDD loop** — modular specs + continuous gap analysis mapped onto plan.md / AC / thrash metrics (see [SDD-SPECIFICATION-DRIVEN-DESIGN.md](./SDD-SPECIFICATION-DRIVEN-DESIGN.md)).
8. **Frontier SessionContract + effort step-down** — boundaries once, keep/drop (not blanket brevity), objective done bar; see [FRONTIER-MODEL-HARNESS.md](./FRONTIER-MODEL-HARNESS.md) (Fable 5 / GPT 5.6 Sol patterns).
9. **State-layer policy (Pro + mini)** — inference **stateless**; product chat **session_id**; multi-agent work **plan.md / loop-state / Field Guide**. Session-start `where-is-state` answers three questions so agents do not treat chat windows or Ollama RAM as fleet memory (localized amnesia). Source framing: [stateful vs stateless agent design](https://machinelearningmastery.com/stateful-vs-stateless-agent-design-tradeoffs-for-scalable-agentic-systems/).
10. **Toolbox policy (auth on pack)** — domain packs (`fleet_inference`, `repo_coord`, `device_mobile`, `revenue_cash`, `social_promo`, `memory_rag`) bind **auth type + host + gates** at the boundary (Foundry toolbox pattern). Workers get **entrypoints only** via `worker-toolbox`; session-start `where-is-auth` answers toolbox / identity / host. Source: [Foundry Toolboxes](https://devblogs.microsoft.com/foundry/building-agents-that-act-on-your-behalf-with-toolboxes-in-foundry/).

## State layers (high-ROI)

| Layer | Design | Continuity store | Mac Pro | Mac mini |
|-------|--------|------------------|---------|----------|
| Inference (LiteLLM / Ollama) | stateless | none (traffic log only) | front door `:4010` | unloadable worker |
| Worker leaf | stateless payload | AC + claim only | either | prefer when free |
| Multi-agent ownership | shared-stateful | `plan.md` | claim + §3 | same git board |
| Product chat | session-stateful | session gateway / D1 | always-on gateway | rehydrate from store |
| Resume / ship | shared-stateful | loop-state + continuous E2E | write often | read on start |
| Lessons | curated shared | Field Guide + RAG | same | same |

**Anti-patterns:** chat as coordination bus; sticky Ollama sessions for WIP; resending full AGENTS.md every turn; assuming Pro chat is truth on mini.

```bash
node tools/agent-swarm-harness.js state-layers --json
node tools/agent-swarm-harness.js where-is-state --json
# optional host role override when hostname is ambiguous:
HERMES_FLEET_HOST_ROLE=mac_mini node tools/agent-swarm-harness.js where-is-state
```

## Toolboxes (high-ROI)

| Pack | Auth | Hosts | Gates |
|------|------|-------|-------|
| `fleet_inference` | agentic | Pro + mini | — |
| `repo_coord` | agentic | Pro + mini | — |
| `device_mobile` | agentic | Pro + mini | — |
| `memory_rag` | project_keys | Pro + mini | — |
| `revenue_cash` | project_keys | **Pro only** | prefer CLI over Chrome |
| `social_promo` | user_delegation | **Pro only** | `PUBLISH_APPROVED`, interactive Chrome opt-in |

```bash
node tools/agent-swarm-harness.js toolboxes --json
node tools/agent-swarm-harness.js where-is-auth --task "post LinkedIn promo"
HERMES_FLEET_HOST_ROLE=mac_mini node tools/agent-swarm-harness.js worker-toolbox --task "post everywhere"
# → BLOCKED (social_promo not on mini)
```

**Anti-patterns:** token plumbing in agent code; skill-catalog dumps; Chrome social/cash on mini; inventing missing credentials when Keychain/Chrome already holds them.

## SDD ↔ harness (short map)

| SDD idea | Harness signal |
|----------|----------------|
| Modular markdown specs | Leaf AcceptanceCheck + claims before code |
| Governance / guardrails | AGENTS.md Never-list + megafile hot-file gate |
| Gap analysis | Update AC/claim first when requirements appear mid-build |
| Traceability | Stacked verification; thrash metrics ≠ commit rate |
| Anti vibe-coding | No planless megafile thrash; chat is not the source of truth |

## What we deliberately skip

- Custom high-throughput agent VCS
- Hundreds of concurrent agents on Hermes Mobile
- Treating commit count as productivity

## Tests

```bash
node tests/test-plan-coordination-snapshot.js
node tests/test-agent-swarm-harness.js
```

## Related

- [AGENTS.md](../AGENTS.md) — durable Never-list + planner/worker protocol
- [plan.md](../plan.md) — live claims
- [docs/agent-field-guide/index.md](./agent-field-guide/index.md) — curated surprises
- [docs/SDD-SPECIFICATION-DRIVEN-DESIGN.md](./SDD-SPECIFICATION-DRIVEN-DESIGN.md) — full SDD mapping
