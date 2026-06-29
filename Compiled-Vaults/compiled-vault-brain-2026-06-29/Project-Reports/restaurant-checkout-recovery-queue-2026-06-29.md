---
type: "recovery-queue"
project: "restaurant-ai-answering"
source_status: "local-export"
last_verified: "2026-06-29T13:51:03+00:00"
canonical_source: "reports/gtm/2026-06-29-money-today/restaurant-checkout-recovery-queue.md"
---
# Restaurant Checkout Recovery Queue

Generated: `2026-06-29T12:33:09+00:00`
Status: `no_recoverable_restaurant_intents`
Recoverable intents: `0`
Include tests: `false`
Approval keyword: `APPROVE RESTAURANT CHECKOUT RECOVERY`

Purpose: recover restaurant AI answering diagnostic buyers who filled precheckout but have not paid yet.

No outreach is authorized by this file. Use the Gmail subject to find the internal notification, then confirm buyer details and payment truth before replying.

Rule: Do not send checkout recovery until Gmail/internal notification details and Stripe payment truth are checked. Use exact approval APPROVE RESTAURANT CHECKOUT RECOVERY before any recovery reply.

## Queue

No real restaurant checkout intents found yet.

Next action: keep routing approved restaurant leads through `/start-speed-to-lead?offer=restaurant_diagnostic`, then recover any precheckout submits from Gmail within 30 minutes.
