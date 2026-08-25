---
name: self-improve-eval-not-affiliate
description: >
  Episode Os-s26O_W08 process steal: measurable output then eval feedback to
  propose prompt/workflow/tool changes with holdout. Never auto-apply. Never
  productize an affiliate platform from the headline. Complementary to PR
  #2046 router-receipt. Slash: /self-improve-eval-not-affiliate.
---

# Self-improve eval — not an affiliate SKU

Source: https://music.youtube.com/watch?v=Os-s26O_W08

The episode page has **no benchmarks**. Do not bet on “OpenAI paused training.”
The steal is the loop: produce a measured output, then use eval + **holdout**
to propose prompt / workflow / tool changes. `apply` is always false.

Routing asked-vs-served is **PR #2046** (`tools/router-receipt.js`). Do not
dual-edit it.

```bash
node tools/self-improve-eval-loop.js --honesty --json
node tools/self-improve-eval-loop.js --map --intent "HVAC after-hours leak" --json
node tools/self-improve-eval-loop.js --promote --kind prompt --baseline-metric conversion_rate --baseline-value 0.2 --baseline-n 20 --candidate-value 0.3 --candidate-n 20 --holdout-value 0.28 --holdout-n 20 --json
node tests/test-self-improve-eval-loop.js
```

## Steal

1. Productized template with a baseline (AHLS $149), not bespoke consulting.
2. Eval → promote only if holdout beats baseline; still a human PR.
3. Observability of quality/cost/latency already exists as router-receipt.

## Skip

| Skip | Why |
|------|-----|
| Affiliate-content intelligence platform | No customer, no baseline |
| Generic SMB chatbot | No owner, no metric |
| OpenAI paused training | Headline only |
| Auto-apply remaps | PR #2046; apply=false here too |
| $499 ThumbGate outreach | ECI pause |

Vertical already running: HVAC AHLS + hosted Hermes $10 + Hermes fleet eval.
