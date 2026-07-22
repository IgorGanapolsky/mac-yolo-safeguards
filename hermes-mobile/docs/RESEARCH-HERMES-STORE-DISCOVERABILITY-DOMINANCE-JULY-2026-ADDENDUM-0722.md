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
| Google **free**, `com.iganapolsky.hermesmobile` | HTTP 200, publicly live | **HTTP 404 / Console status `Unpublished`** | Public curl 404; Play Console app list `Unpublished` (app id `4973118708450369499`); Activity log: `Advanced settings → Publish status` changed by `iganapolsky@gmail.com` on Jul 22, 2026 09:28; account Policy status "No issues found" |
| Google **paid**, `com.iganapolsky.hermesmobile.paid` | HTTP 404, not public | **HTTP 200, publicly live**, title "Hermes Mobile: AI Agent", $4.99 | First `live` poll tick `hermes-mobile/docs/proofs/play-paid-review-20260722/tick-20260722T101340Z.json` at `10:13:40Z`; Console status `Production` |
| Apple, `id6786778037` | HTTP 200, v1.2, name `Hermes Mobile: AI Agent Leash`, 0 ratings | HTTP 200, **v1.3** (released `2026-07-21T18:43:44Z`), name **`Hermes AI Agent Leash`**, price **$9.99**, still 0 ratings; ASC `Ready for Distribution` build 24 with 6 screenshots + preview video live on the public product page | ASC Chrome + `apps.apple.com` HTML; Lookup API still returns empty `screenshotUrls` (API quirk — do not treat as empty gallery) |

### Root cause: free-package 404 (resolved as Unpublished, not a suspension)

Follow-up Console evidence (same session, after ASC Keychain session restore) **retracts**
the spam/repetitive-content hypothesis. The free package was set to **Unpublished** by
`iganapolsky@gmail.com` via Advanced settings → Publish status on Jul 22, 2026 09:28.
Account Policy Center reports no developer-account issues. The production release 1.2
remains Active on the track (~3 installs, 1 country) — only storefront availability was
toggled. **Do not auto-republish**; treat as an open product decision (funnel to paid vs
restore free IAP bridge). Details: `docs/STORE-ISSUES-TRIAGE-20260722.md`.

### iOS screenshots: present (Lookup API empty is a red herring)

ASC v1.3 Ready for Distribution shows frames `01_approve_67` … `06_works_67` plus an App
Preview video, and the public product page embeds those `PurpleSource*` URLs. The
iTunes Lookup API returning `screenshotUrls: []` is an API quirk — not an empty gallery.
PR #783 remains an asset-quality upgrade, not an emergency upload.

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
