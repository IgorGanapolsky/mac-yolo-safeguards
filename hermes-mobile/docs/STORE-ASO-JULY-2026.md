# Store ASO Research — Hermes Mobile (July 2026)

Research date: **2026-07-06**. Scope: Play/App Store listing optimization — screenshot storyboards, captions, feature graphic, preview video, competitor ASO teardown, A/B description variants.

Product: **Hermes Mobile** + **Leash Pro** ($19/mo). Package: `com.iganapolsky.hermesmobile`. Audience: prosumer AI agent operators (Cursor, Claude Code, OpenClaw, Hermes gateway).

Related: [ICON-DESIGN-JULY-2026.md](./ICON-DESIGN-JULY-2026.md), [EMERGENCY-PUBLISH-2026-07-06.md](./EMERGENCY-PUBLISH-2026-07-06.md).

---

## Executive summary

| Gap (pre-research) | July 2026 recommendation |
|------------------|----------------------------|
| Raw phone screenshots only | **6 framed screenshots** with outcome-first captions (OCR-indexed keywords) |
| Basic feature graphic | **v2 spec**: problem → product → proof in 1024×500 |
| No preview video | **22s script** — approve-from-couch demo, muted-first |
| No competitor ASO analysis | Moshi / Termius / Codex / meshTerm positioning matrix below |
| Single description | **3 A/B variants** — Safety / Operator / Wallet guard angles |

**Current shipped assets** (2026-07-06): 4 raw 1080×2340 captures in `fastlane/metadata/`, v1 feature graphic, listing copy in `fastlane/metadata/android/en-US/`. **Upgrade path:** regenerate with captions via `scripts/generate-store-screenshots.sh` (see §8).

---

## 1. July 2026 ASO rules (sourced)

### Screenshot captions

