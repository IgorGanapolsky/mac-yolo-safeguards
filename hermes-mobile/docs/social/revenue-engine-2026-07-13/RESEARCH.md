# RESEARCH — Revenue Content Engine v1 — 2026-07-13

**Status:** research only · **Publish mode:** DRAFT_ONLY (never auto-publish)

## Live store facts

| Source | Finding | Evidence |
|--------|---------|----------|
| Google Play `com.iganapolsky.hermesmobile` | Live; og:title **Hermes Mobile: AI Agent Leash**; version candidate **0.3.2**; **In-app purchases** yes; ads no | `curl` Play details HTML 2026-07-13 |
| Play pricing copy | Listing body shows **LEASH PRO ($19.99/mo)** | Play HTML snippet around `$19` |
| Play rating / reviews | **Not surfaced** in scrape (early / low base) — do not invent stars or review counts | Same scrape: rating unknown |
| iTunes lookup `bundleId=com.iganapolsky.hermesmobile` | **`resultCount=0`** → **iOS not live** on App Store | `https://itunes.apple.com/lookup?bundleId=com.iganapolsky.hermesmobile` |
| Continuous E2E | `unit=pass`, **`e2e=fail`**, flows: `ship-guard.yaml`, `chat-send-persistence.yaml`; `deviceVerified: false` | `hermes-mobile/docs/proofs/continuous/latest.json` @ `2026-07-13T20:53:18Z` |

**Hard claims ban:** Do **not** say “works on device” / device-verified UX while `e2e≠pass`.

## Monetization (code-verified)

| Claim | Verified? | Artifact |
|-------|-----------|----------|
| Hermes Chat is free | **YES** | `ProUpgradeCard.tsx`: “Hermes Chat is free…” |
| Leash Pro price label `$19/mo` | **YES** | `src/constants/monetization.ts` → `THUMBGATE_PRO_PRICE_LABEL = '$19/mo'` |
| Play listing shows `$19.99/mo` | **YES** (listing copy) | Prefer “Leash Pro (~$19/mo / listing $19.99/mo)” or stick to code label `$19/mo` + note Play shows $19.99 |
| Free Leash = **10 routed approvals / ISO week** | **YES** | `FREE_LEASH_APPROVALS_PER_WEEK = 10` + `freeLeashAllowance.ts` / `thumbgateLeash.ts` |
| IAP product id | `thumbgate_leash_monthly` | `thumbgateIap.ts` |

## Telemetry honesty

| Claim | OK? |
|-------|-----|
| “Zero telemetry” | **NEVER** — `@sentry/react-native` via `src/services/telemetry.ts` (`initCrashReporting`) |
| Crash reporting for stability / not sold as a product | OK if phrased carefully |
| PostHog product events for funnel | Exists (promotion playbook) — do not claim “no analytics” |

## Competitor (one)

**Hermes-Relay** ([Codename-11/hermes-relay](https://github.com/Codename-11/hermes-relay), Play `com.axiomlabs.hermesrelay`):

- Position: Android companion for Hermes agent — chat, voice, optional **phone Device Control** (sideload APK); Play build is conservative (no Accessibility/Device Control).
- Wedge vs us: Relay emphasizes **agent ↔ phone bridge / device control**; Hermes Mobile emphasizes **operator Leash** (approve/deny blocked tool calls) + Chat against **your Hermes gateway** on Mac/Linux/Windows.
- Do not trash-talk; differentiate on job-to-be-done.

## Why now (one web angle)

**Claude Code Remote Control** (Anthropic, research preview ~Feb 2026): pick up a **local** Claude Code session from phone/browser ([official docs](https://code.claude.com/docs/en/remote-control)). Validates market: phone control of **local** agents is mainstream.

**Our wedge (vendor-neutral):** Claude Remote Control is Claude-stack + subscription-gated; Hermes Mobile is a **gateway operator client** for **any agent behind your Hermes gateway** — dedicated **Leash** approve/deny UX. **Do not claim native Cursor gating.**

## Differentiators (code-aligned phrasing)

- Phone remote for agents already on **your** machine via Hermes gateway
- Chat free; Leash free allowance 10/week then Pro
- QR / Tailscale / saved computer profiles (fresh-user onboarding) — no “works on device” claim today
- Crash logs via Sentry when DSN set — not “zero telemetry”

## Memory

- `content-engine-memory.tsv`: **missing** → treat as **no memory**
- Prior campaign hooks (week-2026-07-10*): LinkedIn launch, LinkedIn vs Replit, X Leash/couch, Dev.to QR pair, Reddit LocalLLaMA/selfhosted — avoid repeating those hooks verbatim
