# Hermes Web App + Mobile — Evidence-to-Installs Content Engine v3.0

Canonical merge of "Revenue-Focused Daily Content Engine v1" + "Evidence-to-Installs
Content Engine v1.0" (both re-supplied by Igor 2026-07-22, superseding the 2026-07-20
drafts), reconciled against live store evidence fetched the same day. v3.0 broadens
scope from mobile-only to **web app (Thumbgate.app) + Hermes Mobile + GitHub** as
co-equal targets. This file is the engine; the TSV memory log lives at
`docs/social/hermes-mobile-content-log.tsv`.

## Purpose

Generate one platform-native piece of content per run that drives, in priority order:
1. Qualified web app (Thumbgate.app) visits, installs, and retained users
2. Qualified Google Play / App Store visits → installs → retained installers
3. Successful fresh-user pairing and first chat (web or mobile)
4. Leash Pro discovery, trials, and verified purchases
5. GitHub traffic, contributors, testers, and developer trust (founder's voice)
6. Honest reviews only after a successful product experience
7. Newsletter/waitlist signups (owned channel — see Newsletter section)

Never optimize for post count, impressions, or generic engagement alone. Never
auto-publish: output is a draft unless the run input says
`PublishMode: PUBLISH_APPROVED` for a named, authenticated platform.

## Product

Web: Thumbgate.app · Play: `com.iganapolsky.hermesmobile` · GitHub:
https://github.com/IgorGanapolsky/mac-yolo-safeguards/tree/main/hermes-mobile

Positioning (broadened v3.0): Hermes Web App and Mobile is an independent web +
mobile control plane for AI agents running on a computer the user operates. Chat
with agents, monitor their real state, and — with an active Leash entitlement —
approve or deny risky commands remotely. Simple line: **"Control the AI agent on
your computer from your phone or web."** (Mobile-specific copy may still use the
narrower "approve or deny before it runs — from your phone" framing when the post
targets mobile-only readers.)

Never imply affiliation with Nous Research, Anthropic, OpenAI, Google, Cursor, or
other vendors unless current repository evidence proves it.

## Product ground truth (re-verified 2026-07-22 via live Play/iTunes fetch — re-verify every run, never trust this table blindly)

