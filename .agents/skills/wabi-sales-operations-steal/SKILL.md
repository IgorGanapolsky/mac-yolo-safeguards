---
name: wabi-sales-operations-steal
description: Use when driving sales operations, outbound/inbound deal threads, or abandoned checkout recovery using Wabi's ("Start something together", wabi.ai) 3 collaborative micro-widget patterns: Shared Deal Plan & ROI Map, Shared SLA/Trial Countdown Widget, and Email/Funnel Deadline Recovery Scanner.
---

# Wabi Collaborative Sales Operations Skill (`wabi-sales-operations-steal`)

Distilled from `/Users/iganapolsky/Downloads/wabi.pdf` (*"Welcome to Wabi. Start something together. The AI assistant you use together."* — Oct 29, 2026).

## Core Pattern: Replace Cold Text Walls with Shared Multiplayer Sales Micro-Widgets

1. **Shared Deal Plan & Fleet ROI Map (`buildCollaborativeDealPlanWidget`)**
   - Inspired by Wabi's *"Plan a weekend trip together — Build the plan and a shared map your friends can add to."*
   - Generates a co-editable **Shared Rollout Plan** (`~/.hermes/wabi-sales-widgets/shared-fleet-rollout-plan.html`) where the prospect champion and engineering manager see exact annual savings and 1-click self-serve links:
     - **1 Mac (`$9.99`)**: `https://iganapolsky.gumroad.com/l/odrkon`
     - **2–4 Macs (`$49`)**: `https://iganapolsky.gumroad.com/l/vcrho`
     - **5–9 Macs (`$499`)**: `https://buy.stripe.com/9B69ATbmI4r4ak5e0DS3i3k`
     - **10–19 Macs (`$1,500`)**: `https://buy.stripe.com/4gM28r18Mg9M3HD0xN3sI38`
     - **20+ Macs (`$3,000`)**: `https://buy.stripe.com/fZucN5bmI8Hk8098qf3sI3j`
2. **Shared Deal & Trial Countdown Widget (`buildSharedDealCountdownWidget`)**
   - Inspired by Wabi's *"Count down to your next event — Make a countdown widget everyone in the chat can see."*
   - Embeds a shared 48h diagnostic SLA / founding-rate countdown into every active deal thread.
3. **Email & Checkout Deadline Scanner (`scanDealAndCheckoutDeadlines`)**
   - Inspired by Wabi's *"Never miss a return deadline — Find return windows in your email and get help."*
   - Scans Stripe checkout cancel-page bounces (`8` checkout starts $\rightarrow$ `4` cancel-page views) and competitor renewal windows to route instant `$9.99` / `$49` no-approval downsells while enforcing ECI domain isolation (`@ecisolutions.com` / `@ecinexus.com` blocked).

## Quick Commands

```bash
node tools/wabi-sales-operations-engine.js
node tests/test-wabi-sales-operations-engine.js
```
