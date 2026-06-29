---
type: "buyer-scout"
project: "restaurant-ai-answering"
source_status: "local-export"
last_verified: "2026-06-29T08:01:01+00:00"
canonical_source: "reports/gtm/2026-06-29-money-today/restaurant-fresh-buyer-scout.md"
---
# Restaurant Fresh Buyer Scout

Generated: `2026-06-29T07:33:30+00:00`

Scope: prepare-only public lead discovery. No post, DM, email, checkout send, deploy, form submission, phone call, or payment action was executed.

- Status: `prepare_only_needs_live_readback`
- External side effect: `false`

## Top Candidate

- Title: Phone Orders / Maple POS integration question
- Score: `94/100`
- Source: https://www.reddit.com/r/restaurantowners/comments/1q2ke7k/phone_orders/
- Published hint: `5 months ago`
- Problem: Restaurant owner wants to get away from phone orders; menu is large, customers are unprepared, and Maple is the only AI phone service they found that integrates with their POS.
- Restaurant surface: `phone_orders,pos_integration,large_menu,credit_card_payment,reservations`
- Approval keyword after live guard only: `APPROVE RESTAURANT SCOUT PHONE ORDERS`
- Next step: Open the source URL in an authenticated/read-only browser, confirm the thread is still visible, confirm Igor has not already replied, then prepare a question-first diagnostic reply. Do not post or DM without the exact approval keyword.

## Ranked Candidates

| Rank | Score | Status | Candidate | Surface | Approval after live guard |
|---:|---:|---|---|---|---|
| 1 | 94 | `needs_live_readback` | [Phone Orders / Maple POS integration question](https://www.reddit.com/r/restaurantowners/comments/1q2ke7k/phone_orders/) | `phone_orders,pos_integration,large_menu,credit_card_payment,reservations` | `APPROVE RESTAURANT SCOUT PHONE ORDERS` |
| 2 | 86 | `needs_live_readback` | [Embedding dynamic Toast menus on a website](https://www.reddit.com/r/ToastPOS/comments/1qk6y3b/embedding_dynamic_toast_menus_on_a_website/) | `toast,menu_data,api_access,online_ordering,reservations` | `APPROVE RESTAURANT SCOUT TOAST MENU` |
| 3 | 56 | `needs_live_readback` | [Using AI voice agents for expanding my business?](https://www.reddit.com/r/restaurantowners/comments/1qef27c/using_ai_voice_agents_for_expanding_my_business/) | `missed_calls,reservations,dinner_rush,phone_first_demographic` | `APPROVE RESTAURANT SCOUT MISSED RESERVATIONS` |
| 4 | 49 | `needs_live_readback` | [Small town delivery service routing marketplace orders into Toast POS](https://www.reddit.com/r/ToastPOS/comments/1m6crv8/small_town_delivery_service_looking_to_have_my/) | `toast,marketplace_orders,webhooks,api,delivery_routing` | `APPROVE RESTAURANT SCOUT TOAST MARKETPLACE` |

## Guardrails

- Search snippets are lead-discovery evidence, not posting permission.
- Require live readback of the exact target before drafting final copy.
- Require duplicate check against ledgers and visible thread state.
- Do not include checkout in a first touch unless the buyer asks for price/payment or confirms diagnostic intent.
- Use the exact approval keyword only after a live-read guard packet is created.
