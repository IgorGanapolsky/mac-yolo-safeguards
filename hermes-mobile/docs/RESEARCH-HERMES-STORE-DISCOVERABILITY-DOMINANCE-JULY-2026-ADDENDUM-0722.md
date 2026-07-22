# Addendum (2026-07-22): Hermes Mobile Store Discoverability

This is a same-day addendum to [`RESEARCH-HERMES-STORE-DISCOVERABILITY-DOMINANCE-JULY-2026.md`](./RESEARCH-HERMES-STORE-DISCOVERABILITY-DOMINANCE-JULY-2026.md)
(captured 2026-07-21, `codex-aso-dominance-research`). That document remains the canonical
policy/SLO/roadmap reference — this addendum only updates the **listing-availability facts**
that changed in the ~15 hours since it was written, and adds a July 2026 refresh of the
supporting industry research (iOS keyword mechanics, Play ranking factors, screenshot
creative, and a direct-competitor teardown). It does not restate the canonical document's
7/30/90-day plan, SLO table, or policy guardrails, which are unchanged and still binding.

## 1. What changed since 2026-07-21

| Listing | 2026-07-21 (canonical doc) | 2026-07-22 16:20 UTC (this addendum) | Evidence |
|---|---|---|---|
| Google **free**, `com.iganapolsky.hermesmobile` | HTTP 200, publicly live | **HTTP 404** across `gl=US/CA/GB/DE`, `hl=en/en_US` | `curl -A Mozilla/5.0 https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile` → 404, re-checked 4 locales |
| Google **paid**, `com.iganapolsky.hermesmobile.paid` | HTTP 404, not public | **HTTP 200, publicly live**, title "Hermes Mobile: AI Agent", $4.99 | First `live` poll tick `hermes-mobile/docs/proofs/play-paid-review-20260722/tick-20260722T101340Z.json` at `10:13:40Z`; confirmed again at `16:18:06Z` in `play-paid-review-latest.json` |
| Apple, `id6786778037` | HTTP 200, v1.2, name `Hermes Mobile: AI Agent Leash`, 0 ratings | HTTP 200, **v1.3** (released `2026-07-21T18:43:44Z`), name **`Hermes AI Agent Leash`**, price **$9.99**, still 0 ratings, **`screenshotUrls: []`, `ipadScreenshotUrls: []`** | `itunes.apple.com/lookup?id=6786778037` |

### Root cause: free-package 404 (open, not fixed)

The free package's Play Developer API state is **unchanged and healthy** — `edits.tracks`
shows the production release (`1.2`, versionCode `18`) as `status: completed`, and
`edits.listings/en-US` plus `edits.listings/en-US/phoneScreenshots` return full title,
description, and 6 screenshot objects (sha256 intact). This rules out data loss, a failed
publish, or an empty edit. The break is specifically in **public storefront visibility**.

The two packages are near-identical siblings from the same developer (shared first-frame
screenshot sha256 `05907aa5859c46ca...`, overlapping description skeleton, same icon
family) and the paid package crossed from "in review" to "publicly live" in the exact
window the free package went dark. This is the observable signature of Google Play's
repetitive-content / spam-policy enforcement against near-duplicate listings — Play
Console policy pages are the only authoritative confirmation, and that check was
dispatched read-only in this session (see `docs/STORE-ISSUES-TRIAGE-20260722.md` for the
outcome). **Do not treat this as resolved, and do not resubmit/edit-availability/appeal
before Console evidence confirms the actual reason** — an unconfirmed guess is not a fix.

### iOS: zero screenshots on a live, paid, $9.99 listing

