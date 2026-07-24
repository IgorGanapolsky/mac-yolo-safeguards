# Specification-Driven Design (SDD) in this repo

Production mapping of **Specification-Driven Design** / **AI Storming**: treat coding agents as peer programmers governed by durable modular specs, not chat-window vibe coding.

Primary external framing (2026-07):  
https://www.ozkary.com/2026/07/beyond-the-prompt-building-enterprise-solutions-with-ai-specification-driven-design.html

Companion open source: https://github.com/ozkary/ai-engineering

## Why this exists

Planless prompts produce the same failure modes Ozkary documents for enterprise:

| Chaos mode | What we see here |
|------------|------------------|
| Monolithic files | Megafile thrash (`GatewayContext`, `ChatScreen`, discovery services) |
| Bypassed architecture | Agents rewriting ownership / pairing paths mid-flight |
| Lost chat context | Guardrails restated every session instead of living in repo |
| Untraceability | “Unit green” ship claims with no E2E / no AcceptanceCheck |

## Loop (specs before code; gap → update AC first)

```text
discover → blueprint → modular-specs → execute → gap-analysis → traceability
```

| Step | SDD idea | Our durable artifact |
|------|----------|----------------------|
| Discover | System decomposition | `plan.md` leaf tasks + free-file claims |
| Blueprint | Governance & guardrails | `AGENTS.md` Never-list, megafile serialize, worktrees |
| Modular specs | Markdown boundaries | AcceptanceCheck per leaf, Field Guide, §3 decisions |
| Execute | Peer programmer, bounded scope | One claimed leaf; no foreign claims |
| Gap analysis | Adaptive specs (not code-only) | Update AC/claim/§3 **before** re-implementing |
| Traceability | Continuous verification | Unit → typecheck → continuous E2E → Greptile → green merge |

**Runtime health check:** thrash metrics (multi-claimer count, hot megafiles) — not commit rate.  
If SDD is the blueprint, thrash detection is the signal that the AI is still governed.

## Commands

```bash
node tools/agent-swarm-harness.js              # brief includes SDD one-liner
node tools/agent-swarm-harness.js sdd          # full SDD loop map
node tools/agent-swarm-harness.js sdd --json
node tools/agent-swarm-harness.js --role planner
```

## Agent rules (non-negotiable)

1. No implementation without AcceptanceCheck + free claim.
2. Gap found mid-leaf → append discovered work / update AC → do not invent scope in code only.
3. Never “unit green = shipped.”
4. Hot megafile PRs need a `plan.md` §3 decision pointer.

## Related

- [docs/AGENT-SWARM-HARNESS.md](./AGENT-SWARM-HARNESS.md)
- [docs/agent-field-guide/index.md](./agent-field-guide/index.md)
- [AGENTS.md](../AGENTS.md) — multi-agent protocol
- Research signal: `tools/hermes-research-intelligence.js` → `specification-driven-design`
