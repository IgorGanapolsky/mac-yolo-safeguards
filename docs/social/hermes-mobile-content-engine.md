# Hermes Mobile — Evidence-to-Installs Content Engine v2.0

Canonical merge of "Revenue-Focused Daily Content Engine v1" + "Evidence-to-Installs
Content Engine v1.0" (both provided by Igor 2026-07-20), reconciled against live store
evidence fetched the same day. This file is the engine; the TSV memory log lives at
`docs/social/hermes-mobile-content-log.tsv`.

## Purpose

Generate one platform-native piece of content per run that drives, in priority order:
1. Qualified store visits → installs → retained installers (Play + App Store)
2. Successful fresh-user pairing and first chat
3. Leash Pro discovery and verified purchases
4. GitHub traffic, testers, developer trust (founder's voice)
5. Newsletter/waitlist signups (owned channel — see Newsletter section)

Never optimize for post count or impressions alone. Never auto-publish: output is a
draft unless the run input says `PublishMode: PUBLISH_APPROVED` for a named platform.

## Product ground truth (verified 2026-07-20 — re-verify every run, never trust this table blindly)

| Fact | Value | Source checked |
|---|---|---|
| Store name (both stores) | **Hermes Mobile: AI Agent Leash** | Play page + iTunes lookup |
| Google Play | LIVE, **free** app + in-app "$4.99 per item", updated Jul 17 2026, downloads "1+" | https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile |
| iOS App Store | **LIVE since 2026-07-14** (v1.2, 2026-07-17), **$9.99 paid download**, 0 ratings | https://apps.apple.com/us/app/hermes-mobile-ai-agent-leash/id6786778037 (iTunes lookup by bundle id) |
| Leash Pro pricing | **Platform-split**: iOS = $19.99/mo subscription (`thumbgate_leash_monthly`); Android = **$4.99 one-time** unlock (`hermes_pro_lifetime`) | `src/constants/monetization.ts` + store pages |
| Free tier | Chat/steer/watch free; **10 routed Leash approvals per ISO week** free | `FREE_LEASH_APPROVALS_PER_WEEK` in monetization.ts |
| Traction | ~0 installs, ~0 revenue, 0 ratings | Play "1+" downloads, iTunes `userRatingCount: 0` |

Pricing rule for copy: never write a single "$19/mo" as THE price. Say "from your
phone — free chat; paid Leash unlock" and let the store page carry exact pricing, OR
state the platform-correct price only when the post targets one platform's users.

## Positioning

The phone-based control plane for developers running autonomous AI coding agents on
a computer they operate.

Simple line: **"Approve or deny your AI agent's risky commands before they run — from
your phone."**

Mechanism: any agent routed through YOUR Hermes gateway pauses on risky tool calls;
your phone shows a card with the command + risk context; you tap Approve or Deny
BEFORE it executes. Thumbs-down (ThumbGate/Leash) persists the block as a durable
rule. Chat is free; the approve/deny cards are the paid Leash tier.

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

### Hard truth guards
- ~0 installs/revenue: NEVER imply traction ("thousands of devs", "developers love").
- Sentry crash reporting ships: say "crash logs only, never sold" — NEVER "zero
  telemetry".
- Remote access needs the user's own network / Tailscale / tunnel / relay — never
  claim universal connectivity.
- Never imply affiliation with Nous Research, Anthropic, OpenAI, Google, Cursor, etc.
- Never claim ranking gains, guaranteed savings, or customer counts.
- Never ask for a positive review; ask for an honest review only after a verified
  good experience.
- Search-rank statements are dated snapshots, never permanent claims.

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

## Newsletter (owned channel — decided 2026-07-20)

Niche/reader: **developers running autonomous coding agents (Claude Code, Cursor,
Codex, self-hosted) who fear runaway loops, token burn, and destructive commands** —
the same ICP as the app and the $499/$1,500 reliability offers.
Core promise: **"One agent-safety play per issue you can ship in under 30 minutes."**
Every content-engine post's soft CTA may point at the opt-in once it exists; until
then CTA = store/GitHub only. Cadence weekly; 10 issues before judging growth.
Referral/paid layers only after open/click proof. See REVENUE-LOOP.md for the
send-gate rules (human sends; drafts only).
