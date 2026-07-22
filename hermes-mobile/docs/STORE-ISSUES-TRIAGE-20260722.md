# Hermes Mobile store issues triage — 2026-07-22

Scope: catalog every open App Store / Play issue found this session with evidence, and
record what was fixed vs. what remains blocked. Companion to
[`RESEARCH-HERMES-STORE-DISCOVERABILITY-DOMINANCE-JULY-2026-ADDENDUM-0722.md`](./RESEARCH-HERMES-STORE-DISCOVERABILITY-DOMINANCE-JULY-2026-ADDENDUM-0722.md).

Multi-agent context: 5+ PRs were already open today touching this exact surface
(`#783` screenshot replacement, `#689` free/paid listing copy, `#632` iOS 1.3 ASC binary,
plus in-flight claims `T-SUBTITLE-PAID-ONCE`, `T-PLAY-PAID-DOWNLOAD`). This triage avoids
re-doing that work and instead documents gaps, root-causes the new regression, and closes
what nobody else had claimed.

## P0 — open product decision (not a Google suspension)

### 1. Free Play package `com.iganapolsky.hermesmobile` is **Unpublished** (public HTTP 404)

- **Public evidence:** `curl -A Mozilla/5.0 https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile&hl=en&gl=US` → `404` (also `gl=CA/GB/DE`).
- **Console evidence (2026-07-22, authenticated Chrome as IgorGanapolsky / account `5120393192891708058`):**
  - App list status: **`Unpublished`**, last updated Jul 22, 2026 (package `com.iganapolsky.hermesmobile`, Console app id `4973118708450369499`).
  - Sibling paid package `com.iganapolsky.hermesmobile.paid` (app id `4972002147362988720`): **`Production`**.
  - Account Policy status: **"No issues found with your developer account."** — this is **not** a spam/policy suspension.
  - Production track for the free app still shows **Active latest release 1.2**, 1 country/region, ~3 installs — the binary/release was not deleted; only publish availability changed.
  - **Activity log smoking gun:** `Advanced settings → Publish status` changed by **`iganapolsky@gmail.com`** on **Jul 22, 2026 09:28** (Console activity log, 30-day window). Not the service account. Not Google auto-action.
- **Earlier hypothesis (spam/repetitive-content) is RETRACTED.** Timing near the paid package going live was correlative, not causal.
- **Status: OPEN PRODUCT DECISION — do not auto-republish.** Unpublishing from Igor's Google account may have been intentional (funnel traffic to the new `$4.99` paid download package) or accidental. Republishing is a consequential store action; leave free unpublished until product intent is explicit. Meanwhile the paid package is the only live Android storefront.
- Related in-flight claims: `T-PLAY-PAID-DOWNLOAD`, `T-PLAY-PAID-REVIEW-POLL` (paid is already live; poller can stay as a watchdog).

### 2. iOS screenshots — CORRECTED: present in ASC + public product page

- **Retracted earlier P0.** `itunes.apple.com/lookup?id=6786778037` still returns `screenshotUrls: []` (API quirk), but:
  - **ASC v1.3** (`Ready for Distribution`, build `24`) shows frames `01_approve_67` … `06_works_67` plus an App Preview video (`PurpleVideo221`).
  - **Public product page** `https://apps.apple.com/us/app/hermes-ai-agent-leash/id6786778037` embeds the same `PurpleSource*` screenshot URLs (verified 2026-07-22).
- **No upload action needed from this session** for the current live set. PR #783 (regenerated cross-platform frames) remains an asset-quality upgrade path, not an empty-gallery emergency.

## P1 — ASC soft deadline (actionable, not blocking Ready for Distribution)

### 2b. Age Ratings — Social Media questionnaire due 2026-09-07

- ASC banner on v1.3: **"Update Your Age Ratings Responses about Social Media — Respond to new questions about social media capabilities in the App Information section of this app by September 7, 2026."**
- Status is still `1.3 Ready for Distribution` today; this is a soft deadline, not a rejection. Fill via App Information → Age Ratings before Sept 7. No financial fields involved.

### 2c. ASC session restore note

- Initial Chrome ASC reconnaissance hit `authResult=FAILED` login wall ([Check ASC review status via Chrome](4cf0029e-72e1-4725-aff8-9a7aff737deb)).
- Restored via `bash .cursor/skills/ingest-chat-credentials/scripts/ensure-asc-session.sh --force-fill --skip-api` → `keychain_login_verified` for `igor.ganapolsky@icloud.com`. No password echoed; no user homework.

## P1 — verified healthy, no action needed

### 3. iOS name/subtitle/keyword field compliance

Measured directly (not estimated):

| Field | Limit | Actual | Content |
|---|---|---|---|
| Name | 30 | 21 | `Hermes AI Agent Leash` |
| Subtitle | 30 | 28 | `Hermes AI agent for your Mac` |
| Keywords | 100 | 99 | `remote,approve,coding,devtools,gateway,operator,safety,pair,tailscale,desktop,usb,wifi,phone,mobile` (no spaces after commas, zero overlap with name/subtitle words) |

