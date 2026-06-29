---
type: "operator-money-queue"
project: "restaurant-ai-answering"
source_status: "local-export"
last_verified: "2026-06-29T13:51:03+00:00"
canonical_source: "reports/gtm/hermes-money-action-queue.md"
---
# Hermes Money Action Queue

Generated: `2026-06-29T13:51:01+00:00`

Purpose: one canonical no-phone queue for Hermes/Telegram. Codex prepares and verifies; Hermes owns live operator execution.

## Summary

- Prerequisite approvals: `1`
- Ready for approval: `5`
- Needs guard/prep: `0`
- Prepared packets: `2`
- Watch-only: `9`
- Access-blocked: `0`

## Deploy-Pending Fallback Action

Deploy remains the top prerequisite. If exact deploy approval is not present, this is the highest-ranked no-link restaurant demand-start that can be presented next without checkout, intake, demo, or payment links.

- Approval keyword: `APPROVE RESTAURANT SCOUT PHONE ORDERS`
- Target: Phone Orders / Maple POS integration question
- Guard: `/Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/2026-06-29-money-today/restaurant-scout-guard.json`
- Thread: `https://www.reddit.com/r/restaurantowners/comments/1q2ke7k/phone_orders/`
- Rule: Deploy remains the top prerequisite, but this no-link restaurant first touch can start demand while the route is pending. It still requires exact approval and platform readback.

## Queue

