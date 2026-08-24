---
name: context-vault
description: >
  Allie K. Miller-inspired AI Context Vault: 8 copy-paste prompts that make AI
  understand a repo's identity, goals, constraints, and work state. Vendor-agnostic
  Markdown generator for Claude, Codex, Gemini, GPT, and Ollama agents.
lifecycle: active
tags:
  - context-engineering
  - agent-onboarding
  - skill-catalog
version: 1.0.0
health_check: node tools/context-vault.js --json
source: https://www.alliekmiller.com/resources
---

# AI Context Vault

## Use This When

An LLM agent or human needs to quickly understand this repository's identity,
goals, constraints, and current work state without reading every file.

## Triggers

- `context.vault` / `context vault` / `understand this repo` / `who am i`
- `node tools/context-vault.js --json`
- First-time agent onboarding

## Essential Context

- 8 prompts covering: identity, values, workflow, tools, current state, constraints, prior knowledge, next action.
- Generated from AGENTS.md, plan.md, SKILLS.md, and docs/agents/.
- All prompts validated in CI (tests/test-context-vault.js).

## Verification

```
node tests/test-context-vault.js       # 22 assertions
node tools/context-vault.js generate   # generates artifacts/context-vault.md
node tools/context-vault.js validate   # validates all 8 prompts present
node tools/codeql-pattern-gate.js --json tools/context-vault.js  # ok=true, 0 findings
```
