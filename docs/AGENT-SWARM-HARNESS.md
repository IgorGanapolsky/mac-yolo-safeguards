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
| `node tools/agent-swarm-harness.js doctor` | Context diet / harness doctor (always-on token est + redundant findings) |
| `node tools/agent-swarm-harness.js eval-abilities` | Ability catalog (instruction / env / verifier / match) |
| `node tools/agent-swarm-harness.js propose-eval --task "..."` | Fail → durable eval stub (`--write` under `evals/`) |
| `node tools/agent-swarm-harness.js eval-mine` | Mine continuous E2E + harness trace + plan thrash → proposals |
| `node tools/agent-swarm-harness.js eval-check` | Catalog integrity + failure→ability routing smoke |
| `node tools/agent-swarm-harness.js sre-autonomy` | SRE subsystems: detect → act → verify |
| `node tools/agent-swarm-harness.js sre-act --subsystem ID` | Health-freshness gate before remediate |
| `node tools/agent-swarm-harness.js profiles` | Named harness profiles (frontier/local/nemotron/device/revenue/social/eval-research) |
| `node tools/agent-swarm-harness.js resolve-profile --task "…"` | Resolve profile + skill packs for task/host |
| `node tools/agent-swarm-harness.js skill-packs` | Verified skill packs bound to toolboxes |
| `node tools/agent-swarm-harness.js claim-hygiene` | Compress multi-owner thrash → path+owner sets |
| `node tools/agent-swarm-harness.js eval-research [--write]` | Overnight mine→eval stubs under evals/ + artifacts/eval-research/ |
| `tools/agent-harness-roi.js` | Pure ROI policy module (profiles, packs, hygiene, research loop) |
| `node tools/revenue-local-draft.js` | Open-weights follow-up draft (template fallback; no send) |
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
11. **Context diet / doctor** — thin always-on context for Claude 5-class models; progressive disclosure; blast-radius as gates not prose novels. Source: [Anthropic context engineering](https://claude.com/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models).
12. **Eval abilities** — fixed instruction/env/verifier catalog; `propose-eval` mines failures into stubs. Source: [LangChain eval engineering](https://www.langchain.com/blog/towards-automating-eval-engineering/).
13. **SRE act→verify** — subsystem remediations require fresh health (15m) then mandatory verify command. Source: [Dynatrace / AI ops framing](https://thenewstack.io/dynatrace-autonomous-sre-agents/).
14. **Revenue local draft** — open-weights follow-up JSON for cash path (`revenue-local-draft.js`); never auto-send / never invent paid.

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


## Harness profiles, skill packs, claim hygiene, eval research (2026-07-28)

NVIDIA open-stack signal: **accuracy and cost improve via harness profiles + verified skill packs**, not fine-tuning first.

| Surface | What it does | Hosts |
|---------|--------------|-------|
| **Harness profiles** | Named packs: model class, effort, max turns/tools, toolbox allowlist, skill packs, eval bar, write allow | Both (social/revenue Pro-only) |
| **Skill packs** | Portable entrypoints + gates bound to a toolbox; no full skill-catalog dump | Both (pack-gated) |
| **Claim hygiene** | Compress 100s of pairwise contention hits into unique paths + owner sets + HOT megafiles | Both |
| **Eval research loop** | `eval-mine` → propose stubs; write only `evals/` + `artifacts/eval-research/` | Both |

```bash
node tools/agent-swarm-harness.js profiles --json
node tools/agent-swarm-harness.js resolve-profile --task "Maestro e2e pair" --json
HERMES_FLEET_HOST_ROLE=mac_mini node tools/agent-swarm-harness.js resolve-profile --task "post LinkedIn"
node tools/agent-swarm-harness.js skill-packs --json
node tools/agent-swarm-harness.js claim-hygiene --json
node tools/agent-swarm-harness.js eval-research --write --json
bash scripts/install-eval-research-loop.sh   # LaunchAgent every 6h on this Mac
```

**Anti-patterns:** fine-tune before profile+eval bar are green; social profile on mini; eval-research editing megafiles; treating pairwise contention dump as actionable without `claim-hygiene`.