| Rank | Priority | Status | Owner | Channel | Target | Next step |
|---:|---:|---|---|---|---|---|
| 1 | 100.0 | `prerequisite_approval` | `hermes_telegram` | `vercel_production_deploy` | Restaurant AI answering buyer route deploy readiness | Ask for exact restaurant deploy approval, then run the approval-gated deploy runner and verify /restaurant-ai-answering returns 200 before sending buyer traffic there. |
| 2 | 96.8 | `ready_for_approval` | `hermes_telegram` | `reddit_restaurantowners` | Phone Orders / Maple POS integration question | Ask for exact action-time approval, then use the matching packet from reports/gtm/2026-06-29-money-today/restaurant-scout-execution-packets.md before any browser action. Post only that packet's guarded question-first Reddit reply, verify post-reload static readback and count +1, then update ledgers. Do not include checkout in the first touch. If the buyer asks for price, link, proof, or deliverables while the restaurant route is pending, use the route-pending bridge approvals from the restaurant approval execution packet. Use manual checkout only after the buyer supplied restaurant URL, POS/menu surface, costly workflow path, and asks to pay. |
| 3 | 95.9 | `ready_for_approval` | `hermes_telegram` | `reddit_toastpos` | Embedding dynamic Toast menus on a website | Ask for exact action-time approval, then use the matching packet from reports/gtm/2026-06-29-money-today/restaurant-scout-execution-packets.md before any browser action. Post only that packet's guarded question-first Reddit reply, verify post-reload static readback and count +1, then update ledgers. Do not include checkout in the first touch. If the buyer asks for price, link, proof, or deliverables while the restaurant route is pending, use the route-pending bridge approvals from the restaurant approval execution packet. Use manual checkout only after the buyer supplied restaurant URL, POS/menu surface, costly workflow path, and asks to pay. |
| 4 | 95.2 | `ready_for_approval` | `hermes_telegram` | `reddit_restaurantowners` | AI use in restaurants. | Ask for exact action-time approval, then use the matching packet from reports/gtm/2026-06-29-money-today/restaurant-scout-execution-packets.md before any browser action. Post only that packet's guarded question-first Reddit reply, verify post-reload static readback and count +1, then update ledgers. Do not include checkout in the first touch. If the buyer asks for price, link, proof, or deliverables while the restaurant route is pending, use the route-pending bridge approvals from the restaurant approval execution packet. Use manual checkout only after the buyer supplied restaurant URL, POS/menu surface, costly workflow path, and asks to pay. |
| 5 | 94.8 | `ready_for_approval` | `hermes_telegram` | `reddit_restaurantowners` | Using AI voice agents for expanding my business? | Ask for exact action-time approval, then use the matching packet from reports/gtm/2026-06-29-money-today/restaurant-scout-execution-packets.md before any browser action. Post only that packet's guarded question-first Reddit reply, verify post-reload static readback and count +1, then update ledgers. Do not include checkout in the first touch. If the buyer asks for price, link, proof, or deliverables while the restaurant route is pending, use the route-pending bridge approvals from the restaurant approval execution packet. Use manual checkout only after the buyer supplied restaurant URL, POS/menu surface, costly workflow path, and asks to pay. |
| 6 | 94.2 | `ready_for_approval` | `hermes_telegram` | `reddit_toastpos` | Small town delivery service routing marketplace orders into Toast POS | Ask for exact action-time approval, then use the matching packet from reports/gtm/2026-06-29-money-today/restaurant-scout-execution-packets.md before any browser action. Post only that packet's guarded question-first Reddit reply, verify post-reload static readback and count +1, then update ledgers. Do not include checkout in the first touch. If the buyer asks for price, link, proof, or deliverables while the restaurant route is pending, use the route-pending bridge approvals from the restaurant approval execution packet. Use manual checkout only after the buyer supplied restaurant URL, POS/menu surface, costly workflow path, and asks to pay. |
| 7 | 59.0 | `prepared_packet` | `codex_prepare` | `rag` | Create revenue move from: NICHE COMMITTED: NJ/PA independent insurance brokers ( + /mo) | Use the prepared broker-audit launch packet; do not post/DM until a specific channel and exact text are action-time approved. |
| 8 | 55.0 | `prepared_packet` | `codex_prepare` | `rag` | Create revenue move from: Igor commented on Faheem lead pipeline help thread | Use the prepared lead-pipeline dedup audit packet; do not post/DM until Faheem or another builder asks for the template, audit, or implementation help. |
| 9 | 100.0 | `watch_only` | `hermes_telegram` | `skool_dm` | Kuldeep Singh / waiting for assets | Do not send another checklist. Watch for Kuldeep to send offer page, checkout/payment page, traffic source, or analytics screenshot; classify scope before any payment link. |
| 10 | 98.0 | `watch_only` | `codex_watch` | `reddit_public_comment` | Dyebbyangj / solo handyman quoting black hole | Restaurant AI answering focus is active and the restaurant deploy gate is pending. Keep this non-restaurant action as backlog; do not request action-time approval from this queue. |
| 11 | 89.0 | `watch_only` | `codex_watch` | `sofa_reply` | LangGraph: an exception in a tool node permanently bricks the thread for OpenAI-compatible APIs | Already replied. Watch for explicit paid diagnostic interest before sending the Stripe checkout link. |
| 12 | 86.0 | `watch_only` | `codex_watch` | `ledger_ml` | Tasneem Esmailjee / I launched my first AI | Already posted/sent. Watch for reply, ask-for-link, DM, checkout intent, or paid conversion within 24 hours. |
| 13 | 74.0 | `watch_only` | `codex_watch` | `skool_execution` | Prepare next fresh qualified Skool buyer bundle | Restaurant AI answering focus is active with deploy or guard-ready restaurant actions. Keep this generic buyer-bundle idea as backlog; do not spend Codex prep here until the restaurant queue is exhausted. |
| 14 | 72.0 | `watch_only` | `codex_watch` | `skool_dm_aymen` | Aymen Khatir / partner intro close | Do not send again. Watch for the prospect reply or a concrete intro target. |
| 15 | 72.0 | `watch_only` | `hermes_telegram` | `skool_dm` | Cav S / struggling to be consistent | Watch for Cav's reply. If they send business type/current lead path, generate one micro-diagnosis before any paid ask. |
| 16 | 67.0 | `watch_only` | `codex_watch` | `stripe` | Old checkout sessions are unrecoverable; future capture is ready | Do not chase old anonymous Stripe sessions. Wait for a new source-preserving precheckout or fit-check event. |
| 17 | 63.5 | `research_seed` | `codex_prepare` | `rag` | Create revenue move from: Omlx Cdc Hermes Revenue Upgrade | Use RAG seed only if no ready guard-passed Skool action exists. |
| 18 | 53.6 | `research_seed` | `codex_prepare` | `post_ml` | Priority Tech Help (Now for for everyone!) | Skip for now. Connex-style revenue routing found too little prospect/qualify/book/payment signal; find a fresher buyer-blocker thread before preparing a guard. |
| 19 | 52.7 | `watch_only` | `hermes_telegram` | `skool_public_comment` | Tools & Software / Ayaan Ali | Already posted. Do not post again; watch for reply, ask-for-link, DM, checkout intent, or paid conversion within 24 hours. |
| 20 | 45.3 | `research_seed` | `codex_prepare` | `post_ml` | Lesson 1-8: The mistake 1 in 3 of you are making | Skip for now. Connex-style revenue routing found too little prospect/qualify/book/payment signal; find a fresher buyer-blocker thread before preparing a guard. |

