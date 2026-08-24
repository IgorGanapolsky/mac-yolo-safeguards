---
name: eval-observability-loop
description: >
  Self-improving fleet automation: measure asked-vs-served routing, cost,
  latency, failures, then propose prompt/workflow/route/tool changes. Never
  auto-apply. Never clone OpenRouter or Ramp router.com. Never productize a
  new affiliate platform from an episode headline. Trigger: router wars,
  Stripe OpenRouter, Ramp router, eval harness, observability, cheap cascade,
  self-improving AI, improve prompts from eval. Slash: /eval-observability-loop.
---

# Eval observability loop (not a new SKU)

Episode steal: systems that produce **measurable output**, then use eval
feedback to improve routing — not “self-improving AI” as a product bet.

Stripe/Ramp (TNS 2026-08-21) validate **runtime model triage** and
**per-call receipts**. We already have LiteLLM `:4010`. Do not buy or clone
their router.

```bash
node tools/router-receipt.js --json
node tools/router-receipt.js --gate
node tools/router-receipt.js --gate --since-hours 6
node tools/route-quality-report.js --json --gate
node tools/inference-eng/optimizer.js --json
```

`--gate` exits 1 only on **empty glm group** (desktop 429 class). Cheap
cascade is reported, not a silent cost win. Full-log `--gate` keeps the
incident in the 1.2G `traffic.jsonl`; `--since-hours 6` is current health.

## Steal

1. **Receipts** — asked, served, provider, tier, tokens, latency, cost, fallbacks
2. **Quality by served model** — transport 200 ≠ tools/work
3. **Eval → proposal, apply=false** — human/agent PR; never silent remap

## Skip (this episode)

| Skip | Why |
|------|-----|
| Affiliate-content intelligence platform | No customer, no baseline (`validate-demand-before-automating`) |
| Generic productized agent automations | Bespoke SKU; ECI pauses ThumbGate paid outreach |
| “OpenAI paused training” bets | Headline, no underwriteable claim |
| Clone OpenRouter / router.com | We already route; neutrality tax is spend |

Vertical we already run: HVAC $149 AHLS (agency) + Hermes fleet eval.
Reuse those. Do not invent a content-operator SaaS this turn.

## Related

`tools/router-receipt.js` · `/operate-hermes-fleet` · `/hermes-desktop-429-failover`
· `/eci-thumbgate-ip-wall` · `/hermes-yolo-cost-autonomy`
