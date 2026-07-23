# Continuity pricing model (decision)

**Status:** adopted  
**Date:** 2026-07-23  
**Context:** Web tasks can now target **My Mac**, **Continuity (VPS)**, or **Auto** at any time (`routePreference`), not only offline failover. That raises variable cost risk if Continuity is flat-unlimited.

## Decision

**Do not switch to pure usage-based billing.**

**Do:** keep a **flat monthly Continuity price** with a **generous included Continuity quota**, then a **small metered overage** (or pack/upgrade) past that.

| Layer | Role |
|-------|------|
| Flat monthly (e.g. **$10/mo** Continuity / Pro) | Predictable hook; sells access + peace of mind |
| Included quota (e.g. trial **5** / paid **100** cloud tasks per 30 days) | Fair use; protects Fly/token cost when users pick Continuity always |
| Overage or next pack | Charges power users without scaring first purchase |

## Why (product + GTM)

1. **Conversion:** pre-purchase buyers distrust opaque meters; “$X/month” converts better than “maybe $Y depending on runs.”
2. **Pattern:** Twilio / OpenAI / Vercel-style — plan + included + overage, not pure taxi-meter from $0.
3. **Timing:** **no paying Continuity cohort yet** — set the model before habits form around unlimited flat.
4. **Always Continuity UX:** once VPS is choosable online, unlimited flat is an invitation to unbounded spend.
5. **Honesty:** Continuity remains **queued handoff to a fenced VPS**, not unlimited primary compute; quota language matches that.

## What we reject

| Model | Why not |
|-------|---------|
| Pure usage-only (no monthly) | Bill shock, weak Continuity story, harder first sale |
| Flat unlimited Continuity | Power users burn Fly/tokens; unfair to quiet payers |
| Per-token Continuity pricing as the SKU | Competes with Cursor/Ultra narrative; research already said avoid (July 2026 Continuity research) |

Overage **per Continuity run** (or per pack of runs) after the included bucket is **allowed** and preferred over per-token Continuity SKUs.

## Current engineering baseline (already partially aligned)

| Control | Location | Today |
|---------|----------|--------|
| Stripe flat plan | `STRIPE_PRICE_ID` / checkout | Continuity monthly |
| Included Continuity tasks | `AGENT_GOVERNANCE_LIMITS` | trial **5** / paid **100** per 30 days |
| Hard stop at limit | `evaluateCloudContinuation` | 429 / 402 — **not** overage invoice yet |
| Explicit target | `routePreference` + dashboard **Run on** | local / cloud / auto |

So today is: **flat + included quota + hard cap**.  
Next implementation step is **overage or packs**, not replacing the flat plan.

## Implementation checklist (when shipping overage)

1. **UI:** show Continuity usage “N / 100 this period” on dashboard (and 402/429 copy that points to upgrade/overage).
2. **Stripe:** metered price item or prepaid packs after included quota; keep base subscription.
3. **Ledger:** every `route=cloud` completion increments countable usage (already partially true via task counts).
4. **Guardrails:** free Web Control remains Mac-only; Continuity always requires entitlement.
5. **Copy:** never market unlimited always-on VPS at $10; always “included Continuity runs + overage.”

## One-line policy

**Charge for Continuity access with a predictable monthly price and a fair included run budget; meter overage for power users — do not pure-usage-price Continuity.**

Related: [RESEARCH-THUMBGATE-CONTINUITY-VPS-JULY-2026.md](./RESEARCH-THUMBGATE-CONTINUITY-VPS-JULY-2026.md), `apps/hermes-control-plane/lib/agent-governance.ts`, `lib/task-routing.ts`.
