# Governed agents — sales playbook (high-ROI)

**Purpose:** Convert the 2026 “governed agents / cost control / compliance” buyer frame into **close language** for ThumbGate offers. Do **not** rebuild an enterprise LLM gateway.

**Source signal:** LangChain (Jul 2026) *Building Governed Agents* — governance sets rules; a **runtime control plane** enforces them on every model/tool hop. Unattended coding agents and retry loops can burn large budgets before anyone notices.

## What we sell (not LangSmith)

| Their words | Our wedge |
|-------------|-----------|
| LLM gateway, tracing, spend policies | Necessary for cloud model traffic — **not** a hard stop on local thrash / tool loops |
| Visibility / control / assure | **Diagnostic → Hardening → Partner Pilot** ladder |
| Tool/MCP/A2A risk > chat text | Leash approvals, fail-closed gates, OS/loop enforcement |

## Offer ladder

| Offer | Entry | One-liner |
|-------|--------|-----------|
| Agent Reliability Diagnostic ($499) | visibility-led | Map token/action burn and the hop with no hard stop |
| Hardening Sprint ($1,500) | control-led | Budgets, tool permissioning, fail-closed stops |
| Partner Pilot ($3,000) | assurance-led | Policy → enforcement → receipts on a real stack |

## Tools (agent-executable)

```bash
# Paste-ready reply when a buyer engages or objects
node tools/buyer-reply-packet.js --list
node tools/buyer-reply-packet.js --kind engaged --name Ann \
  --link 'https://buy.stripe.com/…'   # curl-verified; 403 dropped
node tools/buyer-reply-packet.js --kind langsmith --name Jake --link '…'
node tools/buyer-reply-packet.js --kind hosting --name Martijn

# Autonomous follow-ups use the same copy (template v2)
# tools/governed-agent-sales-copy.js → revenue-autonomous-loop.js
```

## Objection one-liners

- **“We have LangSmith / Bedrock / LiteLLM”** → Tracing shows cost after the fact; it does not hard-stop a runaway session thrashing a machine.
- **“We already host agents”** → Hosting moves work; it does not enforce OS/loop stop or tool approval.
- **“Not now”** → Close politely; leave the spend-spike hook.

## Inbound replies (highest ROI after send)

```bash
# Scan Gmail for replies to Diagnostic / governed-agents follow-ups
node tools/gmail-outreach-reply-scan.js --json
# Board: business_os/revenue/gmail-reply-hot-leads-YYYY-MM-DD.md

# Paste-ready response for a hot lead
node tools/buyer-reply-packet.js --kind engaged|langsmith|hosting|gateway|not_now \
  --name Ann --link 'https://buy.stripe.com/…'
```

Revenue autonomous loop (non-`--fast`) runs the reply scan and lists hot leads on the money board.

## Sent verification

```bash
# Prove a recipient appears in Gmail Sent (Chrome session)
node tools/chrome-gmail-sent-verify.js --to newman@quantstruct.com --json
```

Chrome Gmail sends in the revenue loop verify Sent by default (`REVENUE_SKIP_SENT_VERIFY=1` to skip; `REVENUE_REQUIRE_SENT_VERIFY=1` to fail closed on verify errors).

## UFA (ufa.foundation) — skip as priority

Ultimate Fighting Agents is a live SF jailbreak/PvP arena, not a buyer pipeline. Do **not** enter/sponsor as a cash-path move. Optional spectator only. Social angle lives in `docs/social/governed-agents-hard-stop-pack.md`.

## Honesty

- Live Stripe links only (HTTP 200). Never invent cleared revenue.
- Sends require evidence (Gmail Sent / ledger), not `clicked_send` alone.
- This playbook is **language + packets**. Product code changes belong in separate tasks.
