---
type: "procedure"
source_status: "source-backed"
last_verified: "2026-06-29T14:18:42.522Z"
---
# Vault Interview Procedure

Use this procedure to grow the vault without turning it into noise.

1. Ask one question at a time about roles, active projects, repeated workflows, and privacy boundaries.
2. Convert answers into Markdown notes or context-pack deltas with provenance.
3. Keep private/sensitive details out of broad context packs; use summaries and pointers.
4. Rebuild with `node tools/hermes-ai-vault.js build` or install to Hermes with `node tools/hermes-ai-vault.js install`.
5. Validate before telling any LLM to rely on the new context.

Seed prompt:

> I want to create a vendor-agnostic AI vault that acts as a shared brain across my tools. Use markdown files and folders. Interview me one question at a time about my daily life and roles, my work and active projects, repeated context workflows I want AI to help with, and privacy boundaries. Then propose a vault structure, agent rules, templates, and migration plan. Ask me the first question now.

## Provenance

- SOURCE-MANIFEST.md
