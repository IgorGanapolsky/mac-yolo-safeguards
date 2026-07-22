---
name: prefer-headless-background-ops
description: >
  Default automation posture for Igor's Mac: CLI and API first, background headless
  workers, never hijack interactive Google Chrome or macOS focus unless Igor explicitly
  asked in that message. Use when tempted to open Chrome, osascript, Computer Use,
  headed Playwright, or install CDP LaunchAgents.
---

# Prefer headless / background ops

**Standing rule (2026-07-22):** See [AGENTS.md](../../AGENTS.md) § No desktop hijack and [docs/NO-DESKTOP-HIJACK.md](../../docs/NO-DESKTOP-HIJACK.md).

## Decision tree

```
Need to act on a login-walled dashboard?
  1. Is there a CLI/API? → use it (gh, Play API, ASC .p8, Stripe CLI, Gmail API)
  2. Can SSH/adb on fleet/device solve it? → use that
  3. Can headless Playwright in Docker/isolated profile work? → use that (no daily Chrome)
  4. Did Igor explicitly ask to drive his Chrome in THIS message?
     NO → STOP; report blocker
     YES → export HERMES_ALLOW_INTERACTIVE_CHROME=1 for that one operation only
```

## Never by default

- `osascript` telling **Google Chrome** to activate, quit, or run JS in the front window
- `drive-logged-in-chrome`, `use-existing-browser-sessions`, Chrome CDP on port 9222
- Cursor Computer Use / browser MCP stealing focus
- Headed Playwright on Igor's interactive profile
- Auto-installing `com.hermes.chrome-cdp` via `install-agent-launchagents.sh`

## Allowed background automation

- LaunchAgents that only run shell/node (`com.igor.*`, E2E, pair watchdogs)
- `gh`, `stripe`, `fastlane`, `adb`, SSH
- Hermes gateway / cloud connector (no GUI)
