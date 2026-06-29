---
type: "project-report"
project: "restaurant-ai-answering"
source_status: "local-export"
last_verified: "2026-06-29T13:51:03+00:00"
canonical_source: "sales/restaurant-ai-answering-lead-queue-2026-06-29.md"
---
# Restaurant AI Answering Lead Queue

Date: 2026-06-29

This is the local lead queue named by the centralized compiled vault. It is prepare-only. It does not authorize posting, DMing, emailing, or submitting anything externally.

## Current Selection Rule

Pick one lead only if it has a restaurant/QSR/POS customer-interaction leak and one of:
- fresh reply or ask-for-help signal
- request for demo, docs, pricing, implementation, or examples
- clear integration surface such as POS/API/webhook/export/VoIP/booking/catering
- current thread that can be read back live before action

## Active Candidate 1: POS Compatibility / Pointless POS Pattern

Evidence:
- `sales/pos-compatibility-audit.md`
- `scripts/revenue_ops/skool_lead_analyzer.py`
- Historical report evidence mentions `Calm-Republic9370`, a Pointless POS owner, asking whether MCP is better than webhooks.

Workflow pain:
Restaurant/POS operator needs to decide whether order export, webhooks, API docs, manager notes, or reporting surfaces can support a safe first automation.

Diagnostic path:
Ask for API/webhook/export docs, then route to the $499 POS compatibility diagnostic only after the integration surface is real.

Approval-ready next action:
Prepare a reply that asks for the integration surface first. Do not paste checkout unless the buyer asks for pricing or confirms they want the diagnostic.

## Active Candidate 2: AI Restaurant Empire / Partnership Structure

Evidence:
- `reports/gtm/2026-06-24-money-today/skool-outcome-queue.md`
- `reports/gtm/skool_prediction_scores_latest.json`
- `sales/close-packet-restaurant-answering-ai-restaurant-empire.md`
- URL: `https://www.skool.com/ai-restaurant-empire-6153/guys-whats-the-best-partnership-structure-that-actually-works`

Workflow pain:
Commission or partnership structure is premature until the customer path can attribute conversions, reorders, gym-member referrals, or catering/review outcomes.

Diagnostic path:
Qualify tracking first: code, landing page, POS tag, CRM field, order export, or manager log. Then offer diagnostic only after they ask for help.

Caution:
This thread has prior Igor comment risk from 2026-05-14, and unauthenticated `curl` readback returned `HTTP/2 403` on 2026-06-29. Require authenticated browser readback before any action.

Approval phrase:
`APPROVE ALMA PURA RESTAURANT DIAGNOSTIC REPLY`

## Active Candidate 3: Restaurant/QSR Promo Reply Watch

Evidence:
- `reports/gtm/2026-06-24-money-today/skool-outcome-queue.md`
- URL: `https://www.skool.com/classifieds/i-am-looking-for-one-restaurant-venue-or-local-service-business`
- Existing status: posted, awaiting outcome check.

Workflow pain:
Generic restaurant/QSR offer only becomes actionable if someone asks for link, demo, docs, pricing, or help.

Diagnostic path:
If there is a reply, classify it:
- operator with restaurant pain
- agency builder wanting a sellable QSR offer
- low-intent curiosity

Caution:
Do not bump without fresh reply evidence.

## Prepared No-Send Packet: Kitchen 57

Evidence:
- `reports/gtm/2026-06-29-money-today/kitchen57-restaurant-answering-no-send-packet.md`
- `sales/pre-audits/kitchen57-restaurant-answering-map-2026-06-29.md`
- `output/pdf/kitchen57-restaurant-answering-map-2026-06-29.pdf`
- `scripts/revenue_ops/render_kitchen57_answering_map_pdf.py`
- Public private-events page verified 2026-06-29.
- Public reservation page verified 2026-06-29.
- Prior Kitchen 57 contact evidence exists from 2026-05-14 and 2026-06-11.

Workflow pain:
Kitchen 57 has separate public paths for Resy reservations, parties over 6 by email, private-events inquiry form, catering, phone, and general email. The diagnostic wedge is whether private-event and catering inquiries get acknowledged, qualified, and routed as quickly as table reservations.

Approval-ready next action:
Use only if duplicate-risk is explicitly accepted or a fresh inbound/reply/context creates a legitimate continuation reason.

Approval phrase:
`APPROVE KITCHEN57 RESTAURANT DIAGNOSTIC REPLY`

## Disqualified Or Stale Without Fresh Readback

### Mo Anwary / Spin The Wheel

Evidence:
- `reports/gtm/followup_ledger.csv` marks it disqualified on 2026-06-24: seller-room peer engagement, no buyer-shape, no reply.
- Prior `APPROVE MO` action was already posted.

Rule:
Do not bump. Only re-open if live readback shows a new buyer reply, ask-for-link, DM, checkout intent, or paid conversion.

## Next GSD Action

Before any external action on Kitchen 57:

- re-read the intended send/reply surface
- confirm this is not a duplicate cold send against the same recipient
- confirm the send/reply control is enabled
- require the approval phrase `APPROVE KITCHEN57 RESTAURANT DIAGNOSTIC REPLY`
- after any approved send, record URL, timestamp, recipient/surface, and proof artifact

If Kitchen 57 remains too duplication-risky, return to Active Candidate 1 and live-read the POS Compatibility / Pointless POS thread before preparing a send.
