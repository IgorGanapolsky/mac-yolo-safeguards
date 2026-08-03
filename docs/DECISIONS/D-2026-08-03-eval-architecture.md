# D-2026-08-03 — Eval architecture (smevals vs Node gates)

**Status:** accepted  
**Owner:** autonomous CEO/CTO session (Grok)  
**Date:** 2026-08-03  

## Decision

1. **Production law stays Node gates** (`ship-claim-gate`, `taste-gate`, `social-publish-gate`, continuous E2E). CI must stay offline-first and not depend on paid model calls.
2. **Do not adopt `uvx smevals` as a monorepo CI dependency.** Useful design (run ≠ grade, config includes harness, re-grade without re-run); wrong default stack for us (Python/`llm`/multi-model leaderboard product, not our cash path).
3. **Steal the architecture in Node:** `tools/harness-smeval.js` + `evals/ship-honesty/` fixture runs graded by our existing checkers.
4. **Optional later:** live LiteLLM multi-model runs under `HERMES_EVAL_LIVE=1` — only when comparing route policy $ vs quality. Not required for merge gates.
5. **Business priority:** honesty + non-slop + cheap flat-rate routing beat haiku-style model beauty contests. Cash path and Hermes Mobile reliability remain higher ROI than expanding eval UX.

## Context

- [smevals](https://simonwillison.net/2026/Jul/31/smevals/) / [Prime Radiant](https://primeradiant.com/blog/2026/smevals.html): excellent vocabulary and process for answering “which model/harness is better at X?”
- We already over-claimed “halfway to smevals” once; correction: we had **checkers**, not run/grade suites.
- Fleet already has LiteLLM `:4010`, GLM/Kimi flat-rate, `agent-swarm-harness` ability catalog, incident-eval-runner (zero-network fixtures).
- Revenue constraint: another eval framework that burns tokens without ship gates does not clear cash.

## Consequences

| Do | Don't |
|----|--------|
| Grade every LIVE/ship claim with `ship-claim-gate` | Treat model leaderboards as ship proof |
| Score promo with `taste-gate` + golden set | Hire taste SaaS / hashnode-style volume gen |
| Run `harness-smeval` offline in CI | Block CI on OpenAI/Anthropic availability |
| Use smevals *docs* when designing new evals | `uvx smevals` required for agents or CI |

## Verification

```bash
node tests/test-harness-smeval.js
node tools/harness-smeval.js run evals/ship-honesty --json
node tests/test-ship-claim-gate.js && node tests/test-taste-gate.js
```
