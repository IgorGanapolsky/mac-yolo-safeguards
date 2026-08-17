---
name: hybrid-route-policy
description: >
  Lemonade-router-inspired hybrid routing for Hermes economic routes: keyword
  rules, sensitive→local, coding→local candidate, paid cloud only with paid-ok.
  Trigger: hybrid router, route policy, local vs cloud routing, lemonade router
  pattern, economic route rules. Slash: /hybrid-route-policy.
---

# Hybrid route policy

Steals AMD `lemonade-router-builder` shape (candidates, default, exclusive
rules vs LLM-router) and maps it to `hermes-economic-router` route ids.

## Decide

```bash
node tools/hybrid-route-policy.js example
node tools/hybrid-route-policy.js decide --task "implement unit test for pair"
node tools/hybrid-route-policy.js decide --task "production incident" --paid-ok
node tools/hybrid-route-policy.js self-test
```

## Rules of trust

- Sensitive keywords → `local_fast` (zero cost, no leak path by default)  
- Coding tasks → `local_coder_candidate` first  
- Hard review / incidents → `glm52_reasoning` only when `--paid-ok`  
- Candidate ids must exist in `hermes-economic-router` `ROUTES` (no fictional `cloud_*`)  
- `router` block and `rules` are mutually exclusive (AMD parser rule)  

## Pair with economic router

Use the decided `route` id as the preferred lane when calling
`node tools/hermes-economic-router.js` with an equivalent task string; do not
silently spend without `paidOk` / cost caps.
