---
name: autonomous-skill-forge
description: >
  Self-driving autonomous skill generation and registry validation engine for AI coding agents.
  trigger: ["forge skill", "create skill", "synthesize skill", "new skill"]
---

# Autonomous Skill Forge

## Overview

Self-driving autonomous skill generation and registry validation engine for AI coding agents.

## Autonomous Execution Playbook

1. Synthesize YAML frontmatter with array brackets.
2. Write SKILL.md to .agents/skills/<name>/SKILL.md.
3. Register in SKILLS.md.
4. Run validate-agent-skills.js.

## Verification Commands

```bash
node tests/test-autonomous-skill-forge.js
```