| Rule | Source |
|------|--------|
| **First 3 screenshots = 80% of conversion**; first 1–2 visible in search on Play | [Launch Shots 2026](https://www.launchshots.com/blog/app-store-screenshot-best-practices), [Sonar captions](https://trysonar.app/blog/app-store-screenshot-captions) |
| Captions **≤7 words**, outcome-first, keyword-rich (not "Easy to Use") | [AppLaunchFlow ASO 2026](https://www.applaunchflow.com/blog/aso-2026-guide) |
| **Vertical 9:16 only**; text in **caption band** above/below device — not over UI | [AppScreenshotStudio 2026](https://appscreenshotstudio.com/blog/2026-aso-guide-why-screenshot-captions-are-now-critical) |
| **High contrast ≥4.5:1** for OCR (Apple + Google index caption text in 2026) | [Nakxi OCR ASO 2026](https://www.nakxi.com/blog/trending-app-screenshots-aso-google-ai-search-ranking-2026/) |
| **5–8 screenshots** telling one story; each advances the pitch | Launch Shots 2026 |
| A/B via **Store Listing Experiments** (Play) / **Product Page Optimization** (Apple) — one variable, ≥7 days | Launch Shots, Sonar |

### Feature graphic (Play only)

| Spec | Value |
|------|--------|
| Size | **1024 × 500 px**, JPG or 24-bit PNG (no alpha) |
| Role | Banner in Play search/browse — **not** on product page gallery |
| Content | Value prop + brand mark; readable at **~200px** width |
| Avoid | Tiny text, busy gradients, feature lists without outcome |

### App preview video

| Spec | Value |
|------|--------|
| Apple | **15.0–30.0s** strict; H.264; **muted autoplay**; up to 3 previews; real in-app footage only |
| Google | YouTube URL on listing; optional but lifts conversion when paired with strong first frame |
| Structure | Hook (0–3s) → core workflow (3–22s) → proof/CTA (22–28s) |
| Must show | Real UI — approvals, chat, connection honesty (not logo montage) |

Sources: [Apple App Previews](https://developer.apple.com/app-store/app-previews/), [LaunchShots preview guide 2026](https://launchshots.app/blog/app-store-preview-video-guide), [AppLaunchFlow preview 2026](https://www.applaunchflow.com/blog/app-preview-video-requirements-2026).

---

## 2. Screenshot storyboard (recommended set)

**Canvas:** 1080×2340 phone frame on `#0B0F19` background. Caption band: 120px top, `#111827` panel, **Space Grotesk 48px bold white**, accent `#22D3EE` for one keyword per caption.

| # | In-app capture | Maestro / deep link | Caption (≤7 words) | Keywords indexed | Story beat |
|---|----------------|---------------------|--------------------|------------------|------------|
| **1** | Chat with agent + connection pill "Connected" | `hermes://chat` (demo) | **Approve AI agents from phone** | approve, AI agent, mobile | Hero — standalone ad (Play search) |
| **2** | Leash approval card: blocked bash + Approve/Deny | `hermes://leash` | **Block destructive commands remotely** | block, commands, safety | Problem → solution |
| **3** | Pro tab upsell / gate rules list (Pro user) | `hermes://dev/leash-unlock` → Pro | **Standing gate rules synced** | gate rules, Leash Pro | Monetization hook |
| **4** | Settings → gateway ops + QR pair CTA | `hermes://settings` | **Pair your Mac in one scan** | pair, Mac, QR | Onboarding proof |
| **5** | Chat output with 👍 thumb on assistant bubble | Chat + completed reply | **ThumbGate memory on replies** | ThumbGate, feedback | Differentiator vs SSH clients |
| **6** | Connection panel: cellular + tunnel copy | Disconnect Wi‑Fi fixture | **Works on cellular + tunnel** | cellular, remote, tunnel | Honest connectivity (vs competitors) |

**Order rationale:** Outcome → safety → paid tier → setup → memory → connectivity. It preserves the campaign value props used throughout this report: wallet guard, machine guard, and thumb from couch.

**Current captures vs storyboard:**

| File | Maps to | Gap |
|------|---------|-----|
| `01_onboarding.png` | #4 partial | Replace with framed caption + clearer QR step |
| `02_chat.png` | #1 | Add caption band + "Connected" state |
| `03_pro.png` | #3 | Good — add caption |
| `04_settings.png` | #4 | Good — add caption |
| — | #2, #5, #6 | **Missing** — capture Leash approval + thumbs + cellular |

---

## 3. Feature graphic design (v2 spec)

**Problem with v1:** Icon + text only; no outcome line; font failed on ImageMagick export.

### v2 layout (1024×500)

```
┌─────────────────────────────────────────────────────────────┐
│  [H icon 160px]   Approve AI agents from your phone          │  ← 44px bold white
│                   Stop runaway Cursor / Claude Code tools    │  ← 28px #9CA3AF
│                   ★ Free approvals  ·  Leash Pro $19/mo        │  ← 24px #22D3EE
│  [optional: tiny device mock showing approval card]           │
└─────────────────────────────────────────────────────────────┘
Background: `#0B0F19` + subtle radial `#6366F1` 15% top-left, `#22D3EE` 10% bottom-right
```

**Design tokens:** Match [ICON-DESIGN-JULY-2026.md](./ICON-DESIGN-JULY-2026.md) — indigo `#6366F1`, cyan `#22D3EE`, ground `#0B0F19`.

**Export:** `fastlane/metadata/android/en-US/images/featureGraphic.png`

**Regenerate command:**

```bash
cd hermes-mobile
bash scripts/generate-feature-graphic.sh   # see §8
```

---

## 4. App Store preview video — script + production

**Target duration:** **22 seconds** (safe inside 15–30s). **Aspect:** 886×1920 (6.7" iPhone) or 1080×2340. **Audio:** optional subtle score; **must work muted**.

### Shot list

| Time | Visual | On-screen text (large, high contrast) |
|------|--------|--------------------------------------|
| 0:00–0:03 | Phone lock → notification "Hermes: approval needed" | **Agent wants to run a command** |
| 0:03–0:08 | Open app → Leash tab → blocked `git push --force` diff | **See the full diff on your phone** |
| 0:08–0:11 | Tap **Approve** → haptic → success toast | **One tap to allow or deny** |
| 0:11–0:16 | Switch to Chat tab → send "status" → assistant reply | **Chat with your gateway anywhere** |
| 0:16–0:20 | Settings → QR scan animation (simulated) | **Pair your Mac with QR** |
| 0:20–0:22 | App icon + wordmark on `#0B0F19` | **Hermes Mobile — free download** |

### Production checklist (agent-runnable)

1. **Record:** `adb shell screenrecord` on release build **or** QuickTime + iPhone (preferred for ASC).
2. **Fixture:** Demo mode (`hermes://setup?demo=1`) + sample approval in Leash tab.
3. **Edit:** CapCut / DaVinci — constant 30fps, H.264 High Profile L4.0, AAC stereo.
4. **Poster frame:** Frame at 0:08 (approval card) — works as static screenshot substitute.
5. **Upload:** ASC → Media Manager → App Preview (iPhone 6.7").
6. **Play:** Upload same file to unlisted YouTube → paste URL in Play Console → Video.

**Loom alternative (beta landing):** 60–90s version for [thumbgate.ai/leash-beta](https://thumbgate.ai/leash-beta) — extend the shot list with Mac watchdog log B-roll from the `docs/beta-page/index.html` mock.

---

## 5. Competitor ASO teardown (listing level)

### Positioning matrix

| App | Category | Primary promise (title/subtitle) | Screenshot story | Pricing signal | Hermes wedge |
|-----|----------|----------------------------------|------------------|----------------|--------------|
| **[Termius](https://play.google.com/store/apps/details?id=com.server.auditor.ssh.client)** | Business | "Modern SSH Client" — connect one tap, sync vault | Terminal UI, multi-tab, themes | Free + **Pro subscription** (reviews complain) | Hermes = **agent approvals**, not generic SSH |
| **[Moshi](https://getmoshi.app/)** | Dev tools / Terminal | "Baby monitor for AI agents" — SSH/Mosh terminal | Terminal + inbox + agent hooks; **4.8★**, 750+ ratings | Free SSH + **Pro** (Mosh, unlimited connections) | Hermes = **native gateway/Leash**, not terminal emulator |
| **[Codex (ChatGPT app)](https://openai.com/index/work-with-codex-from-anywhere/)** | Productivity (bundled) | Remote Codex from phone — QR pair per host | ChatGPT mobile UI, threads, approvals | **ChatGPT subscription** | Hermes = **multi-agent / own gateway**, not OpenAI-only |
| **[meshTerm](https://apps.apple.com/ie/app/meshterm-ssh-ftp-via-tailscale/id6761196011)** | Developer tools | SSH/FTP via Tailscale | Tailscale-native SSH sessions | Paid app | Hermes = **Leash + ThumbGate**, Tailscale as transport |
| **Replit mobile** | Developer tools | "Vibe Code with AI" | Cloud IDE on phone | Freemium + subscription | Hermes = **local Mac gateway**, not cloud IDE |
| **Axiom Labs client** ([Play](https://play.google.com/store/apps/details?id=com.axiomlabs.hermesrelay)) | Tools | "YOUR HERMES AGENT, IN YOUR POCKET" | Streaming · voice · dashboard | Free OSS companion | Hermes = **Mac Leash + lock-screen approve + no cloud credits** |

### Termius listing patterns (Play, Jun 2026)

- **Title:** "Termius - Modern SSH Client" (functional, keyword-heavy).
- **Short description:** One-tap connect, SSH/Mosh/SFTP — feature list not outcome list.
- **Reviews:** 4.6★, 1M+ downloads — social proof Hermes lacks on day 1.
- **Monetization friction:** Subscription backlash in reviews ("would pay once").
- **Takeaway:** Lead Hermes with **outcome captions** ("Approve destructive tools") not feature soup ("SSH client").

### Moshi listing patterns (web + App Store, Jun 2026)

- **Headline:** "Nothing beats babysitting your baby projects with AI agents — from anywhere."
- **Emotional hook:** Couch/beach/coffee shop — lifestyle, not specs.
- **Proof:** 4.8★, agent hook (`moshi-hook`), mosh resilience.
- **Free tier:** Honest unlimited SSH — builds trust before Pro upsell.
- **Takeaway:** Hermes free tier (approve/deny + thumbs) matches Moshi's "honest free" pattern; copy should stress **safety circuit breaker** not "another terminal."

### Codex mobile patterns (OpenAI, GA 2026)

- **Distribution:** Inside ChatGPT app — no separate store listing for "Codex Mobile."
- **Pairing:** QR per host; multi-host switcher; approvals in native UI.
- **Takeaway:** Hermes must match **QR pair + multi-Mac + approval UX** parity ([DEEP-RESEARCH-JULY-2026-HERMES-MOBILE.md](../../docs/DEEP-RESEARCH-JULY-2026-HERMES-MOBILE.md)); differentiate on **ThumbGate memory + gate rules + Mac watchdog bundle**.

### Keyword gaps Hermes can own

| Keyword cluster | Competitor saturation | Hermes fit |
|-----------------|----------------------|------------|
| SSH client / terminal | High (Termius, Moshi, Blink) | **Avoid as primary** |
| AI coding agent / Cursor / Claude Code | Medium (Moshi blog, Codex bundled) | **Subtitle + screenshot 1** |
| Approve commands / human in the loop | Low in store titles | **Primary differentiator** |
| Mac freeze / runaway agent | None in app stores | **Feature graphic + screenshot 2** |
| ThumbGate / agent memory | Unique | **Screenshot 5** |

---

## 6. A/B store description variants

Test one variable at a time in Play **Store Listing Experiments** / Apple **PPO**. Minimum 7 days; metric: **first-time installers retained** (Play) / **conversion rate** (Apple).

### Variant A — Safety circuit breaker (default shipped)

**Play title (30):** `Hermes Mobile — AI Control`

**Play short (80):** `Approve AI agent tools from your phone. Stop runaway scripts on your Mac.`

**iOS subtitle (30):** `Approve AI tools from phone`

**Hypothesis:** Max clarity for agent operators searching "approve" + "AI".

---

### Variant B — Operator / Codex parity

**Play title (30):** `Hermes — Remote AI Operator`

**Play short (80):** `Control Cursor & Claude Code from your phone. Pair Mac, chat, approve tools.`

**iOS subtitle (30):** `Remote AI agent control`

**Hypothesis:** Captures Codex/Moshi intent users; higher volume keywords.

**Full description opening (replace first paragraph only):**

> Control your AI coding agents from anywhere — the mobile operator console for Cursor, Claude Code, OpenClaw, and Hermes gateway. Pair with QR, chat with your Mac, and approve blocked commands before they run.

---

### Variant C — Wallet + machine guard (HN/PH angle)

**Play title (30):** `Hermes Mobile — Agent Leash`

**Play short (80):** `Stop token-burn loops and runaway simulators. Approve agent tools from your phone.`

**iOS subtitle (30):** `Stop runaway AI agents`

**Hypothesis:** Problem-aware search ("runaway", "token burn"); aligns with the private ops asset `business_os/sales_assets/launch-hn.md`.

**Full description opening:**

> Stop runaway AI agents from freezing your Mac and burning API credits — approve destructive tools from your phone before they execute. Free approvals; Leash Pro syncs standing gate rules ($19/mo).

---

### Keyword field (iOS, 100 chars)

```
AI agent,cursor,claude code,developer tools,approve,mac gateway,hermes,openclaw,automation,safety
```

**Variant B keywords:**

```
remote coding,AI agent,cursor,claude code,approve,terminal,gateway,developer tools,ssh,automation
```

---

## 7. Implementation priority

| Priority | Asset | Effort | Impact |
|----------|-------|--------|--------|
| P0 | Reframe screenshots 1–4 with caption bands | 2h design + script | High CVR + OCR |
| P0 | Capture missing #2 Leash approval, #5 thumbs | 30 min adb | Completes story |
| P1 | Feature graphic v2 | 30 min | Play browse CVR |
| P1 | 22s preview video | 2–4h record/edit | +15–25% CVR (industry est.) |
| P2 | Store Listing Experiment A vs C short desc | 7d wait | Data-driven copy |
| P2 | Localized en-US → en-GB/de-DE captions | 1d | Play search in EU |

---

## 8. Repo artifacts (this research)

| Path | Purpose |
|------|---------|
| `docs/STORE-ASO-JULY-2026.md` | This document |
| `docs/store-assets/SCREENSHOT-STORYBOARD.md` | Frame-by-frame capture spec |
| `docs/store-assets/VIDEO-SCRIPT-22s.md` | Preview video shot list |
| `docs/store-assets/FEATURE-GRAPHIC-v2.md` | Feature graphic spec |
| `docs/store-assets/COMPETITOR-ASO-TEARDOWN.md` | Extended competitor notes |
| `fastlane/metadata/android/en-US/variants/` | A/B Play title, short, full description |
| `fastlane/metadata/ios/en-US/variants/` | A/B iOS name, subtitle, keywords |
| `fastlane/metadata/README-variants.md` | How to run Play/Apple listing experiments |
| `scripts/capture-store-screenshots.sh` | Capture raw frames via adb deep links |
| `scripts/generate-feature-graphic.sh` | Export v2 feature graphic |

---

## 9. References

1. [Launch Shots — Screenshot best practices 2026](https://www.launchshots.com/blog/app-store-screenshot-best-practices)
2. [AppLaunchFlow — ASO 2026 OCR captions](https://www.applaunchflow.com/blog/aso-2026-guide)
3. [Nakxi — OCR + AI search ranking 2026](https://www.nakxi.com/blog/trending-app-screenshots-aso-google-ai-search-ranking-2026/)
4. [Apple — App Previews](https://developer.apple.com/app-store/app-previews/)
5. [Moshi — positioning](https://getmoshi.app/)
6. [OpenAI — Codex from anywhere](https://openai.com/index/work-with-codex-from-anywhere/)
7. [Termius — Play listing](https://play.google.com/store/apps/details?id=com.server.auditor.ssh.client)
