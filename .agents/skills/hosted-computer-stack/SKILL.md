---
name: hosted-computer-stack
description: >
  Honesty doctor for Perplexity Computer / OpenClaw / E2B / Cua blueprints.
  We are not those products. Hosted Hermes is $10/mo chat on a fenced VPS.
  Hands is POLICY_CUE_NOT_DRIVER. Trigger: OpenClaw, Eigent, E2B, trycua, Cua,
  Agent S, Manager/Factory/Hands, clone Computer, are you sure the layers exist.
---

# Hosted Computer stack (we are not them)

Source format: https://www.perplexity.ai/products/computer

Do **not** vendor OpenClaw, Eigent, E2B, trycua/Cua, or Agent S. ECI pauses
hosted-app expansion and net-new governance R&D.

```bash
hosted-computer doctor --json
hosted-computer route "install openclaw"
hosted-computer route "use playwright to click Gmail"
hosted-computer route "Give hosted Hermes a job: watch CI overnight"
```

## Hard rules

| Never | Always |
|-------|--------|
| Map file names onto Manager/Factory/Hands | Falsify: read `execute()` and grep the runner |
| Claim Hands because `HOSTED_BROWSER_CUE_RES` exists | Report `POLICY_CUE_NOT_DRIVER` |
| Install OpenClaw/Cua/E2B on the daily Mac or VPS | `CLONE_FORBIDDEN` |
| Expand hosted Hermes into a Computer SKU | Keep `$10` chat + in-app approvals |

## Live stack (inspect, do not relabel)

1. Factory → `services/hermes-cloud-runner/server.js` `execute()` POSTs `/chat/completions`
2. Hands → `cloud-tool-policy.ts` cue regex + `hosted-apphost.ts` `browserHealthUrl()`
3. Manager → `tools/hermes-economic-router.js` exists and is **not** imported by the runner
