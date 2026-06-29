---
type: "llm-entrypoint"
tool: "Codex"
mode: "Repository executor: implement, test, verify, and report with file/command evidence."
source_status: "generated"
last_verified: "2026-06-29T05:23:41.303Z"
---
# Codex

## Role

Repository executor: implement, test, verify, and report with file/command evidence.

## Read Order

1. [[AGENTS]]
2. [[Context Packs/Hermes Operating Context]]
3. [[Procedures/Agent Sync Procedure]]
4. [[Procedures/Experiment Loop Procedure]]

## Do This

- Use repo source and tests as the truth source.
- Prefer small diffs and focused verification.
- Update generated vault state only through tools/hermes-ai-vault.js.

## Do Not Do

- Do not claim local execution, sends, deploys, payments, CI, or revenue without external/source evidence.
- Do not paste secrets into prompts or generated notes.
- Do not edit repo files without checking plan.md ownership first.

## Provenance

- SOURCE-MANIFEST.md
- AGENTS.md
- Routing/llm-routing.json
