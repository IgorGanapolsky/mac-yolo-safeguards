---
name: skill-catalog-governance
description: >
  AMD-skills-style catalog governance for this fleet: skill-card.md
  (Description/Owner/License), federated sources.yml pins, fail-closed
  validation. Trigger: skill card, skill catalog, sources.yml, skill
  governance, amd/skills pattern. Slash: /skill-catalog-governance.
---

# Skill catalog governance

Source pattern: [amd/skills](https://github.com/amd/skills) skill cards + federation.

## Required per skill folder

```
.agents/skills/<name>/
  SKILL.md          # agent-facing (name + description frontmatter, ≤500 lines)
  skill-card.md     # human-facing governance
  scripts/          # optional
  references/       # optional
```

## skill-card.md required sections

1. `## Description` — one sentence outcome  
2. `## Owner` — who maintains it  
3. `## License` — SPDX or repo license  

## Validate

```bash
node tools/skill-card-validate.js --strict
node tools/skill-card-validate.js --json
```

## Federated pins

External skill sources are declared in `.agents/skills/sources.yml` with
`repo` + `ref` (tag or commit). Do not copy unpinned `main` into production
agent paths without a pin.

## Multi-agent discovery

`plugin-metadata.json` at repo root identifies the catalog for Cursor /
Claude / Codex style installers. Prefer installing only skills that match
hardware and product lanes (no ROCm skills on Apple Silicon by default).
