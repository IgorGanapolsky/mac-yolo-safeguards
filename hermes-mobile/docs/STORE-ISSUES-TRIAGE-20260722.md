# Hermes Mobile store issues triage — 2026-07-22

Scope: catalog every open App Store / Play issue found this session with evidence, and
record what was fixed vs. what remains blocked. Companion to
[`RESEARCH-HERMES-STORE-DISCOVERABILITY-DOMINANCE-JULY-2026-ADDENDUM-0722.md`](./RESEARCH-HERMES-STORE-DISCOVERABILITY-DOMINANCE-JULY-2026-ADDENDUM-0722.md).

Multi-agent context: 5+ PRs were already open today touching this exact surface
(`#783` screenshot replacement, `#689` free/paid listing copy, `#632` iOS 1.3 ASC binary,
plus in-flight claims `T-SUBTITLE-PAID-ONCE`, `T-PLAY-PAID-DOWNLOAD`). This triage avoids
re-doing that work and instead documents gaps, root-causes the new regression, and closes
what nobody else had claimed.

## P0 — open, needs Igor awareness (not "fixed")

### 1. Free Play package `com.iganapolsky.hermesmobile` returns public HTTP 404

- **Evidence:** `curl -A Mozilla/5.0 https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile&hl=en&gl=US` → `404` (also `gl=CA/GB/DE`). Play Developer API shows production track `status: completed` (v1.2, versionCode 18) and full listing/screenshot data intact.
- **Timing:** flipped in the same window (~2026-07-22 10:13 UTC) the sibling paid package `com.iganapolsky.hermesmobile.paid` went from `in_review_public_only` to publicly live.
- **Hypothesis (unconfirmed):** Google Play repetitive-content/spam policy enforcement against two near-identical sibling listings from the same developer, triggered once both were simultaneously public.
- **Status: OPEN.** A read-only Play Console check (dashboard/policy-status/publishing-overview banners for both apps, screenshots saved) was dispatched this session. Do not resubmit, change country availability, or file an appeal until that Console evidence confirms the actual reason — guessing and acting on the guess risks making a policy strike worse.
- **Owner:** flagged in `plan.md` Decisions Log; whoever picks up `T-PLAY-PAID-REVIEW-POLL` or a new `T-PLAY-FREE-SUSPENSION` task should action once Console evidence lands.

### 2. Live iOS listing (v1.3, $9.99) has zero screenshots

- **Evidence:** `itunes.apple.com/lookup?id=6786778037` → `screenshotUrls: []`, `ipadScreenshotUrls: []`, `appletvScreenshotUrls: []` on the current public build.
- **Impact:** a paid ($9.99) app with an empty screenshot gallery is a severe, self-inflicted conversion loss independent of ranking.
- **Fix path:** the repo already has a regenerated 6-frame iPhone 6.7"/iPad 12.9" set (PR #783, today, currently `CONFLICTING` with main). Once that PR's frame content is available, upload via App Store Connect (no local ASC API issuer id — Chrome session required per `verify-app-store-publish-state` skill). This session ran the read-only ASC status check to confirm exactly what's uploaded for v1.3 today before touching anything.
- **Status:** upload not yet performed this session pending the ASC check result; do not claim "iOS screenshots fixed" until a fresh `itunes.apple.com/lookup` shows non-empty `screenshotUrls`.

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
  (shares first-frame sha256 with the free package — see P0 #1 hypothesis).
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
aligning once the P0 #1 suspension question is resolved (aligning them further right now,
mid-investigation, could complicate root-causing the near-duplicate-content hypothesis).

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
closes that gap by itself. The **immediate, controllable lever** is fixing the free-package
404 (P0 #1) and the iOS empty-screenshot gallery (P0 #2), because right now those are
actively suppressing conversion and visibility on top of the competitive gap, not because
either fix will produce a top-ranking.
