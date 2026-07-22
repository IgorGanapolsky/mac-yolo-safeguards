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

## Honesty

- Live Stripe links only (HTTP 200). Never invent cleared revenue.
- Sends require evidence (Gmail Sent / ledger), not `clicked_send` alone.
- This playbook is **language + packets**. Product code changes belong in separate tasks.
