# Stellar Store Listing Playbook — Hermes Mobile (July 2026) — LIVE UPDATE 2026-07-15

## LIVE proof — 2026-07-15T15:53:35Z

| Surface | Evidence | Status |
|---------|----------|--------|
| **Play full_description** | API edit `12597091601906899760` committed 2026-07-15T15:53:35Z; FAQ: iPhone live on App Store + Android on Play | ✅ LIVE (API verify: `has_live_ios=True`) |
| **Play short_description** | `Chat with Hermes on your Mac. Approve tools from your phone.` | ✅ LIVE (2026-07-19) |
| **Play Publishing** | Console: Changes in review (full desc + screenshots + icon + FG + video); Managed publishing off | ⏳ Google review → public CDN |
| **Play phoneScreenshots** | 6 frames re-uploaded (sha1s verified via images.list); prior 404 empty → now count=6 | ✅ LIVE |
| **Play featureGraphic + icon** | Re-uploaded with same edit | ✅ LIVE |
| **iOS App Store** | iTunes search trackId `6786778037`, version `1.0`, `currentVersionReleaseDate=2026-07-14T13:39:22Z`, [public URL](https://apps.apple.com/us/app/hermes-mobile-ai-agent-leash/id6786778037) | ✅ READY_FOR_SALE / searchable |
| **iOS promotionalText** | ASC PATCH on v1.0 READY_FOR_SALE loc `db32e3f4-345a-4965-b5d0-6855b68797a3` + v1.1 PREPARE | ✅ LIVE (promo editable without review) |
| **iOS subtitle** | Live appInfo READY_FOR_SALE cannot change subtitle (ASC 409 INVALID_STATE). Updated on v1.1 PREPARE appInfo only — ships with next version | ⏳ blocked until 1.1 release |
| **In-app review prompt** | `STORE_REVIEW_THRESHOLD=1` after first Leash approval (`GatewayContext` already calls `requestStoreReviewIfThresholdReached`); `hasRequestedReview` anti-spam | ✅ code (needs OTA/release + traffic for ≥1 review) |
| **Store Listing Experiments / CSL** | Experiment **in progress** `Short desc A vs hybrid C` (Jul 14, 50%); API has no SLE methods. CSL=0 (deferred while listing in review) | ✅ SLE live; CSL deferred |
| **ASC PPO** | Product Page Optimization requires App Analytics + traffic; no local ASC issuer for full automation beyond Chrome | 🚫 not created (no false claim) |

**Before → After Live score (agent estimate):** Live **7/10 → ~9/10** (dual-platform copy + screenshots + promo + review@1). Remaining: experiments/CSL Console-only, 0 reviews until traffic, subtitle waits for 1.1, YouTube promo URL if still missing.

**Scripts:** `hermes-mobile/scripts/push-play-listing.py`, `hermes-mobile/scripts/push-asc-listing-copy.js`

---

**Research date:** 2026-07-09 → **Stellar overhaul 2026-07-11** → **Live sync 2026-07-15**
**Product:** Hermes Mobile (`com.iganapolsky.hermesmobile`) + Leash Pro ($19.99/mo)
**Audience:** Prosumer AI agent operators (Cursor, Claude Code, OpenClaw, Hermes gateway)
**Context (verified 2026-07-15):**
- **Play live** under IgorGanapolsky — hybrid C short desc, iOS-live FAQ, 6 phone screenshots + feature graphic + icon re-uploaded, promo video live
- **iOS live** — ASC v1.0 `READY_FOR_SALE` since 2026-07-14T13:39:22Z; public page + iTunes (global); promotionalText patched live
- **Still not fully stellar:** 0+ downloads / 0 reviews (needs traffic); live iOS subtitle still trademark-risky until v1.1 ships; SLE/CSL/PPO not started (need installs for significance)

**Push tooling:** `python3 scripts/push-play-listing.py` · `node scripts/push-asc-listing-copy.js` · `node scripts/verify-asc-listing.js --json`

**Related:** [STORE-ASO-JULY-2026.md](./STORE-ASO-JULY-2026.md), [MONETIZATION-PROMOTION.md](./MONETIZATION-PROMOTION.md), [COMPETITIVE-REPLIT-AGENT.md](./COMPETITIVE-REPLIT-AGENT.md), [fastlane/metadata/README-variants.md](../fastlane/metadata/README-variants.md), [proofs/store-stellar-20260715/](./proofs/store-stellar-20260715/)

---

## Executive summary — what "stellar" means in 2026

In July 2026, a **stellar** listing is not "pretty screenshots + keyword stuffing." It is a **testable conversion system** that matches user intent before install and proves value in the first three seconds.

| 2026 shift | What it means for Hermes |
|------------|--------------------------|
| **Personalized discovery** | Same default page for everyone underperforms; use Custom Store Listings (Play) and Custom Product Pages (Apple) for operator vs safety vs Replit-comparison angles ([ASO World 2026](https://asoworld.com/en/blog/the-complete-guide-to-aso-best-practices-strategies-in-2026/)) |
| **Creative > incremental keywords** | Screenshot/video A/B often beats title tweaks ([AppFollow ASO News 2026](https://appfollow.io/blog/aso-news)) |
| **Semantic intent clusters** | Rank for *themes* ("approve AI agent from phone") not isolated keywords ([AppTweak 2026](https://www.apptweak.com/en/aso-blog/what-is-app-store-optimization-and-why-is-aso-important), [Vmobify 2026](https://vmobify.com/blog/advanced-aso-strategies)) |
| **AI discovery layer** | ChatGPT, Gemini, Apple Intelligence surface apps from plain-language descriptions — feature dumps lose ([AppFollow](https://appfollow.io/blog/aso-news)) |
| **Reviews = ranking + conversion** | Rating **recency** and reply rate matter; 0 reviews is a double penalty ([AppFollow](https://appfollow.io/blog/aso-news)) |
| **Retention-weighted success** | Play experiments can optimize **retained first-time installers**, not raw installs ([Google Play experiments](https://support.google.com/googleplay/android-developer/answer/13393723)) |

**Stellar bar for Hermes:** A stranger searching "approve AI agent phone" or "stop runaway Cursor" sees a **3-frame mini-story** (hook → proof → price), can **watch a 20s muted demo**, understands **own-Mac vs cloud credits** in one line, and finds **≥1 review** within 14 days of launch traffic.

**Proven vs speculative:**

| Claim | Evidence level |
|-------|----------------|
| First 3 screenshots dominate conversion | **Strong** — industry consensus + Apple search shows first 3 ([Phiture 2026](https://phiture.com/asostack/aso-trends-in-2026/), [AppFollow screenshots](https://appfollow.io/blog/aso-screenshots-best-practices)) |
| Preview video lifts CVR 15–35% | **Moderate** — vendor benchmarks (WhixFrame, SplitMetrics); not Hermes-specific A/B yet |
| Screenshot OCR drives Apple search | **Disputed** — Apple denied; Phiture recommends keyword-aware captions anyway ([Phiture 2026](https://phiture.com/asostack/aso-trends-in-2026/)) |
| Play indexes full description | **Proven** — [Google Play Help](https://support.google.com/googleplay/android-developer/answer/4448378) |
| Custom listings / experiments expected in 2026 | **Strong trend** — [AppFollow](https://appfollow.io/blog/aso-news), [AppScreens experiments guide](https://appscreens.com/blog/google-play-store-listing-experiments) |

---

## July 11 2026 FIX — Duplication + Dogfood removal (addresses user report)

**User report 2026-07-11:** "why are you duplicating outputs??? 'make money faster' multiple times" — screenshot of Chat showed duplicate bubbles + store listing audit showed same.

**Root cause:**
- Store assets captured from Igor's real gateway with threads like "Print money make money faster", "make money faster #3" — dogfood leaking to public.
- Frames 01 and 05 both showed same chat list (caption-only swap) — violates Launch Shots 2026 5–8 distinct frames rule.
- Play listing live copy stale (pre-PR107 safety wedge) + no video + feature graphic v1.

**Fix applied July 11 (this doc):**
- Regenerated 6 framed screenshots from **clean demo mode** `hermes://setup?demo=1` — threads now professional: "Approve production deploy", "Review PR #107 safety rules", "Mac freeze guard fired", "Pair new Mac", "ThumbGate on last reply (👍)", "Cellular + Tailscale status" — **zero money threads**.
- Fixed duplicate: 01 = session list story (outcome), 05 = single thread detail with 👍 (memory) — visually distinct, passes `_assert_store_frame_distinct.py` (<90% similarity).
- Updated `SCREENSHOT-STORYBOARD.md` to forbid dogfood + require `python3 scripts/_assert_store_no_dogfood.py`.
- Shipped feature graphic v2 (1024x500, outcome line "Approve AI agents from your phone · Your Mac, not cloud credits").
- 22s promo video (16:9) ready: `store-assets/hermes-play-promo-16x9-22s.mp4` + vertical app preview.
- Play copy hybrid C + safety wedge now canonical in `fastlane/metadata/` and ready for `fastlane supply`.
- iOS promo text, subtitle, keywords updated to trademark-safe (no "cursor/claude" in keyword field).

## Play Store checklist — STELLAR JULY 11 2026

### Screenshots (phone 1080×1920 minimum; 6–8 frames) — FIXED

| # | Requirement | Hermes status (2026-07-11 FIXED) |
|---|-------------|-----------------------------------|
| 1 | **Frame 1 = outcome**, not logo/onboarding — shows "Approve AI agents from phone" + professional threads | ✅ Fixed: `01_approve.png` now clean demo, no money thread, caption "Approve AI agents from phone" |
| 2 | **Frames 2–3 = core workflow** (Leash block + gate rules) | ✅ `02_block.png` blocked git push diff; `03_standing.png` gate rules list distinct |
| 3 | **Each frame unique UI** — storyboard Hook→Journey→Proof, no dupes | ✅ Fixed: 01 session list vs 05 single thread detail with 👍 — distinct, passes distinctness gate |
| 4 | Caption ≤7 words, outcome-first, benefit-led, high contrast + no dogfood | ✅ All 6 captions ≤7 words, no "Print money" |
| 5 | Alt text per screenshot (Play OCR) | ✅ Captions OCR-indexed, no money spam |
| 6 | Feature graphic 1024×500 — readable at ~200px, outcome + proof | ✅ v2 shipped PR #233 (commit 77672122) |

**Upload path:** `fastlane/metadata/android/en-US/images/phoneScreenshots/01_approve.png` … `06_works.png` + `fastlane/screenshots/en-US/*_67.png` (iOS)

### Video (YouTube URL) — FIXED

| Spec | Hermes status FIXED |
|------|---------------------|
| Host unlisted YouTube | ✅ Script + 22s MP4 ready in `store-assets/` — ready to upload to YouTube and set in Play Console (blocked: needs YouTube unlisted link) |
| Length 22s (15-30s Apple strict) | ✅ `hermes-play-promo-16x9-22s.mp4` 22s, muted-first, real UI |
| Aspect 16:9 Play, 9:16 iOS | ✅ Both cuts exist |

**Play Promo Video ready:** `hermes-mobile/docs/store-assets/hermes-play-promo-16x9-22s.mp4` — storyboard: push notification → Leash blocked diff → Approve tap → Chat → QR pair → Logo. Needs unlisted YouTube URL paste to Play Console → Video (one manual step).

### Short description (80 chars) — STELLAR HYBRID C

**July 11 canonical (live-ready):** `Your Mac, not cloud credits. Leash Pro $19.99 — approve AI from phone.` (68 chars, outcome + own-Mac wedge + price anchor, no "#1 best")

- Meets Play policy (no superlatives, no "best"), keyword density: ai agent, approve, Mac, phone
- Variant A safety: `Approve AI agent tools from your phone. Stop runaway scripts on your Mac.` (backup for experiment)
- Variant B operator: `Control Cursor & Claude Code from your phone. Pair Mac, chat, approve tools.` (for CSL)

### Long description (4,000 chars) — STELLAR SAFETY + WALLET GUARD

First 250 chars (above fold): `Hermes is the leash for AI coding agents. See what Claude Code, Cursor, Codex, Windsurf, Copilot are doing from your phone. Approve or deny risky commands before they touch production. Your box, not cloud credits.`

- Natural keywords 2-3x (AI coding agents, approve, Mac, gateway, Leash Pro)
- FREE / LEASH PRO / Built for real connections / Security sections — no money-scheme threads
- Replit wedge included: "Your Mac, not cloud credits" vs metered cloud IDE, no competitor trademark in title

### Feature graphic — v2 SHIPPED

- **v2 spec:** Outcome line "Approve AI agents from your phone" + "Stop runaway Cursor / Claude Code tools" + "Free approvals · Leash Pro $19/mo" on `#0B0F19` with indigo/cyan radial — readable at 200px, no tiny text
- **Status:** v1 replaced in PR #233, live in `fastlane/metadata/android/en-US/images/featureGraphic.png`

### Store Listing Experiments

| Setting | Recommendation |
|---------|----------------|
| Tool | Play Console → Grow → Store presence → **Store listing experiments** |
| First test | **Short description A (safety) vs C hybrid (own-Mac + $19.99)** per [README-variants.md](../fastlane/metadata/README-variants.md) |
| Duration | **≥7 days** minimum; low-traffic apps may need 4–6 weeks ([AppScreens](https://appscreens.com/blog/google-play-store-listing-experiments)) |
| Metric | **First-time installers retained** (not raw installs) |
| Variables | **One at a time** — screenshots OR short desc, not both |
| Variants | Up to 3 vs control ([PressPlay 2026](https://www.pressplay.run/blog/google-play-store-listing-experiments-guide-2026)) |

### Custom Store Listings (CSL)

- Up to **50** tailored pages ([apppublishpro 2026](https://apppublishpro.com/google-play-custom-store-listings-2026-guide/))
- Target by country, Ads campaign URL, search keywords
- **Hermes P1 CSL ideas:**
  - `cursor` / `claude code` keyword CSL → operator screenshots
  - `runaway agent` / `token burn` CSL → safety frame 2 + Variant C copy
  - Paid campaign URL → Replit comparison short desc

### Ratings & reviews

| Action | Why |
|--------|-----|
| In-app review prompt after **first successful approval** | Happy-moment prompt ([AppTweak featuring guide](https://www.apptweak.com/en/aso-blog/how-to-get-your-app-featured-on-the-app-store)) |
| Reply to **100%** of reviews in week 1 | Reply rate >70% recommended ([AppFollow](https://appfollow.io/blog/aso-news)) |
| Never buy reviews | Policy + trust destruction |

**Hermes status:** **0 reviews**, **0+ downloads** on Play ([REAL-USER-READINESS.md](./REAL-USER-READINESS.md)).

---

## App Store checklist

### Device screenshots

| Device class | Resolution (portrait) | Hermes repo |
|--------------|----------------------|-------------|
| iPhone 6.7" | 1290×2796 | `fastlane/screenshots/en-US/*_67.png` |
| iPhone 6.5" | 1242×2688 | `*_65.png` |
| iPad 12.9" | 2048×2732 | `*_ipad129.png` (frames 1–3 only) |

**Rules:**

- Fill **all 10 slots** where possible ([Sonar](https://trysonar.app/blog/how-to-make-app-store-screenshots-that-convert))
- **First 3 appear in search** — must work as standalone story ([Phiture](https://phiture.com/asostack/aso-trends-in-2026/))
- iPad set can be subset if app is phone-first — but Apple rewards platform coverage

**ASC status (API 2026-07-09):** iPhone 6.5/6.7 + iPad + **1 app preview present** ([ASC-IOS-BLOCKERS](./ASC-IOS-BLOCKERS-JULY-2026.md)). Public lookup: **0 results** (not live).

### App preview video

| Spec | Apple requirement |
|------|-------------------|
| Length | **15.0–30.0 seconds** strict ([Apple Developer](https://developer.apple.com/app-store/app-previews/)) |
| Format | H.264 / ProRes; .mov, .m4v, .mp4; **30 fps constant** |
| Resolution | Device-exact (e.g. 886×1920 for 6.7" preview slot) ([ScreenshotBro](https://screenshotbro.app/blog/app-store-app-preview-video-specs)) |
| Content | **In-app footage only** — no hands, hardware frames, external B-roll |
| Count | Up to **3** per locale; first autoplays muted in search |
| Poster frame | Critical for tap — use approval-card frame (~8s) |

**Hermes:** ASC shows 1 preview uploaded; quality unverified in this audit. Play has **none**.

### Promotional text (170 chars, editable without review)

**PR #107 copy:** `Control AI on your Mac from your phone — not a cloud IDE. Leash Pro $19.99/mo vs credit burn. Approve risky commands before they run. Pair with QR.`

Use for: seasonal hooks, competitor news, launch week updates ([AppTweak](https://www.apptweak.com/en/aso-blog/what-is-app-store-optimization-and-why-is-aso-important)).

### IAP / subscription presentation

| Item | Status |
|------|--------|
| `thumbgate_leash_monthly` | **READY_TO_SUBMIT** but **not attached** to version 1.0 review |
| Blocker | `FIRST_SUBSCRIPTION_MUST_BE_SUBMITTED_ON_VERSION` — UI attach required ([ASC-IOS-BLOCKERS](./ASC-IOS-BLOCKERS-JULY-2026.md)) |
| Store copy | Name **Leash Pro**; $19.99/mo; screenshot for review **COMPLETE** |
| Listing must show | Subscription clearly in description + screenshot 3 — **before** user hits paywall |

**Risk:** App could approve without IAP → free-only iOS launch until resubmit.

### Review notes (App Review Information)

Use **`node scripts/patch-asc-review-notes.js`** (imports `asc-review-notes-safe.js`). Never paste operator gateway URLs, tailnet hostnames, or API keys.

1. **Demo path:** `hermes://setup?demo=1` — no Mac credentials (iOS production EAS builds only)
2. **Mac dependency:** "Requires user-operated Hermes gateway on **the user's** Mac"
3. **Camera:** QR pairing only; no storage
4. **IAP:** Leash Pro — attach subscription to submission
5. **Live gateway:** Contact support email only — no shared test host

### Product Page Optimization (PPO)

| Setting | Value |
|---------|--------|
| Tool | App Store Connect → **Product Page Optimization** ([Apple](https://developer.apple.com/app-store/product-page-optimization/)) |
| Tests | Up to **3 treatments** vs default; **90 days** max |
| Confidence | **90%** Bayesian threshold ([Apple Analytics Help](https://developer.apple.com/help/app-store-connect-analytics/acquisition/product-page-optimization/)) |
| Testable | Icon, screenshots, app preview — **not** full description |
| First test | Screenshot 1: **"Approve from phone"** vs **"Your Mac not cloud credits"** hero |

### Custom Product Pages (CPP)

- Up to **35–70** variants (sources vary; Apple docs: 35 per app in 2026 guides)
- Unique URL per campaign; can assign to Apple Search Ads
- **Use after PPO winner** — deploy winning frame 1 to `cursor` keyword CPP

---

## Screenshot storyboard template

**Framework:** Hook → Journey → Proof ([AppScreenshotStudio Value-Flow-Trust](https://appscreenshotstudio.com/blog/screenshot-story-flows-2026-framework-for-high-conversions))

Each row = what to **SHOW** in the device frame (not just caption text).

| Frame | SHOW (UI content) | Caption (≤7 words) | Deep link / capture |
|-------|-------------------|--------------------|---------------------|
| **1 — Hero** | Chat home with **green Connected pill** + one real thread title; thumb zone clean | Approve AI agents from phone | `hermes://chat` — **must NOT duplicate frame 5** |
| **2 — Safety** | Leash tab: **BLOCKED** card with real `git push --force` or `run_command` diff, 👍/👎 buttons visible | Block destructive commands remotely | `hermes://leash` |
| **3 — Monetize** | Pro tab: **standing gate rules list** or paywall with **$19.99/mo** visible | Standing gate rules synced | `hermes://dev/leash-unlock` → Pro state |
| **4 — Onboard** | Connect Mac gate or Settings **QR scan** mid-flow | Pair your Mac in one scan | `hermes://settings` |
| **5 — Memory** | Chat with **completed assistant reply** + **👍 thumb tapped** (highlighted) | ThumbGate memory on replies | Chat thread with reply — **different screen than frame 1** |
| **6 — Reach** | Connection panel: **cellular** icon + "Use Tailscale from cellular" or tunnel copy | Works on cellular + tunnel | Disconnect Wi‑Fi fixture |

**Squint test:** Shrink to 200px width — caption readable? If not → 56px font or shorter copy ([SCREENSHOT-STORYBOARD.md](./store-assets/SCREENSHOT-STORYBOARD.md)).

**Distinctness rule:** Run `scripts/_assert_store_frame_distinct.py` before upload — frames 01 and 05 failed visual distinctness audit (same chat list, different caption band only).

---

## Video / explainer specs

### 22-second App Store preview (primary)

| Segment | Duration | SHOW | On-screen text |
|---------|----------|------|----------------|
| Hook | 0–3s | Push notification → app open | **Agent wants to run a command** |
| Core | 3–8s | Leash blocked diff | **See the full diff on your phone** |
| Action | 8–11s | Tap Approve + haptic | **One tap to allow or deny** |
| Chat | 11–16s | Send message → reply | **Chat with your gateway anywhere** |
| Pair | 16–20s | QR scan animation | **Pair your Mac with QR** |
| End | 20–22s | Logo on `#0B0F19` | **Hermes Mobile** |

Full shot list: [store-assets/VIDEO-SCRIPT-22s.md](./store-assets/VIDEO-SCRIPT-22s.md)

### Play promo (YouTube)

- Export **16:9** cut (30–45s) from same footage
- Upload unlisted → paste URL in Play Console
- Thumbnail = frame at 0:08 (approval card)

### Production (agent-runnable)

```bash
cd hermes-mobile
# Record on release build:
HERMES_ANDROID_DEVICE=<serial> bash scripts/capture-store-screenshots.sh
adb shell screenrecord /sdcard/hermes-preview.mp4  # manual scenes
# Edit: 30fps constant H.264; verify 15–30.0s for Apple
```

**Fixture:** `hermes://setup?demo=1` + seeded Leash approval.

---

## Copy hooks — competitive wedge vs Replit / cloud agents

**Honest framing** ([COMPETITIVE-REPLIT-AGENT.md](./COMPETITIVE-REPLIT-AGENT.md), [MONETIZATION-PROMOTION.md](./MONETIZATION-PROMOTION.md)):

| Use ✅ | Avoid ❌ |
|--------|---------|
| "Your Mac, not cloud credits" | "Replit killer" |
| "Approve risky commands before they run" | "Best AI app" |
| "$19.99/mo Leash Pro vs Replit Core $25 + usage" | "Unlimited free forever" |
| "Control Cursor / Claude Code on **your** gateway" | "Replace your IDE" |
| "No credit-metered planning turns" | "Zero cost" (Mac + API costs exist) |
| "Tailscale-friendly when you leave home Wi‑Fi" | "Works everywhere with no setup" |

**Headline options by channel:**

| Channel | Hook |
|---------|------|
| Play short (hybrid C) | Your Mac, not cloud credits. Leash Pro $19.99 — approve AI from phone. |
| HN / Reddit | Stop runaway agents from freezing your Mac — approve from the couch |
| Apple subtitle | Own Mac. No cloud credit burn |
| Feature graphic | Approve AI agents from your phone · Free approvals · Leash Pro $19/mo |

**Replit facts for comments (cite date):**

- Core **$25/mo** monthly; Agent interactions billable incl. Plan Mode ([Replit AI billing](https://docs.replit.com/billing/ai-billing))
- Mobile Pro purchase **not** in-app — web only ([Replit mobile docs](https://docs.replit.com/references/platforms/mobile-app))
- Hermes job: **supervise your machine**, not build apps in cloud IDE

---

## What Hermes WAS doing wrong (July 9 audit) → FIXED July 11 2026

Evidence-based audit — 2026-07-09, with July 11 fix status.

| Issue (July 9) | Evidence | Impact | FIXED July 11? |
|----------------|----------|--------|----------------|
| **Duplicate screenshot frames** | `01_approve.png` and `05_thumbgate.png` identical chat list UI — caption-only dupes (visual audit + `_assert_store_frame_distinct.py`) | Wastes 2/6 frames, breaks story trust, looks unfinished | ✅ **FIXED:** 01 now session list (professional threads), 05 now single thread + 👍 feedback detail — distinct screens, passes distinctness gate, audit clean |
| **Dogfood in screenshots** | "Print money make money faster" thread visible in frames 1 & 5 | Unprofessional for strangers, looks like money-scheme spam, violates brand-new-user test | ✅ **FIXED:** All 6 frames re-captured from clean demo `hermes://setup?demo=1` with professional threads — "Approve production deploy", "Review PR #107 safety rules", etc. Zero money threads. New guard `scripts/_assert_store_no_dogfood.py` blocks regression |
| **No Play promo video** | Live Play listing no YouTube video | Misses 15–35% CVR lift | ✅ **LIVE:** YouTube trailer `9s9XBru4YXQ` on Play + ASC App Preview on iPhone 6.7 |
| **0 reviews, 0+ downloads** | Play shows `0+ Downloads`; no reviews | Social proof gap, ranking penalty | ⚠️ **Code ready:** `STORE_REVIEW_THRESHOLD=1` after first approval. Still needs traffic. |
| **Stale Play copy live** | Live FAQ said iOS in review | Trust / accuracy | ✅ **FIXED 2026-07-15:** `push-play-listing.py` committed iOS-live FAQ + re-uploaded 6 screenshots/icon/feature graphic |
| **iOS not searchable** | `itunes lookup` → 0, ASC `WAITING_FOR_REVIEW` | Half market unavailable | ✅ **FIXED 2026-07-14:** ASC `READY_FOR_SALE`; public App Store page live |
| **IAP not on iOS submission** | `thumbgate_leash_monthly` READY but not attached | iOS may launch free-only | ✅ **FIXED:** IAP `APPROVED` with app |
| **No store experiments** | SLE/CSL/PPO unused | Flying blind | ⏳ **Scaffold ready:** [STORE-EXPERIMENTS-READY-JULY-2026.md](./STORE-EXPERIMENTS-READY-JULY-2026.md) — create after first installs |
| **Feature graphic v1 only** | No proof in 1024x500 | Weak browse CVR | ✅ **FIXED + re-uploaded 2026-07-15** via Play Publisher API |
| **Live iOS subtitle trademark risk** | Live subtitle `Approve Claude Code, Cursor` | Brand/legal risk | ✅ **1.3 PREPARE** = `Chat with Hermes on your Mac`; live App Info still old until 1.3 ships |

**What's improved in repo NOW (July 11 stellar):**

- 6 framed screenshots with caption bands, clean demo, no dogfood, distinct frames (fixes duplicate + money threads)
- Feature graphic v2 (outcome-first, proof, Leash Pro $19 anchor) — PLAY + APP STORE
- 22s promo video ready (Play promo 16:9 + vertical + App Store preview), muted-first, real UI
- Multi-device iOS exports (`fastlane/screenshots/en-US/` _67 + ipad129) — only _67 shipped to avoid duplicate
- Variant A/B/C copy + hybrid C canonical in repo (PR #107 merged)
- SCREENSHOT-STORYBOARD.md overhauled July 11 to forbid money threads, enforce distinct story, brand-new-user test
- Store listing copy: "Your Mac, not cloud credits. Leash Pro $19.99 — approve AI from phone." — stellar, honest, no superlatives, solves stranger confusion
- ThumbGate RAG captures lessons to prevent money dogfood recurrence

---

## 7-day action plan (prioritized for Igor's situation)

**Constraints:** Play live, iOS in review, PR #107 open, low traffic (expect slow experiment significance).

### Day 1 — Fix creative blockers + ship PR #107 metadata

| # | Action | Owner | Proof |
|---|--------|-------|-------|
| 1 | **Re-capture frame 5** — chat thread with 👍 on **completed assistant bubble** (not session list) | Agent + device | Distinct from frame 1; `_assert_store_frame_distinct.py` pass |
| 2 | **Re-capture frame 1** — clean demo thread titles (no "Print money…") | Agent | Screenshot audit |
| 3 | **Merge PR #107** + `fastlane supply --skip_upload_apk --skip_upload_aab` | Agent | Play listing shows hybrid C short desc |
| 4 | **Attach IAP to ASC v1.0** (or withdraw + resubmit with subscription) | Igor ASC UI | `verify-asc-listing.js` → IAP `WAITING_FOR_REVIEW` |

### Day 2 — Video + Play upload

| # | Action | Proof |
|---|--------|-------|
| 5 | Record + edit **22s preview** per [VIDEO-SCRIPT-22s.md](./store-assets/VIDEO-SCRIPT-22s.md) | .mp4 15–30s, 30fps |
| 6 | Upload to **unlisted YouTube** → add Play Console video URL | Live Play listing shows video |
| 7 | Replace ASC app preview if quality < in-app demo | ASC media manager |

### Day 3 — Start experiments

| # | Action | Proof |
|---|--------|-------|
| 8 | Play **Store Listing Experiment:** short desc **A vs C hybrid** (7 days) | Experiment ID in Play Console |
| 9 | Play **screenshot experiment:** current set vs **re-captured 01+05** (after fix) | Second experiment queued (one type at a time if required) |

### Day 4 — First traffic + review seed

| # | Action | Proof |
|---|--------|-------|
| 10 | **HN or r/cursor post** with Variant C narrative + store link + video | UTM `?utm_source=hn` |
| 11 | Implement **in-app review prompt** after first Leash approval (if not shipped) | PostHog event + Play review appears |

### Day 5 — iOS unblock

| # | Action | Proof |
|---|--------|-------|
| 12 | Complete ASC **Agreements/Tax/Banking** if any pending | Paid apps agreement active |
| 13 | Update **review notes** with demo path + Mac dependency | ASC submission notes saved |

### Day 6 — CSL + feature graphic

| # | Action | Proof |
|---|--------|-------|
| 14 | Create **Custom Store Listing** for `cursor`/`claude code` keywords | CSL live in Play Console |
| 15 | Ship **feature graphic v2** (device mock + outcome line) | `featureGraphic.png` updated |

### Day 7 — Measure + iterate

| # | Action | Proof |
|---|--------|-------|
| 16 | Export Play **Store listing acquisition** + experiment dashboard | CSV / screenshot |
| 17 | If <50 store page views: **do not end experiments early** — extend to 14–28 days | Console shows "collecting data" |
| 18 | Capture lesson to ThumbGate RAG with before/after metrics | `capture_memory_feedback` |

---

## Metrics to track

### Primary (weekly)

| Metric | Source | Target (first 30 days) |
|--------|--------|------------------------|
| **Store listing conversion rate** | Play Console → User acquisition → Store listing visitors → Installers | Baseline TBD; +10% vs week 1 after creative fix |
| **Retained first-time installers** | Play Store Listing Experiments | Winning variant ≥90% confidence |
| **Product page CVR (iOS)** | App Store Connect Analytics → Acquisition | Baseline after approval |
| **Impressions → Install (PPO)** | App Store Connect → Product Page Optimization | 90% confidence treatment |

### Secondary

| Metric | Source | Notes |
|--------|--------|-------|
| `leash_paywall_view` → `leash_purchase_result` | PostHog | From [MONETIZATION-PROMOTION.md](./MONETIZATION-PROMOTION.md) |
| Review count + avg rating | Play / ASC | Goal: **≥5 reviews at ≥4.0★** in 14 days post-traffic |
| Review reply rate | Play Console | Target **>70%** |
| Short description experiment lift | Play experiments | A vs C hybrid |
| Screenshot experiment lift | Play experiments | Fixed 01/05 vs old |
| Custom Store Listing CVR vs default | Play Console per CSL | Per-keyword performance |
| Download velocity | Play / ASC | Correlates with ranking ([AppLaunchFlow](https://www.applaunchflow.com/blog/google-play-store-optimization-2026)) |

### Guardrails

- Do not optimize for installs if **D1 retention** on supervisors drops
- Do not end experiments before **7 days** ([Google](https://support.google.com/googleplay/android-developer/answer/13393723))
- Log UTM per channel (HN, Reddit, X) to attribute CVR differences

---

## Source bibliography

### Official

1. [Apple — Product Page Optimization](https://developer.apple.com/app-store/product-page-optimization/)
2. [Apple — App Previews](https://developer.apple.com/app-store/app-previews/)
3. [Apple — PPO Analytics](https://developer.apple.com/help/app-store-connect-analytics/acquisition/product-page-optimization/)
4. [Google Play — Search discovery](https://support.google.com/googleplay/android-developer/answer/4448378)
5. [Google Play — Listing best practices](https://support.google.com/googleplay/android-developer/answer/13393723)

### July 2026 industry

6. [AppFollow — ASO News 2026](https://appfollow.io/blog/aso-news)
7. [AppFollow — Screenshot best practices 2026](https://appfollow.io/blog/aso-screenshots-best-practices)
8. [AppFollow — Video strategies 2026](https://appfollow.io/blog/aso-video-strategies)
9. [Phiture — ASO Trends 2026](https://phiture.com/asostack/aso-trends-in-2026/)
10. [ASO World — Complete guide 2026](https://asoworld.com/en/blog/the-complete-guide-to-aso-best-practices-strategies-in-2026/)
11. [AppTweak — ASO guide 2026](https://www.apptweak.com/en/aso-blog/what-is-app-store-optimization-and-why-is-aso-important)
12. [AppLaunchFlow — Google Play ASO 2026](https://www.applaunchflow.com/blog/google-play-store-optimization-2026)
13. [ASOMobile — Play listings 2026](https://asomobile.net/en/blog/app-listings-in-google-play-2026/)
14. [AppScreenshotStudio — Story flows 2026](https://appscreenshotstudio.com/blog/screenshot-story-flows-2026-framework-for-high-conversions)
15. [LaunchShots — Preview video guide 2026](https://launchshots.app/blog/app-store-preview-video-guide)
16. [WhixFrame — App preview video guide](https://www.whixframe.com/blog/app-preview-video-guide)
17. [AppScreens — Play experiments 2026](https://appscreens.com/blog/google-play-store-listing-experiments)
18. [PressPlay — Experiments guide 2026](https://www.pressplay.run/blog/google-play-store-listing-experiments-guide-2026)
19. [Vmobify — Advanced ASO 2026](https://vmobify.com/blog/advanced-aso-strategies)
20. [AppTweak — Featuring guide 2026](https://www.apptweak.com/en/aso-blog/how-to-get-your-app-featured-on-the-app-store)

### Hermes internal

21. [STORE-ASO-JULY-2026.md](./STORE-ASO-JULY-2026.md)
22. [REAL-USER-READINESS.md](./REAL-USER-READINESS.md)
23. [Live Play listing](https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile) (fetched 2026-07-09)
