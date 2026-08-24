---
name: obscura-browser-guard
description: >
  High-ROI steal of Obscura (h4ckf0r0day/obscura) into thumbgate.app: SSRF
  deny-by-default for hosted URL fetches, CDP bind 127.0.0.1 only, zero-state
  sessions. Never clone the Rust/V8 engine, stealth, proxies, or Continuity.
  Slash: /obscura-browser-guard.
---

# Obscura browser guard (mechanics, not their engine)

Source: https://github.com/h4ckf0r0day/obscura

```bash
node tools/obscura-browser-guard.js --health --json
node tools/obscura-browser-guard.js --ssrf --url 'http://169.254.169.254/' --json
node tools/obscura-browser-guard.js --cdp-bind --bind 0.0.0.0 --json
node tests/test-obscura-browser-guard.js
```

| NEVER | ALWAYS |
|-------|--------|
| Clone Obscura / V8 / Chromium | Use this SSRF + bind policy |
| Stealth fingerprint / residential proxies | SKIP |
| Bind CDP to `0.0.0.0` | `127.0.0.1` / `::1` |
| Reuse Igor's interactive Chrome | Ephemeral zero-state session |
| Honor client `allowPrivateNetwork` | Operator override only |
| Hero Continuity / Mac-pair | Hosted VPS product lock |

Hosted wire: `evaluateHostedUrlFetch` in `apps/hermes-control-plane/lib/hosted-tool-approvals.ts`.
