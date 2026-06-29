---
type: "buyer-scout"
project: "restaurant-ai-answering"
source_status: "local-export"
last_verified: "2026-06-29T13:51:03+00:00"
canonical_source: "reports/gtm/2026-06-29-money-today/restaurant-fresh-buyer-scout.md"
---
# Restaurant Fresh Buyer Scout

Generated: `2026-06-29T13:17:16+00:00`

Scope: prepare-only public lead discovery. No post, DM, email, checkout send, deploy, form submission, phone call, or payment action was executed.

- Status: `guard_ready_bundle`
- External side effect: `false`
- Guard-ready candidates: `5`

## Top Candidate

- Title: Phone Orders / Maple POS integration question
- Score: `94/100`
- Source: https://www.reddit.com/r/restaurantowners/comments/1q2ke7k/phone_orders/
- Published hint: `5 months ago`
- Problem: Restaurant owner wants to get away from phone orders; menu is large, customers are unprepared, and Maple is the only AI phone service they found that integrates with their POS.
- Restaurant surface: `phone_orders,pos_integration,large_menu,credit_card_payment,reservations`
- Guard status: `ready_for_approval`
- Guard path: `reports/gtm/2026-06-29-money-today/restaurant-scout-guard.json`
- Approval keyword: `APPROVE RESTAURANT SCOUT PHONE ORDERS`
- Next step: Guard packet is ready. Ask for the exact approval keyword, execute only the guard's question-first no-link reply, verify platform readback, then watch for a buyer reply. Do not include checkout in the first touch.

## Ranked Candidates

| Rank | Score | Status | Candidate | Surface | Guard | Approval |
|---:|---:|---|---|---|---|---|
| 1 | 94 | `guard_ready_for_approval` | [Phone Orders / Maple POS integration question](https://www.reddit.com/r/restaurantowners/comments/1q2ke7k/phone_orders/) | `phone_orders,pos_integration,large_menu,credit_card_payment,reservations` | `ready_for_approval` | `APPROVE RESTAURANT SCOUT PHONE ORDERS` |
| 2 | 86 | `guard_ready_for_approval` | [Embedding dynamic Toast menus on a website](https://www.reddit.com/r/ToastPOS/comments/1qk6y3b/embedding_dynamic_toast_menus_on_a_website/) | `toast,menu_data,api_access,online_ordering,reservations` | `ready_for_approval` | `APPROVE RESTAURANT SCOUT TOAST MENU` |
| 3 | 56 | `guard_ready_for_approval` | [Using AI voice agents for expanding my business?](https://www.reddit.com/r/restaurantowners/comments/1qef27c/using_ai_voice_agents_for_expanding_my_business/) | `missed_calls,reservations,dinner_rush,phone_first_demographic` | `ready_for_approval` | `APPROVE RESTAURANT SCOUT MISSED RESERVATIONS` |
| 4 | 49 | `guard_ready_for_approval` | [Small town delivery service routing marketplace orders into Toast POS](https://www.reddit.com/r/ToastPOS/comments/1m6crv8/small_town_delivery_service_looking_to_have_my/) | `toast,marketplace_orders,webhooks,api,delivery_routing` | `ready_for_approval` | `APPROVE RESTAURANT SCOUT TOAST MARKETPLACE` |

## Additional Ready Guards

| Status | Target | Guard | Approval |
|---|---|---|---|
| `ready_for_approval` | [AI use in restaurants.](https://www.reddit.com/r/restaurantowners/comments/1u74q8b/ai_use_in_restaurants/) | `reports/gtm/2026-06-29-money-today/restaurant-market-intel-guard-ai-use.json` | `APPROVE RESTAURANT SCOUT AI USE OPS` |

## Guardrails

- Search snippets are lead-discovery evidence, not posting permission.
- Require live readback of the exact target before drafting final copy.
- Require duplicate check against ledgers and visible thread state.
- Do not include checkout in a first touch unless the buyer asks for price/payment or confirms diagnostic intent.
- Use the exact approval keyword only after a live-read guard packet is created.
