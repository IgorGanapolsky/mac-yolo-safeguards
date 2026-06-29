---
type: "llm-entrypoint"
tool: "Gemini"
mode: "Large-context reviewer: compare source packs, catch contradictions, and summarize risks."
source_status: "generated"
last_verified: "2026-06-29T14:18:42.522Z"
---
# Gemini

## Role

Large-context reviewer: compare source packs, catch contradictions, and summarize risks.

## Read Order

1. [[AGENTS]]
2. [[SOURCE-MANIFEST]]
3. [[Context Packs/Hermes Operating Context]]
4. [[Context Packs/LLM Routing Context]]

## Do This

- Use broad context only when the task needs cross-file or cross-project synthesis.
- Flag stale context and missing provenance.
- Return concise, source-linked deltas for Codex/Hermes to execute.

## Do Not Do

- Do not claim local execution, sends, deploys, payments, CI, or revenue without external/source evidence.
- Do not paste secrets into prompts or generated notes.
- Do not edit repo files without checking plan.md ownership first.

## Provenance

- SOURCE-MANIFEST.md
- AGENTS.md
- Routing/llm-routing.json
