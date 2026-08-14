# AMD skills → fleet ROI implementation (2026-08-13)

Source: [amd/skills](https://github.com/amd/skills).

## Implemented (high-ROI only)

| Item | Path | Test |
|------|------|------|
| Skill cards + fail-closed audit | `tools/skill-card-validate.js`, `*/skill-card.md` | `tests/test-skill-card-validate.js` |
| Federated pin ledger | `.agents/skills/sources.yml` | validated by skill-card audit of in-repo list |
| Multi-agent catalog metadata | `plugin-metadata.json` | structural JSON present |
| Hybrid route policy (Lemonade-router shape) | `tools/hybrid-route-policy.js` (real ROUTES: `local_fast`, `local_coder_candidate`, `glm52_reasoning`, …) | `tests/test-hybrid-route-policy.js` |
| Local media lane (local-ai-use adapted) | `tools/local-media-route.js`, skill `local-media-lane` | `tests/test-local-media-route.js` |
| Governance skill | `.agents/skills/skill-catalog-governance` | card + validator |

## Explicitly **not** installed

- ROCm / Instinct / EPYC serving skills (no AMD GPU on Apple M5 fleet default)
- Bulk `npx skills add amd/skills` (noise + wrong hardware paths)

## Verify

```bash
node tools/skill-card-validate.js --strict
node tests/test-skill-card-validate.js
node tests/test-hybrid-route-policy.js
node tests/test-local-media-route.js
node tools/hybrid-route-policy.js decide --task "implement unit test"
node tools/local-media-route.js decide --task "generate an image of a cat"
```
