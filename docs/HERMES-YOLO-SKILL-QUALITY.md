# hermes-yolo skill quality gates

Implements Google’s **build / test / scale** bar for Agent Skills:

> [Behind the scenes: How we build, test, and scale Google Agent Skills](https://cloud.google.com/blog/topics/developers-practitioners/behind-the-scenes-how-we-build-test-and-scale-google-agent-skills)
> (Aug 2026, Remigiusz Samborski)

## Steal map

| Google practice | hermes-yolo |
|-----------------|-------------|
| Standardized layout + frontmatter | Lint: `---` frontmatter, kebab-case names, description required |
| Linters on check-in | `tools/hermes-yolo-skill-quality.js --lint` |
| Link checkers | `--check-links` (optional HEAD/GET sample) |
| Continuous evals (accuracy × efficiency) | with/without activation suite + token save vs full dump |
| 2×2 uplift matrix | `highAccHighEff` / … quadrants |
| Skills are products | owner/maintainer frontmatter (info-level) |
| Prefer remote MCP | info when skill mentions CLI/API without MCP |

## CLI

```bash
# Full report (lint + eval gate)
hermes-yolo --skill-quality
hermes-yolo --skill-quality --json
node tools/hermes-yolo-skill-quality.js --report --json

# Lint only
hermes-yolo --skill-lint
node tools/hermes-yolo-skill-quality.js --lint --json

# Eval uplift only (default suite)
hermes-yolo --skill-eval
node tools/hermes-yolo-skill-quality.js --eval --json
```

Exit codes: `0` pass, `2` gate fail, `1` runtime error.

## Eval suite (default)

1. Mobile pairing prompt → expect mobile connection skill  
2. Thrash/freeze prompt → expect crash/freeze skill  
3. Pure hello-world → expect **no** skill activation (anti-false-positive)

Efficiency: activated pack tokens ≪ full skill-body dump (progressive disclosure).

## Related

- Progressive load: `docs/HERMES-YOLO-LEAN-CONTEXT.md`
- Fleet sprawl: `docs/HERMES-YOLO-AGENTIC-SPRAWL.md`
