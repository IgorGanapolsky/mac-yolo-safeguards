---
name: screenpipe-activity-harness
description: Universal Coding Agent Harness Adapter (Cursor, Claude Code, Codex, Ollama) and Activity-to-Skill Distillation Engine stolen from Screenpipe v2.6.56.
trigger: ["screenpipe", "universal harness", "activity skill", "turn interval into skill", "cursor harness", "claude code harness", "codex harness"]
---

# screenpipe-activity-harness

Universal Coding Agent Harness Adapter and Activity-to-Skill Distillation Engine (stolen from Screenpipe v2.6.56).

## Capabilities
1. **Universal Multi-Harness Adapter**: Bridges Cursor (Grok), Claude Code, Codex, GitHub Copilot CLI, Ollama (local zero-cost), and Antigravity SDK.
2. **Activity-to-Skill Distiller**: Takes recorded command and file-edit intervals and automatically synthesizes a validated, ready-to-run Skill manifest.
3. **Cross-Harness Execution Envelopes**: Standardizes capability flags, permission models, and structured tool envelopes across all IDEs and CLI runners.

## Verification & Usage
```bash
node tools/hermes-universal-harness-adapter.js
node tools/hermes-activity-skill-distiller.js
node tests/test-hermes-screenpipe-steals.js
```
