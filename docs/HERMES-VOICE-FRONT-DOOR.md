# Hermes Voice Front Door (SpaceXAI → money path)

**Status:** implemented as policy + demo pack (T-251)  
**Not:** a live phone carrier, Stripe sender, or Hermes coding-gateway phone bridge.

SpaceXAI Voice Agent Builder (21 voices, agent-to-agent transfer, custom MCPs, free US number) is a **phone front door**. Hermes remains async ops + reliability proof. This doc is the contract so demos close **$499 / $1,500 / $3,000** work without inventing prices or marking fake “paid”.

## High-ROI scope (what we built)

| Item | Artifact | Operator action |
|------|----------|-----------------|
| Multi-agent transfer policy | `tools/hermes-voice-front-door.js` | Enforce who may quote / transfer / hand off |
| HubSpot ↔ pipeline map | same tool + `docs/voice-front-door/hubspot-pipeline-map.example.tsv` | Keep CRM stage aligned with private `pipeline-status.tsv` |
| Paste-ready demo agents | `docs/voice-front-door/demo-agents.json` + `--event demo-pack` | Paste into SpaceXAI Voice Agent Builder |
| Money ladder | same as [SALES-CLOSE-KIT.md](./SALES-CLOSE-KIT.md) | Score 0–10 → free / $499 / $1,500 / $3,000 |

Out of scope (intentionally): restaurant POS commission, routing Hermes Telegram through the phone, automatic Stripe charges.

## Architecture

```text
Caller
  │
  ▼
SpaceXAI Voice Agent Builder (US number, sales/support voices)
  │  qualify → close → human   (context preserved on transfer)
  │  tools: HubSpot MCP, web/X search (facts)
  │
  ├─ policy: node tools/hermes-voice-front-door.js --event transfer ...
  │
  ▼
After call (async, Hermes / operator)
  tools/pipeline-update.js   → private pipeline-status.tsv
  tools/send-plan.js         → mailto / booking only
  Stripe + revenue ledger    → only cleared payment counts as revenue
```

## Agents and gates

| Agent | May | Must not |
|-------|-----|----------|
| **qualify** | Discovery questions; HubSpot contact + stage ready/sent; calendar triage link | Quote final price; send payment link; mark paid |
| **close** | Quote **published ladder only** after score ≥ 4 + discovery complete; stage booked/proposed | Custom discount; SLA invention; payment link |
| **human** | Partner pilot, compliance, payment exceptions; Stripe after approval flag | Auto “closed won” without ledger |

### Transfer edges

1. `qualify → close` when `agent_stack` + `repeated_failure` + `business_cost` are true **and** score ≥ 4 (and score < 9).
2. `* → human` on compliance / custom price / anger / PO-net-30 / agency resell language, **or** score ≥ 9 (partner pilot).
3. `close → qualify` if discovery is incomplete.

### Payment rule (hard)

Voice agents **never** send Stripe unless:

- agent is `human`, and  
- `human_approved_payment=yes`, and  
- pipeline stage is `booked` or `proposed`.

`paid` is only for [tools/record-cleared-payment.js](../tools/record-cleared-payment.js) + revenue ledger — not for the voice bot.

## Score → offer (same as Sales Close Kit)

| Score | Offer |
|------:|-------|
| 0–3 | Free repo + ThumbGate link |
| 4–5 | Agent Reliability Diagnostic **$499** |
| 6–8 | AI Agent Hardening Sprint **$1,500** |
| 9–10 | Partner Pilot **$3,000** (human path) |

Signals/weights match `tools/prospect-score.js`.

## HubSpot ↔ pipeline stages

| Pipeline (`pipeline-status.tsv`) | HubSpot deal stage (canonical) | Default next action |
|----------------------------------|--------------------------------|---------------------|
| ready | new | send_first_touch_or_voice_demo |
| sent | contacted | wait_for_reply |
| replied | qualified | book_triage_call |
| booked | meeting scheduled | hold_call |
| proposed | proposal sent | send_stripe_invoice_human_only |
| paid | closed won | add_to_revenue_ledger |
| lost | closed lost | no_action |