**STANDING RULE, overrides anything below that implies a free tier: Hermes Mobile
may NEVER be described as free-to-install, on any store, on any package — Android
and iOS are both paid-upfront downloads.** Igor stated this directly and emphatically
2026-07-22 ("we are not allowed to list free apps!!!! our hermes mobile app is
paid!!!!") and the free Android package was unpublished the same day to enforce it.
Reason not disclosed — treat as firm regardless.

| Fact | Value | Source checked |
|---|---|---|
| Google Play — free package | **UNPUBLISHED 2026-07-22** (`com.iganapolsky.hermesmobile`) — do not link or promote; live fetch now returns HTTP 404 | curl of the public listing URL, 2026-07-22 |
| Google Play — paid package | **LIVE**, "Hermes Mobile: AI Agent", **$4.99 paid download**, `com.iganapolsky.hermesmobile.paid` — this is the ONLY Android package to ever link | https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile.paid — HTTP 200, `$4.99` present |
| iOS App Store | **LIVE**, "Hermes AI Agent Leash", v1.3 (released 2026-07-21), **$9.99 paid download**, 0 ratings | iTunes lookup by bundle id `com.iganapolsky.hermesmobile`, 2026-07-22 |
| In-app subscriptions | **NONE** — no StoreKit/Play Billing subscription SKU ships in the app; any Leash subscription is sold web-only at thumbgate.ai | `src/constants/monetization.ts` (`THUMBGATE_WEB_SUBSCRIPTION_URL`, deprecated `THUMBGATE_PRO_PRICE_LABEL`) |
| Post-download Leash quota | `FREE_LEASH_APPROVALS_PER_WEEK = 10` routed approvals per ISO week ships in code | `src/constants/monetization.ts` — **do not call this "free tier" in copy** (conflicts with the no-free-anywhere rule); frame it only as "included with your paid download" if mentioned at all, and prefer omitting the exact number unless it's re-verified live in-app |
| Android Pro unlock price | Code constant says `$4.99 once` (`ANDROID_PRO_UNLOCK_PRICE_LABEL`) — **unresolved**: unclear whether this stacks on top of the $4.99 paid download or is the same $4.99. Do not quote a specific unlock price in copy until this is confirmed against the live in-app purchase flow. | `src/constants/monetization.ts` — flag as open question, don't guess |
| Traction | ~0 installs, ~0 revenue, 0 ratings on both stores | Play listing, iTunes `userRatingCount: 0` |

Pricing rule for copy: state only what's directly verified above. Never say "free"
in a store/download context on either platform. Say "a paid download — from $4.99"
(Android) or "a paid download — $9.99" (iOS), and let the store page carry exact
current pricing. Never mention an iOS subscription price (there isn't one in-app).

## Mechanism, pains, differentiators

(Simple line and broadened positioning now live in the Product section above.)

Mechanism: any agent routed through YOUR Hermes gateway pauses on risky tool calls;
your phone shows a card with the command + risk context; you tap Approve or Deny
BEFORE it executes. Thumbs-down (ThumbGate/Leash) persists the block as a durable
rule. **Never call chat "free" in store-facing copy** — both platforms are paid
downloads; frame it as "your paid download includes chat, steer, and watch; Leash
approve/deny cards come with it."

Pains it stops (all evidenced by public 2026 incidents — cite, don't invent):
runaway loops / silent token burn, destructive shell (`rm -rf`, force-push, prod
edits), unsupervised agents while you're away, not knowing what the agent is doing
or costing, code+keys leaving your machine, single-vendor lock-in.

Differentiators (each verified before claiming): vendor-neutral ("any agent behind
your Hermes gateway" — do NOT claim native Cursor/OpenClaw gating until reproduced);
BYO gateway + $0 local models (Ollama); approve BEFORE execution, not after-the-fact
diff review; honest self-healing connection status; no ads, no rate-us dark patterns.

## Mandatory research (every run — failures cause claim OMISSION, never guessing)

1. Play page fetch: version, rating, review count, downloads, IAP range. Recent
   reviews = validated hooks (praise) or things to address honestly (complaints).
2. iTunes lookup by bundle id `com.iganapolsky.hermesmobile`: promote iOS ONLY while
   the lookup returns a public product URL.
3. Repo: README, recent commits/release notes, `src/constants/monetization.ts`,
   `docs/proofs/continuous/latest.json` if present. A feature is claimable only if
   its code path + entitlement ship in the released app; "works on device" only if
   device E2E is green.
4. One competitor snapshot (rotate: Claude Code Remote Control [first-party, Claude-
   only, cloud bridge], Hermes-Relay/Axiom-Labs, Hermes Agent/Hen Works, Cursor
   mobile). Contrast honestly; never attack; never put competitor trademarks in
   store keywords.
5. One "why now" web search: agent runaway-cost/destruction incidents, human-in-the-
   loop discourse, agents gaining shell permissions.
6. Use live store pricing on every run — never reuse a remembered price or
   availability from a prior post or from this doc's ground-truth table below.
7. Treat any search-rank or category-rank observation as a dated snapshot for that
   query/region/day, never a universal or permanent ranking claim.

### Hard truth guards
- **Never call Hermes Mobile "free" to install/download on either store, ever** — see
  the standing no-free-anywhere rule in the ground-truth section above.
- ~0 installs/revenue: NEVER imply traction ("thousands of devs", "developers love").
- Sentry crash reporting ships: say "crash logs only, never sold" — NEVER "zero
  telemetry".
- Remote access needs the user's own network / Tailscale / tunnel / relay — never
  claim universal connectivity.
- Never imply affiliation with Nous Research, Anthropic, OpenAI, Google, Cursor, etc.
- Never claim ranking gains, guaranteed savings, or customer counts.
- Never claim "free approvals" (Leash approvals are a paid/entitled tier past the
  free weekly cap) or "keys never leave the device" (remote paths can route through
  a relay/tunnel) as unconditional facts.
- Never ask for a positive review; ask for an honest review only after a verified
  good experience.
- Search-rank statements are dated snapshots, never permanent claims.
- Publishing is claimed successful only when the resulting URL opens and shows the
  intended content; without a verified URL, report Drafted or Blocked, never Posted.

## Daily inputs (per run)

1. Date (`YYYY-MM-DD`).
2. `PublishMode`: `DRAFT_ONLY` or `PUBLISH_APPROVED`.
3. `AuthenticatedPlatforms`: comma-separated platform names actually logged in this
   run — never draft for `PUBLISH_APPROVED` on a platform not in this list.
4. `AvailableAssets`: verified screenshots, demos, videos, or `none`.
5. Memory log rows (see TSV columns below).

## Memory / dedup

Log: `docs/social/hermes-mobile-content-log.tsv`, columns
`Date Platform Persona Pain Angle Evidence Hook CTA Campaign Status PostURL Outcome`.
Within 14 days never repeat: title, hook/opening line, metaphor, CTA phrasing, post
structure, specific scenario (rm -rf vs runaway loop vs prod edit), or persona.
Memes: original or rights-safe, not reused within 30 days. Append one row per
platform per run.

## Persona rotation (pick ONE not used in 7–14 days)

1 Solo dev using coding agents · 2 Cursor power user · 3 Claude Code user · 4 Codex
user · 5 Startup CTO · 6 AI automation builder · 7 DevOps/platform eng · 8 Security
engineer · 9 Eng manager · 10 Founder building with AI agents · 11 Infra eng running
autonomous workflows

## Platform rules (rotate; one primary post per run, ≤3 adaptations)

- **LinkedIn**: founder-voice story + insight; link in FIRST COMMENT, never the body.
- **X / Bluesky / Threads**: one idea, punchy, visual proof if available; thread only
  if it earns it; no fake threads.
- **Reddit — HARDEST RULE, account history is burned** (u/eazyigz123: 3 posts removed
  in 10 days as of 2026-07-14): value/discussion ONLY in technical subs; disclose
  "I built this"; limitation-first; link only GitHub, never store/pricing/ThumbGate.ai;
  no vote/review CTA; never cross-post the same promo to multiple subs; check
  reddit.com/user/eazyigz123/submitted for removals BEFORE any post; r/hermesagent is
  permanently pricing-free and comments-first (90/10).
- **Dev.to / Hashnode / Medium**: ONE canonical article, syndicate with canonical URL
  set; value first, soft mention + link at the end.
- **Instagram**: only with a real vertical demo/carousel + alt text (approval-card
  screenshot, "your agent did WHAT at 3am" meme).

## Output per run

1. Research receipt (claim → exact source → timestamp).
2. Daily decision: persona, pain, angle, evidence, CTA, target metric — and why it's
   fresh vs the 14-day memory window.
3. Primary post ready to paste + adaptations.
4. Asset brief (dimensions, caption, alt text) when a visual is used.
5. Publish ledger: platform, Drafted/Published/Blocked/Skipped, UTC time, verified
   post URL (a post is "Published" ONLY when its URL opens and shows the content).
6. Measurement plan: post click → store visitor → installer → retained → paired →
   first chat → first approval → purchase.
7. TSV memory row(s).

ASO note: Apple's App Store and Google Play use different searchable-field and
keyword models — see [Apple search guidance](https://developer.apple.com/app-store/search/)
and [Google's custom store listings](https://support.google.com/googleplay/android-developer/answer/9867158?hl=en).
Never place competitor trademarks in either store's keyword fields.

## Newsletter (owned channel — decided 2026-07-20)

Niche/reader: **developers running autonomous coding agents (Claude Code, Cursor,
Codex, self-hosted) who fear runaway loops, token burn, and destructive commands** —
the same ICP as the app and the $499/$1,500 reliability offers.
Core promise: **"One agent-safety play per issue you can ship in under 30 minutes."**
Every content-engine post's soft CTA may point at the opt-in once it exists; until
then CTA = store/GitHub only. Cadence weekly; 10 issues before judging growth.
Referral/paid layers only after open/click proof. See REVENUE-LOOP.md for the
send-gate rules (human sends; drafts only).
