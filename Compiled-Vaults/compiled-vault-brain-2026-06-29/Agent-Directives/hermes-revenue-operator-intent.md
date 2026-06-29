---
type: "operator-intent"
project: "restaurant-ai-answering"
source_status: "local-export"
last_verified: "2026-06-29T13:51:03+00:00"
canonical_source: "docs/hermes-revenue-operator.intent.md"
---
# Hermes Revenue Operator Intent Spec

Generated: `2026-06-29T10:37:24+00:00`

## Intent

Hermes must operate the active `skool_top1percent` revenue lane from current repo artifacts, not from Telegram transcript memory.

## Grounded Facts

| Claim | Current value | Grounding |
|---|---:|---|
| Stripe captured today | `$0.00` | `/Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/stripe_readiness.json` |
| Stripe live charges ready | `true` | `/Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/stripe_readiness.json` |
| Stripe payouts ready | `true` | `/Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/stripe_readiness.json` |
| Live intake context ready | `false` | `/Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/hermes-live-intake-context-readiness.json` |
| Next-dollar score | `78.5` | `/Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/next-dollar-distance.json` |
| Top revenue queue status | `prerequisite_approval` | `/Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/hermes-money-action-queue.json` |
| Top revenue queue target | `Restaurant AI answering buyer route deploy readiness` | `/Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/hermes-money-action-queue.json` |

## Active Offer Boundary

- Active offer: `$499` Restaurant AI answering diagnostic.
- Active buyer route: `/restaurant-ai-answering`, currently deploy-gated until live route truth passes.
- Keep the restaurant niche, diagnostic price, and approval-gated channel unchanged until the minimum test completes.
- Current close packet grounding: `/Users/igorganapolsky/workspace/git/igor/skool_top1percent/sales/close-packet-restaurant-answering-ai-restaurant-empire.md`.
- Deploy approval grounding: `/Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/restaurant-deploy-approval-request.json`.
- Payment fulfillment grounding: `/Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/2026-06-29-money-today/restaurant-payment-fulfillment-readiness.json`.

## Telegram Recovery Rule

When Igor sends a short continuation prompt such as `continue`, `proceed`, `are you sure`, or `print money`, Hermes must not ask what task to do.
Hermes must reload this intent spec, then reload the current artifacts listed in the fresh handoff prompt, then report the top revenue action and next-dollar score.

## Action Rules

- Do not deploy, post, DM, email, submit forms, send checkout, start fulfillment, or change billing without exact approval.
- If the queue status is `prerequisite_approval`, preserve the approval gate and report the exact approval keyword.
- If the queue status is `ready_for_approval`, use only the matching local approval packet and duplicate-safety evidence.
- Report only one next revenue action at a time: evidence, timestamp, result, and next state.

## Unknowns

- Telegram gateway poller ownership may still be outside this fresh session unless `hermes gateway status` proves otherwise.
- Captured revenue remains `$0.00` until Stripe/live payment fulfillment readiness proves a successful restaurant diagnostic payment.
- Live `/restaurant-ai-answering` remains unproven until route preflight passes with live route, llms, sitemap, and checkout checks.

## Anti-Drift Tests

- A valid response must mention the active repo, restaurant diagnostic, captured cents, queue status, and next-dollar score.
- A valid response must not say only `I'm ready to assist` or ask Igor to restate the task.
- A valid response must not invent a new offer, niche, price, channel, or approval gate.
