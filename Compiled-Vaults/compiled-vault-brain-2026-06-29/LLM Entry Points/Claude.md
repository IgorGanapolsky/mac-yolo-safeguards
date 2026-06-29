---
type: "llm-entrypoint"
tool: "Claude"
mode: "Synthesis and long-form reasoning partner: use compact packs, then ask Codex/Hermes for execution evidence."
source_status: "generated"
last_verified: "2026-06-29T05:23:41.303Z"
---
# Claude

## Role

Synthesis and long-form reasoning partner: use compact packs, then ask Codex/Hermes for execution evidence.

## Read Order

1. [[AGENTS]]
2. [[Context Packs/Token Efficiency Context]]
3. [[Context Packs/LLM Routing Context]]
4. [[Decisions/Recent Decisions]]

## Do This

- Use the smallest source-backed context pack first.
- Separate advice from executed work.
- When suggesting code changes, name the verifier that should run.

## Do Not Do

- Do not claim local execution, sends, deploys, payments, CI, or revenue without external/source evidence.
- Do not paste secrets into prompts or generated notes.
- Do not edit repo files without checking plan.md ownership first.

## Provenance

- SOURCE-MANIFEST.md
- AGENTS.md
- Routing/llm-routing.json