Aliases (`proposal_sent`, `closedwon`, etc.) are accepted by the mapper. Full table: `docs/voice-front-door/hubspot-pipeline-map.example.tsv`.

## Commands

```sh
# Decide transfer + tools for a live call state
node tools/hermes-voice-front-door.js --event transfer --json --signals-json '{
  "current_agent":"qualify",
  "agent_stack":"yes",
  "repeated_failure":"yes",
  "business_cost":"yes",
  "budget_owner":"no",
  "segment":"founder"
}'

# Map CRM
node tools/hermes-voice-front-door.js --event map-hubspot --hubspot-stage "proposal sent" --json

# Gate a tool
node tools/hermes-voice-front-door.js --event tool-gate --agent close --tool send_payment_link --json

# Paste-ready multi-agent pack for SpaceXAI
node tools/hermes-voice-front-door.js --event demo-pack --json

# After-call pipeline fields (operator still runs pipeline-update.js)
node tools/hermes-voice-front-door.js --event pipeline-from-voice --json --signals-json '{...}'

# After-call apply (dry-run default) — prints exact pipeline-update.js command
node tools/hermes-voice-front-door.js --event apply-pipeline --json \
  --pipeline /path/to/private/pipeline-status.tsv \
  --date 2026-07-14 \
  --signals-json '{"prospect_label":"acme","current_agent":"qualify","agent_stack":"yes","repeated_failure":"yes","business_cost":"yes","budget_owner":"no","segment":"founder","pipeline_stage":"replied"}'

# Write for real (never auto-paid; Stripe/ledger still required for money)
node tools/hermes-voice-front-door.js --event apply-pipeline --apply --json \
  --pipeline /path/to/private/pipeline-status.tsv \
  --date 2026-07-14 \
  --signals-json '{...}'

# Private prompt-free receipt (~/.hermes/voice-front-door/receipts.jsonl)
node tools/hermes-voice-front-door.js --event receipt --write --signals-json '{...}' --json
```

### Stage suggestions after a call

| Outcome | Suggested pipeline stage |
|---------|--------------------------|
| Free route (score ≤ 3) | keep `ready` (no false progress) |
| Diagnostic/sprint close (score 4–8) | `booked` |
| Human / partner pilot (score ≥ 9 or compliance) | `proposed` |
| Paid | **never** from voice without `--allow-paid` + ledger |

Tests:

```sh
node tests/test-hermes-voice-front-door.js
```

## SpaceXAI setup checklist (agent executes policy; no user homework)

1. Create three agents from `demo-agents.json` (or `demo-pack` CLI): **qualify**, **close**, **human**.  
2. Enable agent-to-agent transfer with **preserve context**.  
3. Connect HubSpot MCP; restrict stage writes to the map above.  
4. Enable web search for factual product claims only.  
5. Use a **sales** voice on close, **support** on qualify/human.  
6. Free US number for demos; do not claim production restaurant telephony.  
7. After each demo call, run `pipeline-from-voice` → `pipeline-update.js` on the private TSV.  
8. Close money with existing Stripe offer map + revenue ledger tools.

## Relationship to Hermes harness

| Hermes harness | Voice front door |
|----------------|------------------|
| Economic router, Grok verifier, receipts | Transfer policy + tool gates + private receipts |
| MCP tools on Mac gateway | HubSpot / search MCPs on the phone agent |
| Leash $19.99 IAP (mobile product) | Separate funnel — do not substitute for $499+ reliability work |
| Telegram reliability gate | Phone does **not** replace Telegram; async still Hermes |

## Honesty

- Implementing this file does **not** mean a production voice product is live.  
- Revenue still requires cleared Stripe + ledger proof.  
- Pipeline DS “no ready send-next” is not fixed by voices alone — CRM + outreach still move stages.