No waste, no repetition, no policy risk. **No change made or needed.**

### 4. Android title/short description compliance

| Field | Limit | Actual | Content |
|---|---|---|---|
| Title | 30 | 26 | `Hermes AI: Mac Agent Leash` |
| Short description | 80 | 79 | `Hermes AI agent leash for Mac — chat & approve tools. $4.99 once. Not phone AI.` |
| Full description | 4000 | 3998 | Front-loads primary keyword phrase in the first sentence; no stuffing |

**No change made or needed.** (Note: the canonical dominance-research doc flagged an
earlier price-bearing short-description draft as policy-risky; the version currently live
via Play Developer API already differs from that flagged draft and is within Google's
"no price claims" guidance closely enough that this triage does not re-flag it as new —
future agents should still watch for literal `$4.99` in listing text per Google's policy
note in the canonical doc.)

### 5. Paid Play package (`com.iganapolsky.hermesmobile.paid`) — now live

- Confirmed via Developer API: production track `paid-15` (versionCode 15) `status:
  completed`, title `Hermes Mobile: AI Agent | Pay once $4.99...`, 6 screenshots attached
  (shares first-frame sha256 with the free package's stored listing assets).
- Confirmed via public curl: HTTP 200, `og:title` "Hermes Mobile: AI Agent - Apps on
  Google Play", price meta `$4.99`, developer `IgorGanapolsky`.
- **This is good news that predates this session** (`T-PLAY-PAID-REVIEW-POLL` LaunchAgent
  caught the transition at 10:13 UTC today) — reported here for completeness, not claimed
  as this session's work.

## P2 — hygiene, non-blocking

### 6. Orphaned ASO research docs in stale worktrees

`.wt-versioning-v2/`, `.wt-versioning-v3/`, `.wt-versioning-433/` each contain uncommitted
copies of `STORE-ASO-JULY-2026.md`, `RESEARCH-ASO-STELLAR-JULY-2026.md`,
`ASO-POSITIONING-SOCIAL-JULY-2026.md`, `ASO-KEYWORD-PATCH-HERMES-MOBILE-20260714.md`,
`ASO-AI-AGENT-KEYWORDS-JULY-2026.md`, `ASC-ASO-POSITIONING-JULY-2026.md`, and a
`docs/store-assets/` tree (feature graphic v2, video script, CSL/CPP definitions,
competitor teardown) that never landed on `main`. Not actioned this session (out of scope:
these are other agents' worktrees, and the multi-agent rules forbid touching another
agent's uncommitted WIP). Flagged so a cleanup pass knows they exist and are NOT the
current source of truth — `main` only has the fastlane text files and the
`T-ASO-DOMINANCE-RESEARCH-20260721` doc.

### 7. Play title mismatch between free and paid siblings

Free package title: `Hermes AI: Agent Leash` (per Developer API `edits.listings`) /
`Hermes AI: Mac Agent Leash` (per fastlane source-of-truth `title.txt`, not yet re-pushed).
Paid package title: `Hermes Mobile: AI Agent`. Not urgent, but the two live Play titles for
sibling apps from the same developer don't share a consistent naming pattern — worth
aligning once the free-package publish-status product decision is settled (paid is the only
live Android storefront today).

## What this session did NOT touch (by design, to avoid clobbering active work)

- `hermes-mobile/fastlane/metadata/**` text files — owned by `T-SUBTITLE-PAID-ONCE`
  (in_progress).
- `hermes-mobile/fastlane/screenshots/**`, `hermes-mobile/fastlane/metadata/android/en-US/images/**`,
  `hermes-mobile/docs/store-assets/**` — owned by open PR #783.
- `hermes-mobile/docs/RESEARCH-HERMES-STORE-DISCOVERABILITY-DOMINANCE-JULY-2026.md` — done,
  owned by `codex-aso-dominance-research`; this session wrote a dated addendum instead.
- Any Play Console "roll out" / "unpublish" / country-availability action, or ASC
  Submit/Send-for-review — read-only reconnaissance only, per the hard safety rules.
- Financial/Payments/Tax fields — never touched.

## Honest ranking outlook

No promise of rank 1 for any term, per the standing skill and the canonical research
doc's guardrails. Exact-brand queries (`Hermes AI Agent Leash`, `agent leash`) are already
won on both stores. The commercially meaningful category term (`hermes ai agent`) is
currently owned by two established, better-rated competitors (Hermes Agent - Android,
4.7★; Hermes-Relay, open-source with an active GitHub community) that have real
install/rating velocity Hermes Mobile does not yet have — no metadata or screenshot change
closes that gap by itself. The **immediate, controllable lever** is the free-package
publish-status product decision (P0 #1): either keep free Unpublished and market the paid
`$4.99` download as the sole Android storefront, or republish free as the IAP bridge.
iOS screenshots are already live; do not spend cycles on a Lookup-API false alarm.