## Approval-Ready Prerequisites

### APPROVE DEPLOY RESTAURANT AI ANSWERING ROUTE

- Target: Restaurant AI answering buyer route deploy readiness
- Evidence: `/Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/restaurant-deploy-approval-request.json`
- External side effect if approved: `true`
- Reason: Local buyer route is ready, but the live restaurant route and restaurant intake fallback are stale.


## Ready Action Details

### APPROVE RESTAURANT SCOUT PHONE ORDERS

- Target: Phone Orders / Maple POS integration question
- Thread: `https://www.reddit.com/r/restaurantowners/comments/1q2ke7k/phone_orders/`
- Guard: `/Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/2026-06-29-money-today/restaurant-scout-guard.json`
- Revenue route for confirmed interest only: `https://site-gamma-one-15.vercel.app/start-speed-to-lead?source=reddit_restaurant_phone_orders&offer=restaurant_diagnostic`
- External side effect: `true`
- Reason: Live readback, no-checkout text check, and duplicate ledger checks passed.

### APPROVE RESTAURANT SCOUT TOAST MENU

- Target: Embedding dynamic Toast menus on a website
- Thread: `https://www.reddit.com/r/ToastPOS/comments/1qk6y3b/embedding_dynamic_toast_menus_on_a_website/`
- Guard: `/Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/2026-06-29-money-today/restaurant-scout-guard-toast-menu.json`
- Revenue route for confirmed interest only: `https://site-gamma-one-15.vercel.app/start-speed-to-lead?source=reddit_restaurant_toast_menu&offer=restaurant_diagnostic`
- External side effect: `true`
- Reason: Live readback, no-checkout text check, and duplicate ledger checks passed.

### APPROVE RESTAURANT SCOUT AI USE OPS

- Target: AI use in restaurants.
- Thread: `https://www.reddit.com/r/restaurantowners/comments/1u74q8b/ai_use_in_restaurants/`
- Guard: `/Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/2026-06-29-money-today/restaurant-market-intel-guard-ai-use.json`
- Revenue route for confirmed interest only: `https://site-gamma-one-15.vercel.app/start-speed-to-lead?source=reddit_restaurant_ai_use_ops&offer=restaurant_diagnostic`
- External side effect: `true`
- Reason: Live readback, no-checkout text check, and duplicate ledger checks passed.

### APPROVE RESTAURANT SCOUT MISSED RESERVATIONS

- Target: Using AI voice agents for expanding my business?
- Thread: `https://www.reddit.com/r/restaurantowners/comments/1qef27c/using_ai_voice_agents_for_expanding_my_business/`
- Guard: `/Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/2026-06-29-money-today/restaurant-scout-guard-missed-reservations.json`
- Revenue route for confirmed interest only: `https://site-gamma-one-15.vercel.app/start-speed-to-lead?source=reddit_restaurant_missed_reservations&offer=restaurant_diagnostic`
- External side effect: `true`
- Reason: Live readback, no-checkout text check, and duplicate ledger checks passed.

### APPROVE RESTAURANT SCOUT TOAST MARKETPLACE

- Target: Small town delivery service routing marketplace orders into Toast POS
- Thread: `https://www.reddit.com/r/ToastPOS/comments/1m6crv8/small_town_delivery_service_looking_to_have_my/`
- Guard: `/Users/igorganapolsky/workspace/git/igor/skool_top1percent/reports/gtm/2026-06-29-money-today/restaurant-scout-guard-toast-marketplace.json`
- Revenue route for confirmed interest only: `https://site-gamma-one-15.vercel.app/start-speed-to-lead?source=reddit_restaurant_toast_marketplace&offer=restaurant_diagnostic`
- External side effect: `true`
- Reason: Live readback, no-checkout text check, and duplicate ledger checks passed.
