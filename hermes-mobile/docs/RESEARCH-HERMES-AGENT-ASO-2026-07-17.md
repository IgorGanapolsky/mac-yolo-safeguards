# Deep research: ranking for “hermes agent” (2026-07-17)

**Product:** Hermes Mobile (`com.iganapolsky.hermesmobile`) — Mac/desktop Hermes gateway companion over LAN/Tailscale + Leash approvals.  
**Deep-research note:** `parallel-cli research` was blocked by the local zero-spend gate; this report uses live Play/iTunes SERP scrapes, Play Publisher API listing truth, Apple/Google official ASO docs, prior July 2026 stellar research in-repo, and the user’s Play SERP screenshot.

---

## 1. Executive verdict

| Question | Answer |
|----------|--------|
| Can we realistically rank **#1 for exact “hermes agent”** on Play soon? | **No.** #1 is a different product with the exact title and install/review velocity. |
| Who owns Play “hermes agent” today? | **Competitor** `com.hermesagent.android` — **“Hermes Agent - Android”** by **Hen Works**. Truncates in SERP as “Hermes Agent - Andr…”. Light-blue creature icon. Short: “AI Agent on your Android…”. |
| Is that us? | **No.** Ours is `com.iganapolsky.hermesmobile`, title **“Hermes Mobile: AI Agent Leash”**, developer Igor Ganapolsky. |
| Are we on that Play SERP? | **Not in top 20** (scraped 2026-07-17 US). |
| Best winnable queries | `hermes mobile`, `mac ai leash`, `approve ai agent phone`, `hermes gateway phone`, `tailscale hermes`, `control mac agent phone`, branded `hermes mobile ai agent leash` |
| “We are better” → ASO | Convert into **wrong-install prevention + click hooks**: Mac remote / Tailscale / Leash / multi-machine / honest state — not empty “best app” claims (Play policy bans ranking/superlative theater). |

**Strategy shift:** Stop chasing #1 exact-match against Hen Works. Win **qualified clicks** when we appear, defend brand for `hermes mobile`, and grow install velocity on **Mac-remote intent** long-tails. Ranking is still installs + retention + ratings over weeks ([Apple Search](https://developer.apple.com/app-store/search/), [Play listing practices](https://support.google.com/googleplay/android-developer/answer/13393723)).

---

## 2. Live listing truth (verified 2026-07-17)

### Google Play — ours

| Field | Live (API `listings/en-US`) |
|-------|------------------------------|
| Title | Hermes Mobile: AI Agent Leash |
| Short | Your Mac, not cloud credits. Leash Pro $19.99 — approve AI from phone. *(pre-this-PR)* |
| Screenshots | 6 phone frames live |
| Production | 1.2 / versionCode 18 completed |
| Public | [play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile](https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile) |

### Google Play — competitor #1

| Field | Live public |
|-------|-------------|
| Package | `com.hermesagent.android` |
| Title | Hermes Agent - Android |
| Developer | Hen Works |
| Short (og:description) | AI Agent on your Android — multi-model chat, terminal, code execution & more. |
| Job-to-be-done | **Phone-local AI** — opposite of our Mac companion |

### iOS App Store — ours

