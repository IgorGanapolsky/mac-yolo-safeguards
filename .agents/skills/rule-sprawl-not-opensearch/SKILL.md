---
name: rule-sprawl-not-opensearch
description: >
  New Stack alerting/retrieval webinar process steal: prevention rules vs
  eval budget, retrieval latency budget, review volume is not the control.
  Do not build OpenSearch, PPL, or Unified Alert Manager. Trigger: newstack,
  alert rules multiplying, rule sprawl, false-positive fatigue, retrieval
  under concurrent agents, human review vs verified pipelines.
  Slash: /rule-sprawl-not-opensearch.
---

# Rule sprawl — steal the budget tradeoff, not OpenSearch

The New Stack email (2026-08-19) sells OpenSearch PPL + Unified Alerting.
We already knapsack prevention rules. Do **not** clone the product.

| NEVER | ALWAYS |
|-------|--------|
| OpenSearch / PPL / Unified Alert Manager | `node tools/rule-sprawl.js --json` |
| Quote TNS "bugs up 54%" as our metric | Load-all vs selected under eval/token budget |
| New observability SKU (ECI) | `retrieveWithLatencyBudget` (singleflight + TTL + latency cap) |
| Treat human review volume as the control | Tests + receipt; `autoApply: false` |

```bash
node tools/rule-sprawl.js --json
node tools/rule-sprawl.js --review --tests-pass --receipt-ok
node tests/test-rule-sprawl.js
node tests/lesson-retrieval.test.js
```

`capturedRevenueUsd` stays 0.

Sibling PR #1868 already cloned PPL/UAM filenames — do not dual-edit those.
