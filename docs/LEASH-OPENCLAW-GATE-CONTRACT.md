# Leash OpenClaw Gate Contract

T-81 defines the executable contract for turning OpenClaw-style policy/risk inputs into Leash gates without colliding with Cursor's T-80 mobile UI work.

## What Ships Here

```bash
node tools/leash-openclaw-gate-contract.js defaults --pro
node tools/leash-openclaw-gate-contract.js from-policy policy.jsonc
node tools/leash-openclaw-gate-contract.js evaluate "OpenClaw should approve invoice and send payment"
node tests/test-leash-openclaw-gate-contract.js
```

The contract emits:

- `allow` gates for low-risk read-only checks
- `ask` gates for submits, sends, payments, approvals, and external navigation
- `block` gates for secrets, credentials, destructive shell work, and exfiltration
- tier capabilities that keep basic Leash useful before upgrade

## Monetization Boundary

Free:

- approve or deny a pending chat action
- send ThumbGate thumbs up/down feedback inside chat
- see that standing gates exist

Pro:

- view every standing allow/ask/block gate
- create, edit, and delete standing gates
- import OpenClaw policy/risk rules

ThumbGate feedback stays in chat. It is not moved into the paid rule editor.

## Why This Helps Hermes

OpenClaw-style assistants are useful because they act across apps, browser pages, messages, calendars, and local devices. That also creates a clear paid surface: persistent control over what the agent may do without asking, what must ask first, and what is always blocked.

This contract gives Hermes a narrow, testable implementation path:

1. Cursor's T-80 app UI can consume the same `gate` shape.
2. Gateway work can expose the same allow/ask/block model over `/v1/gates`.
3. Future OpenClaw import can start as policy conversion, not raw unrestricted agent control.
4. The free/pro boundary is validated by tests instead of copy in a paywall.

## Gate Shape

```json
{
  "id": "openclaw-ask-submit-money-external",
  "version": 1,
  "title": "Ask before OpenClaw submits, pays, sends, or leaves site",
  "effect": "ask",
  "scope": "openclaw",
  "source": "openclaw",
  "tier": "pro",
  "matcher": "submit|send|purchase|payment|approve|external_navigation",
  "risks": ["submit_or_send", "money_movement", "external_navigation"],
  "standingRule": true,
  "editable": true,
  "deletable": true,
  "visibleToFree": true
}
```

## Coordination

Do not duplicate this into Cursor-owned T-80 files. If the app needs it, import or port the same fields:

- `effect`
- `scope`
- `source`
- `tier`
- `matcher`
- `risks`
- `standingRule`
- `editable`
- `deletable`

The UI can rename labels, but it should not change the business rule that Pro manages standing rules while chat approval and ThumbGate feedback stay free.

## Verification

```bash
node tests/test-leash-openclaw-gate-contract.js
```

The focused test covers free/pro capabilities, default gate coverage, JSONC policy import, OpenClaw approvals/blocks/allows/tool mappings, contract validation, risk evaluation, and CLI output.
