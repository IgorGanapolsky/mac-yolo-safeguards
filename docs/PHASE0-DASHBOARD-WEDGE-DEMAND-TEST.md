# Phase-0 demand test — sell the existing safety outcome, not a dashboard

Written 2026-07-19 (revised per Igor's corrections). Decision: **no dashboard code yet.**
This tests whether real buyers will pay for the reliability/safety outcome we already
have, before any product is built. Companion analysis: `docs/RESEARCH-WEB-DASHBOARD-SAAS-2026-07.md`
(v2, owned by opencode-glm — directional-grade, not decision-grade).

## The value proposition to test (Igor's words — this is the outcome we already own)

> Stop runaway AI-agent loops, unsafe terminal actions, and silent failures before they
> burn budget or damage a repository — from your phone.

We do NOT pitch a "dashboard subscription." We sell the **existing** offers with this
sharpened outcome framing and watch for a specific buyer pull.

## The channel: the existing pipeline (no new product, no new funnel)

Run this through the **$499 Agent Reliability Diagnostic** and **$1,500 Hardening Sprint**
already in `business_os/revenue/pipeline-status-2026-07-17.tsv`. The dashboard is a
*possible later product*, not the thing being sold in Phase 0.

Two live prospects are the sharpest to watch — both were sourced from GitHub issues that
describe the exact pull we'd want to see:

| Prospect | Their own signal | Watch for |
|---|---|---|
| **webai — David Stout** | ragentop #24: "kill switch for runaway agent sessions" | asks for continuous monitoring / remote stop |
| **2389 — Harper Reed** | coven-gateway #67: "in-flight requests that cannot be cancelled" | asks for continuous monitoring / remote stop |

## Build/kill gate (strict — real payment is the only strong signal)

**BUILD the dashboard only if ALL three hold:**
1. **≥3 qualified buyer conversations** (a real back-and-forth about their agent-safety
   pain, not a one-line "interesting").
2. **≥1 PAID diagnostic** ($499 cleared — actual money, not a reply or a non-binding LOI).
3. **≥2 buyers explicitly request continuous monitoring or remote intervention** ("can I
   see/stop my agents remotely / on an ongoing basis"), unprompted.

**KILL the dashboard idea if:** two message/segment iterations produce **no paid
diagnostic**. One interested reply or an LOI is too weak — it does not count. If buyers
only want transcript sync, CloudCLI's free/€7 product wins and we walk away.

## Why compliance is NOT the wedge (corrected)

The EU AI Act is a *later enterprise segment*, not the initial motion:
- The **Digital Omnibus** (Council final approval 2026-06-29) moved standalone Annex III
  high-risk obligations to **Dec 2, 2027**, and product-embedded (Annex I) to
  **Aug 2, 2028**. There is **no 2026 logging deadline** for this category.
- **Coding assistants are not automatically high-risk** under Article 6 (not an Annex I
  safety component, not in Annex III). We cannot market a "compliance SKU" in 2026 without
  formal legal validation.
- Source: [EC guidance on high-risk AI](https://digital-strategy.ec.europa.eu/en/policies/guidelines-ai-high-risk-systems).
- Treat compliance/audit-log as a possible enterprise phase *after* the safety outcome
  proves it can be sold — never as the opening anchor.

## Why the Anthropic-dependency wedge is real but must be built correctly (corrected)

Model-agnostic routing **reduces** Anthropic dependency but does **not eliminate** it if
Hermes controls Claude Code *subscription* sessions (the Apr 4, 2026 third-party-wrapper
ban is real and would still bite). The clean, durable path:
- **Local models + metered provider APIs** (e.g. Together per-token, GLM, grok) — NOT
  third-party OAuth access to Claude Pro/Max subscription quotas.
- Positioned this way, the product never routes through a vendor's subscription servers,
  so it sidesteps the wrapper ban entirely. That is the only genuinely defensible sliver.

## On the competitor (corrected)

CloudCLI (`siteboon/claudecodeui`) is a **high-traction direct competitor** — GitHub
stars/forks/releases prove visible OSS adoption, **not** funding, revenue, or retention.
Do not describe it as "well-funded" or "dominant" without financing evidence. It owns the
commodity *sync* category; it does **not** have our act-on-incidents layer
(ThumbGate/Leash kill-rules, runaway-loop watchdog).

## What I did / did NOT do
- Sent nothing; created no Gmail drafts; wrote no product code.
- Did not edit the v2 research doc (owned by opencode-glm; already carries these fixes).
- Open decision for Igor: fold the outcome value-prop line into the live $499/$1,500
  outreach copy for the next revenue-loop iteration, and flag webai/2389 as the two to
  watch for the continuous-monitoring pull.
