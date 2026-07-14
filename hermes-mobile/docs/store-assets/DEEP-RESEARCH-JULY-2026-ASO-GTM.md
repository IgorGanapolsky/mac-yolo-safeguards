# Deep research + execution — Hermes Mobile (July 2026)

**Date:** 2026-07-14  
**Scope:** Play ASO, organic GTM for AI-agent ICPs, monetization, competitor reality.  
**Sources:** Parallel web search (ASO 2026, OpenClaw/mobile agents, B2B solo founder) + Parallel deep research run `trun_657a0768361d4fbb9526133f709bb8c6` (poll separately) + live Play Publisher API + private revenue board.

---

## 1) What research says (July 2026)

### A. Google Play — ranking vs conversion

| Factor | Implication for Hermes Mobile (~0 installs) |
|--------|-----------------------------------------------|
| **Ranking** is dominated by install velocity, retention, ratings — not copy alone | Listing polish helps **conversion**; it will not “rank #1” without demand |
| **Long-tail keywords** first; head terms need massive velocity | Own phrases: *approve AI tools from phone*, *your Mac not cloud*, *runaway agents*, *Leash* |
| **Store Listing Experiments** measure first-time installers / visitors; test **one** variable | Short-desc A vs hybrid C already started — do not change screenshots mid-test |
| **Graphics + first 2–3 screenshots** drive CTR; unique frames required | 6 phone screenshots + feature graphic live |
| **Promo video** improves store conversion when public/unlisted, ads off | **Still missing** — highest remaining listing gap |
| Special characters in short desc hurt promotion eligibility | `$` / em dash removed; live short uses ASCII |

Refs: PressPlay / AppDrift 2026 experiment guides; ASO 2026 long-tail guidance (WhixFrame/Fractal); AppFollow 2026 video playbook.

### B. Competitive landscape (2026)

| Competitor class | Reality |
|------------------|---------|
| **OpenClaw** | Mobile clients shipping (TechCrunch 2026-06-30; App Store presence) — **handset/cloud agents**, not “your Mac gateway” |
| **Hermes Agent (Hen Works) etc.** | Phone-native AI; users search “Hermes” and land on wrong product |
| **Cursor/remote IDE mobiles** | Adjacent “control coding from phone” |
| **Hermes Mobile (us)** | Differentiator: **self-hosted Hermes gateway + Leash approve/deny + honest connection** |

Listing must keep “NOT phone-native Hermes / NOT OpenClaw” in the first screen of copy.

### C. GTM that works for niche AI tools (zero paid UA)

| Channel | Fit | Note |
|---------|-----|------|
| **HN Show HN** | High ICP density | Rate limits / story-toofast common; persist with Var C headline |
| **Reddit** (LocalLLaMA, selfhosted, SideProject) | High | Value-first; captcha/mod risk; no pure install spam |
| **LinkedIn** | B2B reliability offer | Post already used; first comment = store/Stripe link |
| **GitHub issues / agent reliability buyers** | High for B2B | Source buyers where pain is public |
| **Paid UA** | Premature | Gate until PostHog `app_open` + purchase funnel exist |

Solo-founder pattern (2026): niche outbound + communities + one clear offer — not ads (Reddit/Indie discussions; zero-budget lead gen writeups).

### D. Money model (honest)

| Stream | Status | Priority |
|--------|--------|----------|
| **B2B** Diagnostic $499 / Hardening $1.5k / Partner Pilot $3k | Stripe links **HTTP 200**; **$0 cleared** | **#1 cash** |
| **Leash IAP ~$19.99/mo** | On listing; needs installs + Leash use | #2 after users exist |
| Pipeline paper gross ~$21k | Not revenue | Do not report as money |

**Bottleneck:** conversion / replies, not missing payment links.

---

## 2) Executed this session (evidence)

| Action | Evidence |
|--------|----------|
| Full description rewrite (runaway agents opener, OpenClaw contrast, long-tail) | Play edit **`11907298231609510520`** committed |
| Short desc (ASCII hybrid C, no `$`/em dash) | Live + repo file synced |
| 6 screenshots + feature graphic | Already production (prior edit) |
| Store experiment A vs C | In progress (id `7582167718598236328`) — leave alone mid-run |
| Promo video | Still empty (YouTube upload blocked) |
| HN / Reddit Var C | Still blocked (rate limit / captcha) |
| Cleared revenue | **Still $0** |

Public short after commit should match:  
`Your Mac, not cloud credits. Leash Pro 19.99/mo - approve AI from phone.`

---

## 3) Prioritized 7-day plan (post-research)

| Day | Listing / product | Distribution | Money |
|-----|-------------------|--------------|-------|
| **0** | Commit full desc (done); leave short-desc experiment alone | Draft only if rate-limited | Wait for replies on sent B2B; no thrash |
| **1** | Unlisted 22s promo → Play video field | Show HN when not rate-limited | Apollo **one new** ICP email only if verified |
| **2** | Custom country listing only if US traffic >0 | Reddit value post (selfhosted/LocalLLaMA) | Follow-up only if reply |
| **3** | Read experiment interim (likely inconclusive) | GitHub reliability issue comments (1/day cap) | Upwork ≤1 if fit |
| **4–5** | Merge USB picker UX (#340) OTA | Repeat organic | Close any warm reply with single Stripe link |
| **6–7** | Screenshot caption audit if CTR low | Measure Play visitors if Console has data | Update ledger only on real charge |

### Success metrics (no vanity)

1. **Money:** Stripe payment in ledger (any tier)  
2. **Store:** Promo video URL non-empty on API; public og:description matches hybrid C  
3. **Distribution:** ≥1 public post URL with UTM that is not rate-limited  
4. **Reviews:** ≥1 non-owner Play rating only after continuous E2E = pass  

### Explicit non-goals this week

- Paid UA / AppLovin  
- Changing short desc while A/B experiment is active (would contaminate)  
- Claiming install rank without Console install metrics  

---

## 4) Deep research run

- **ID:** `trun_657a0768361d4fbb9526133f709bb8c6`  
- **URL:** https://platform.parallel.ai/play/deep-research/trun_657a0768361d4fbb9526133f709bb8c6  
- **Processor:** core-fast  
- Append full markdown report here when `parallel-cli research poll` completes.

---

## 5) Source bookmarks (search corpus)

- https://www.pressplay.run/blog/google-play-store-listing-experiments-guide-2026  
- https://appdrift.co/blog/google-play-store-listing-experiments  
- https://appfollow.io/blog/aso-video-strategies  
- https://composio.dev/content/openclaw-alternatives  
- https://techcrunch.com/2026/06/30/openclaw-is-finally-available-on-android-and-ios/  
- https://www.pertamapartners.com/insights/ai-consulting-pricing-guide  

## Appendix: Parallel deep research full report

See [DEEP-RESEARCH-JULY-2026-PARALLEL-REPORT.md](./DEEP-RESEARCH-JULY-2026-PARALLEL-REPORT.md)  
Run id: `trun_657a0768361d4fbb9526133f709bb8c6` (completed).