| Field | Live (iTunes lookup) |
|-------|----------------------|
| Name | Hermes Mobile: AI Agent Leash |
| Bundle | `com.iganapolsky.hermesmobile` |
| Version | 1.2 (currentVersionReleaseDate 2026-07-17) |
| Category | Productivity |
| Ratings | 0 |
| Public | [apps.apple.com/…/id6786778037](https://apps.apple.com/us/app/hermes-mobile-ai-agent-leash/id6786778037) |

### iOS SERP — “hermes agent” (iTunes search US)

Top results are Hermex, “Hermes Agent - AI Assistant”, Claude, Gemini, HermesPilot, Hermes AI, Open Agent, Clawket, Atomic Hermes — **we are not in the top 12**.  
For **“hermes mobile”** we appear at **#5** (brand defense opportunity).

---

## 3. Competitive SERP gaps (why they beat us on the head term)

| Lever | Hen Works / phone Hermes apps | Hermes Mobile |
|-------|-------------------------------|---------------|
| Exact title match | “Hermes Agent …” | “Hermes Mobile: …” (brand + wedge, not exact) |
| Install/review base | Material (historical ~1K+ reviews cited in prior audits) | ~0 reviews / early downloads |
| Intent match for bare “hermes agent” | Phone AI seekers get a phone AI | Mac-gateway operators — **mismatched head term** |
| Differentiation | Weak for Mac operators | Strong: Tailscale, Leash, multi-machine, honest state |

**CTR risk if we renamed to “Hermes Agent …”:** higher wrong installs from phone-AI seekers → churn → ranking harm. Keep **Mobile + Mac/Leash** in the visible name.

---

## 4. Brand / trademark constraints

1. **Hermès luxury fashion** — avoid fashion/lifestyle cues; stay technical (“agent”, “Mac”, “Leash”, “gateway”).
2. **Hen Works “Hermes Agent”** — do not impersonate; use FAQ/diff blocks to **disambiguate**, not to claim their brand.
3. **Nous Research Hermes** — keep “independent / not affiliated” disclaimer (already in listing).
4. **iOS keywords** — no competitor trademarks (`cursor`, `claude`, `chatgpt`) in the 100-char field ([Apple product page](https://developer.apple.com/app-store/product-page/)).
5. **Play** — no “#1 / best” ranking claims ([Play listing best practices](https://support.google.com/googleplay/android-developer/answer/13393723)).

---

## 5. Recommended metadata (before → after)

### Play

| Field | Before | After |
|-------|--------|-------|
| Title | Hermes Mobile: AI Agent Leash | **Keep** (29/30; contains AI Agent without colliding with Hen Works title) |
| Short | Your Mac, not cloud credits. Leash Pro $19.99 — approve AI from phone. | **Control YOUR Mac Hermes agent — not phone AI. Approve tools. Leash $19.99.** |
| Full | Soft open + later FAQ | **Front-load disambiguation** + Tailscale/multi-machine/Leash truths; strengthen Hen Works contrast |

### iOS

| Field | Before | After |
|-------|--------|-------|
| Name | Hermes Mobile: AI Agent Leash | **Keep** |
| Subtitle | Control Mac agents from phone | **Mac remote, not phone chat** |
| Keywords | coding,remote,approve,… | Drop title/subtitle repeats; keep operator long-tails (`coding,approve,…,tailscale,…`) |
| Promo | Generic Mac control | **Not the phone-local Hermes Agent… Tailscale/LAN, multi-machine, Leash…** |

Subtitle for READY_FOR_SALE may only ship with next version attach; **promo patches live** via ASC.

---

## 6. Screenshot / creative recommendations (no new EAS build)

Front-load first 3 frames as **wrong-install killers**:

1. **Connected Mac + machine name** — caption: “Your Mac Hermes — not phone AI”
2. **Leash blocked command + Approve/Deny** — “Approve tools before they run”
3. **Tailscale / cellular reach copy** — “Works off home Wi‑Fi”
4. Multi-machine picker
5. ThumbGate feedback
6. Standing gate rules / Leash Pro

Rules unchanged: real UI only, distinct frames, no dogfood money threads ([STORE-LISTING-STELLAR-JULY-2026.md](./STORE-LISTING-STELLAR-JULY-2026.md)).

---

## 7. Ranking levers (honest priority)

1. **Distribution** (HN/Reddit/Dev.to/LinkedIn with Mac-remote wedge) — #1 bottleneck with ~0 reviews.
2. **Conversion metadata** (this PR) — reduce wrong installs when we appear for hermes* queries.
3. **Review velocity** — `STORE_REVIEW_THRESHOLD=1` already shipped; needs real users.
4. **Update cadence** — already shipping 1.2; metadata-only updates OK without EAS.
5. **Play SLE / CSL** — short-desc A vs Mac-remote wedge after traffic; CSL for `cursor`/`claude code` keyword campaigns.
6. **Apple Search Ads / CPP** — only after ≥some installs; CPP keywords for Mac-remote intent.
7. **Do not** rename to “Hermes Agent - Android” — that cedes product truth and increases churn.

---

## 8. Winnable query ladder

| Tier | Queries | Tactic |
|------|---------|--------|
| Defend | hermes mobile, hermes mobile ai agent leash | Brand in title; social backlinks |
| Win first | approve ai from phone, mac ai agent remote, hermes leash, tailscale hermes phone | Short/full density + screenshots |
| Adjacent | hermes gateway phone, control coding agent phone | Full desc + CSL later |
| Avoid owning soon | hermes agent (exact), hermes ai (generic) | Disambiguate; don’t title-squat |

---

## 9. Sources

- Live Play SERP scrape `q=hermes%20agent` US 2026-07-17 → #1 `com.hermesagent.android`
- User screenshot Play SERP “hermes agent” (truncated title + creature icon)
- Play Publisher API `listings/en-US` for `com.iganapolsky.hermesmobile`
- iTunes `lookup` + `search` US
- [Apple — App Store search](https://developer.apple.com/app-store/search/)
- [Apple — Creating your product page](https://developer.apple.com/app-store/product-page/)
- [Play — Best practices for your store listing](https://support.google.com/googleplay/android-developer/answer/13393723)
- [Play — Metadata policy](https://support.google.com/googleplay/android-developer/answer/9898842)
- In-repo: [STORE-LISTING-STELLAR-JULY-2026.md](./STORE-LISTING-STELLAR-JULY-2026.md), [ASO-POSITIONING-SOCIAL-JULY-2026.md](./ASO-POSITIONING-SOCIAL-JULY-2026.md)
