---
name: source-computer-use-api-key
description: >
  Resolve the missing LLM vision API key needed for Computer-Use / Browser-use
  automation against the dedicated CDP Chrome. Encodes the verified safe path,
  the local Keychains that DO NOT have the key, and the exact blocker.
safety: read-only discovery. Does NOT drive interactive Chrome, does NOT paste
  secrets into chat, does NOT store raw key values entropy.
---

# source-computer-use-api-key

## When to use

You're trying to run an agentic Computer-Use path (Browser-use v1.0,
Anthropic Computer Use, OpenAI Operator) against the local CDP bridge and
hit "missing credential". Run this before any browser-write step.

## Verified local truth (2026-08-08)

| Item | State |
|------|-------|
| Anthropic API key in Keychain | **MISSING** (no `ANTHROPIC_API_KEY` service under `iganapolsky`) |
| OpenAI API key in Keychain | **MISSING** (no `OPENAI_API_KEY`) |
| `OPENROUTER_API_KEY` in Keychain | present (NOT Claude vision) |
| Dedicated CDP Chrome :9222 | reachable, authenticated `claude.ai`/dashboard sessions visible in tab list |
| Interactive Chrome (Igor) | FORBIDDEN to drive (AGENTS.md § No desktop hijack) |

Dead-end checklist (do NOT re-run these):

- `security find-generic-password -s ANTHROPIC_API_KEY -a iganapolsky -w` → exit 44
  (item not found). "FOUND" grep matches were matching the literal error string
  `SecKeychainSearchCopyNext`, not a real item.
- Keychain dump shows only `OPENROUTER_API_KEY`, `Z_AI_API_KEY`,
  `AIR OpenAI Credentials`, `IntelliJ Platform Gemini in AndroidStudio — API Key`.
  No Anthropic / no OpenAI.
- `env ANTHROPIC_API_KEY` is empty in this shell.
- `~/.hermes/.env`, `~/.env` absent for these vars.

## The blocker (single line)

**`ANTHROPIC_API_KEY` is not available on this Mac in any safe path.** This is
the gating credential for the $499 Stripe-checkout DM automation
(`anthropic.claude-3-5-sonnet-20241022`/Computer Use beta).

## Safe resolution paths (ranked)

1. (If Igor can do it non-interactively) Add the key to Keychain service
   `ANTHROPIC_API_KEY` account `iganapolsky`, OR export into the dedicated
   browser-bridge env `~/.hermes/browser-bridge.env`. Then re-run this skill.
2. The dedicated CDP Chrome tab list shows an authenticated `claude.ai` tab.
   If that same tab can render the Claude Computer Use beta, the key is
   *browser-session-bound*, not OS-bound — but extracting a session cookie is
   not a stable non-interactive credential and is gated by Claude's ToS.
3. No automated path can bypass a missing owner credential. This is a true
   "name the missing credential path" stop, not a retry-the-same-call loop.

## Do NOT

- Drive Igor's interactive Chrome to "grab" the key (desktop hijack ban).
- Paste or log a key value returned from any source.
- Treat `OPENROUTER_API_KEY` as a substitute (wrong provider, Claude-only tools).

## Related

- Skill: `verify-computer-use-tooling` (one-shot readiness check)
- Skill: `cdp-bridge-automation` (the runtime layer that needs the above key)
- Vault evidence: `Knowledge/Sources/playwright-cdp-bridge-verified-2026-08-07.md`