The public `screenshotUrls` array for the current v1.3 build is empty for iPhone, iPad,
and Apple TV. A $9.99 paid download with no screenshots on its product page is a severe,
self-inflicted conversion loss, independent of ranking — most users will not purchase a
paid app with an empty gallery. This is closeable: the repository already carries a
generated 6-frame iPhone 6.7" + iPad 12.9" set at `fastlane/screenshots/en-US/` (refreshed
today by PR #783, still `CONFLICTING`), which only needs an ASC upload once the frame
content lands on `main`.

## 2. Updated SERP baseline (2026-07-22, signed-out, US)

Method matches the canonical doc: Google Play web search HTML (`hl=en`, `gl=US`), unique
package occurrence; Apple iTunes Search API (`country=us`, `entity=software`).

| Query | Google Play top result(s) | Hermes Mobile position |
|---|---|---|
| `hermes ai agent` | `com.hermesagent.android` (Hermes Agent - Android, 4.7★) #1, `com.axiomlabs.hermesrelay` (Hermes-Relay) #2 | Not in top 10 (neither free nor paid package) |
| `hermes mobile` | `com.hermesagent.android` #1, `com.retroguru.hermes` #2 | `com.iganapolsky.hermesmobile.paid` **#5** |
| `hermes leash` | `com.axiomlabs.hermesrelay` #1 | Not in top 10 |
| `ai agent remote control` | generic remote-desktop + AI-agent apps, no Hermes competitor overlap | Not in top 10 |

| Query (iOS) | Top result | Hermes Mobile position |
|---|---|---|
| `Hermes AI Agent Leash` (exact name) | Hermes AI Agent Leash | **#1** |
| `agent leash` | Hermes AI Agent Leash | **#1** |
| `hermes ai agent` | `io.yoclaw` "Hermes AI: Personal Agent" | Hermes AI Agent Leash present, rank ~6 |
| `hermes mobile` | `ch.dataphone.Hermes` "Hermes Mobile" (unrelated app, exact title match) | Not observed in first 5 |

Consistent with the canonical doc's conclusion: **exact-brand rank is already won; the
category term `hermes ai agent` is owned by two direct, better-established competitors**
(Hermes Agent - Android at 4.7★ with an active update cadence, and open-source
Hermes-Relay). Neither Hermes Mobile package will out-rank them on copy alone — they have
real install/rating velocity Hermes Mobile does not yet have.

## 3. Direct competitor teardown (new)

| Competitor | Package | Positioning | Signal |
|---|---|---|---|
| **Hermes Agent - Android** | `com.hermesagent.android` | On-device terminal + multi-provider (OpenAI/Anthropic/Gemini/OpenRouter/local LiteRT) agent runner, Telegram/Slack/Discord gateways, "Hermes Pro" one-time ad-removal IAP | 4.7★, active changelog (v2.2 "Chat Skin" shipped recently), broad feature surface — closest true rival |
| **Hermes-Relay** | `com.axiomlabs.hermesrelay` | Open-source (GitHub `Codename-11/hermes-relay`) native Android client for a self-hosted Hermes Agent (Nous Research project); Play build is chat/voice/dashboard only, phone-control features require GitHub sideload | Strong open-source trust signal, CLI companion, roams via Tailscale/public URL — same "your own machine, phone in your pocket" pitch as Hermes Mobile |
| **Hermes Agent Client - OnDev AI** | `hermes.agent.mobile` | Mobile-first AI coding workspace, file access, task/skill management | Smaller, early-stage; less differentiated |
| **ClawControl / ClawPilot / muxd family** (iOS) | various `me.clawpilot.*`, `com.rethinkingstudio.ClawControl` | Remote AI-agent control clones proliferating on iOS around "OpenClaw"/agent-control naming | Crowded, low-differentiation cluster — Hermes Mobile's "approve/deny risky commands" (Leash) safety framing is not directly copied by any of these yet |

**Differentiation Hermes Mobile actually owns and should keep leaning on in creative:**
approve/deny gating before execution (no competitor above frames this as a safety
product), and explicit multi-OS (Mac/Linux/Windows) rather than Android-only or
on-device-model framing.

## 4. July 2026 ASO mechanics refresh (confirms canonical doc; adds detail)

- **iOS keyword field (100 chars):** comma-separated, no spaces after commas, never repeat
  a word already in name/subtitle (Apple auto-combines name+subtitle+keywords into
  phrases), prefer singular nouns, skip stopwords/"app"/plurals unless the plural has
  materially different Apple Ads popularity. Late-2025 Apple tightened auto-extraction of
  title/subtitle variants, so keyword-field coverage now matters more than it did in 2024.
  **Current live keyword field is 99/100 chars with zero name/subtitle overlap — already
  compliant with 2026 best practice; no waste found.**
- **Play title/short/full (2026):** Google's ranking model is semantic/ML-based, not
  density-based. Title carries the heaviest weight; short description is second and is
  itself indexed; full description is indexed but keyword-stuffing above ~2–3% density on
  a single phrase risks *suppression*, not a boost. Front-load the first 250–300 characters
  of the full description with the primary keyword phrase used naturally once, not
  repeated mechanically. **Current full description opens with "Hermes AI Agent Leash
  (Hermes Mobile) is the Hermes AI agent leash for your own Mac, Linux, or Windows
  computer" — front-loaded correctly, no stuffing risk.**
- **Screenshot creondiv (2026):** Apple now renders the first three screenshots inline on
  the search-result card; ~80% of the install decision happens in frames 1–3, and ~17% of
  visitors ever scroll past frame 1. First frame needs a 3–5 word benefit headline over
  real UI (a bare UI screenshot loses ~9 of 10 A/B tests to a labeled one). This matches
  PR #783's storyboard order (connect → control → approve as frames 1–3) and its ban on
  a bare "Pay once" price-led hero frame.
- **Preview video / feature graphic (2026):** Apple/Google both require preview
  videos to show real captured device footage, not AI-generated UI — AI tools (Higgsfield
  Marketing Studio and similar) are legitimate for the **feature graphic backdrop, social
  cuts, and spokesperson-style ad variants**, never for fabricating in-app screens. This
  matches the existing skill guidance and was not violated by any asset reviewed this
  session.

## 5. Sources

- AppDrift, Appalize, AppFollow, ASOtext, Sentarys — iOS keyword field mechanics, 2026.
- Vmobify, AppFollow, ASOMobile, AppDrift, PlayAudit — Google Play ranking factors, 2026.
- AppScreenshotStudio, ScreenFast (×2), Screenhance, AppScreens — screenshot conversion data, 2026.
- AppLaunchFlow, TheAppLaunchpad, LaunchShots, Apple Developer (App Previews), Higgsfield — preview video / feature graphic guidance, 2026.
- Google Play + Apple iTunes Search/Lookup APIs, signed-out, captured 2026-07-22 (this session).
- `hermes-mobile/docs/proofs/play-paid-review-20260722*` poll ticks (this repo).
