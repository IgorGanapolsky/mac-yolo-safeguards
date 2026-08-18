---
name: ona-last-mile
description: >
  Place Mac + Hermes Mobile work local-first using Ona/OpenAI Cloud Agent
  ideas (persist across devices, customer-controlled credentials, reviewable
  receipts). Default local under $10/mo. We are not Ona Cloud. Trigger: Ona,
  Gitpod, Cloud Agents, last-mile, persist across phone and Mac.
---

# Ona last-mile (our fleet)

Source: https://ona.com/stories/ona-joins-openai · Johannes close email 2026-08-14.

Ona/OpenAI will run most agent work in **customer-controlled cloud environments**.
The remaining last mile is what we already operate: this Mac, Hermes Mobile on
the phone, Keychain, launchd, and a hard $10/mo metered cap.

```bash
ona-last-mile doctor --json
ona-last-mile route "pair Hermes Mobile over USB"
ona-last-mile route "run this on an Ona Cloud background agent"
```

## Hard rules

| Never | Always |
|-------|--------|
| Claim we are Ona / 80% cloud | `LOCAL_FIRST` unless explicit cloud + budget |
| Send secrets/Keychain/phone/adb to cloud | Local placement |
| Store prompt text in receipts | SHA-256 fingerprint only |
| Sell ThumbGate enterprise governance to OpenAI | Design-partner **customer** pitch only |
| Copy Antigravity `ona-cloud-agent-*` theater | This placement CLI |

## What we stole (and did not rebuild)

1. Persist across devices → Hermes Mobile + hash receipts
2. Customer-controlled credentials → macOS Keychain, never prompt dumps
3. Reviewable work → `~/.hermes/ona-last-mile-receipts.jsonl`
