---
type: "scout-execution-packet"
project: "restaurant-ai-answering"
source_status: "local-export"
last_verified: "2026-06-29T13:51:03+00:00"
canonical_source: "reports/gtm/2026-06-29-money-today/restaurant-scout-execution-packet-missed-reservations.md"
---
# Restaurant Scout Execution Packet

Generated: `2026-06-29T13:44:23+00:00`

Scope: local action-time packet only. No Reddit post, DM, email, deploy, form submission, checkout, phone call, or payment action was executed.

- Status: `ready_for_exact_approval`
- Approval required: `APPROVE RESTAURANT SCOUT MISSED RESERVATIONS`
- Target: Using AI voice agents for expanding my business?
- Channel: `reddit_restaurantowners`
- Thread URL: `https://www.reddit.com/r/restaurantowners/comments/1qef27c/using_ai_voice_agents_for_expanding_my_business/`
- Guard: `reports/gtm/2026-06-29-money-today/restaurant-scout-guard-missed-reservations.json`
- Guard status: `ready_for_approval`
- Guard allowed: `true`

## Exact Approval

```text
APPROVE RESTAURANT SCOUT MISSED RESERVATIONS
```

## Exact Reply

```text
For that use case I would start smaller than a general AI voice agent. Missed reservation calls need a clear policy for party size, time windows, deposits, and when a human has to confirm.

The first map should be call capture, reservation-system handoff, staff approval rules, and the summary the manager sees after dinner rush.

Are the missed calls mostly reservation requests, menu questions, or people changing existing bookings?
```

## Pre-Execution Checks

1. Confirm the operator supplied the exact approval keyword in this packet.
2. Reload or freshly open the source thread before posting.
3. Confirm the source post/comment is still visible and relevant.
4. Confirm no duplicate Igor reply already exists on the thread.
5. Confirm the reply editor and submit button are enabled before interacting.
6. Post only exact_text_to_execute; do not add payment, checkout, intake, demo, or phone links.

## Post-Execution Readback

1. Reload the page after submission before final verification.
2. Verify the reply text only inside static read-only comment/post containers.
3. Exclude editor inputs, textareas, contenteditable elements, and form inputs from the verification scope.
4. Confirm the visible comment/reply count increased by exactly 1.
5. Record the platform permalink or static container evidence before updating any ledger.
6. Update any ledger only after platform readback proves persistence.

## Browser Automation Guardrails

- Do not click disabled controls, controls with a disabled attribute, or controls with aria-disabled="true".
- No contacted/post-sent ledger update until post-reload static readback and count +1 are verified.

## Required Evidence Before Ledger Update

- `approval_keyword`
- `platform_permalink`
- `static_container_selector_or_description`
- `comment_count_before`
- `comment_count_after`
- `count_delta`
- `post_reload_verified_at`
- `reply_text_static_match`
- `disabled_controls_excluded`

Invariants:
- count_delta must equal 1
- reply_text_static_match must be true outside editor/input/contenteditable elements
- platform_permalink or static container evidence must be captured before ledger update

## Evidence-Gated Ledger Recorder

Dry-run first; add `--apply` only after the receipt is clean.

```bash
python3 scripts/revenue_ops/restaurant_scout_readback_recorder.py --packet reports/gtm/2026-06-29-money-today/restaurant-scout-execution-packet-missed-reservations.json --approval "APPROVE RESTAURANT SCOUT MISSED RESERVATIONS" --platform-permalink "<verified permalink>" --static-container "<static comment container evidence>" --comment-count-before <before> --comment-count-after <after> --reply-text-static-match --disabled-controls-excluded
```

## Suggested Ledger Row After Verified Readback

Write this only after the required evidence above is captured.

| Field | Value |
|---|---|
| `timestamp` | <post_reload_verified_at> |
| `community` | reddit_restaurantowners |
| `surface` | reddit_public_reply |
| `target` | Using AI voice agents for expanding my business? |
| `url` | <platform_permalink_or_thread_url> |
| `intent` | restaurant_ai_answering_diagnostic |
| `cta_level` | question |
| `product` | $499 Restaurant AI Answering Diagnostic |
| `action` | For that use case I would start smaller than a general AI voice agent. Missed reservation calls need a clear policy for party size, time windows, deposits, and when a human has to confirm.<br><br>The first map should be call capture, reservation-system handoff, staff approval rules, and the summary the manager sees after dinner rush.<br><br>Are the missed calls mostly reservation requests, menu questions, or people changing existing bookings? |
| `status` | posted_after_verified_readback |
| `response` | none |
| `next_step` | Monitor for buyer reply; if they ask for price, link, proof, deliverables, or checkout, run restaurant_buyer_reply_router.py on the exact reply before sending any bridge or payment link. |
| `evidence` | approval=APPROVE RESTAURANT SCOUT MISSED RESERVATIONS; count_before=<before>; count_after=<after>; count_delta=1; static_match=true; permalink=<url> |

## Source Readback Before Packet

- Status code: `200`
- OK: `true`
- Matched terms: `reservation, calls`
