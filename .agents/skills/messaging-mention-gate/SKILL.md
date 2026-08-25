---
name: messaging-mention-gate
description: >
  Nous Mattermost process steal: deny-all empty allowlist, DMs always
  respond, channels require @mention, allowed_channels drop-before-mention
  (DMs exempt), per-user session namespaces, ephemeral channel prompts,
  admin/user slash split. Not a Mattermost bot. Slash: /messaging-mention-gate.
---

# Messaging mention gate — not a Mattermost clone

Source: https://hermes-agent.nousresearch.com/docs/user-guide/messaging/mattermost

Nous Hermes Agent documents a Mattermost bot (aiohttp REST + WebSocket). **Do
not clone the adapter or stand up Mattermost.** Steal the gate policy that
already applies to any messaging surface on this Mac (Hermes gateway, Telegram
incident path, future Slack/Discord).

ECI: `counsel_clearance=false`. Not a SKU. No $499 outreach. Complementary to
PR **#2046** router-receipt — do not dual-edit `tools/router-receipt.js`.

```bash
node tools/messaging-mention-gate.js --honesty --json
node tools/messaging-mention-gate.js --gate --json \
  --channel-type direct --user-id USER --text "hello" --allowed-users USER
node tests/test-messaging-mention-gate.js
```

## Steal

1. Empty `ALLOWED_USERS` denies **all** (fail-closed). DMs from listed users always respond; channels need `@mention` unless `REQUIRE_MENTION=false` or the channel is on `FREE_RESPONSE_CHANNELS`.
2. Non-empty `allowed_channels` drops unlisted channels **before** mention gating. DMs are exempt. `group_sessions_per_user` isolates transcripts per user inside a shared channel/thread.
3. Channel prompts are ephemeral (never persisted). Slash commands: `/help` and `/whoami` floor; unset `allow_admin_from` = backward-compat unrestricted; otherwise admins vs `user_allowed_commands`.

## Skip

| Skip | Why |
|------|-----|
| aiohttp WebSocket Mattermost adapter | Nous already ships it; we do not run Mattermost |
| Mattermost Cloud / bot-account setup | No server, no token, not LIVE |
| nginx websocket reconnect | Ops theater |
| $499 ThumbGate paid-pilot | ECI pause |
| Dual-edit PR #2046 | `tools/router-receipt.js` is owned |

Hosted product stays $10 VPS chat + AHLS $149. This CLI is a policy function, not a bot.
