# ASO — AI Coding Agent Keywords (July 2026)

Research date: **2026-07-10**. Package: `com.iganapolsky.hermesmobile`. Extends [ASO-POSITIONING-SOCIAL-JULY-2026.md](./ASO-POSITIONING-SOCIAL-JULY-2026.md), [ASC-ASO-POSITIONING-JULY-2026.md](./ASC-ASO-POSITIONING-JULY-2026.md), [COMPETITIVE-REPLIT-AGENT.md](./COMPETITIVE-REPLIT-AGENT.md).

**North star:** Rank for **AI coding agent control** intent — not bare "hermes mobile" and not impersonating ChatGPT/Claude/Replit.

---

## 1. Store policy — competitor names & comparison copy (July 2026)

### Apple App Store

| Rule | Source | Hermes implication |
|------|--------|-------------------|
| No **competing app names** in keywords | [Product page keywords](https://developer.apple.com/app-store/product-page/) | Do **not** put `cursor`, `replit`, `chatgpt`, `claude` in the 100-char keyword field |
| No **unauthorized trademarks** in metadata | Guideline **2.3.7** | Same — keyword field is highest rejection risk |
| Subtitle must not **reference other apps** | Guideline **2.3.7** | Subtitle = benefit (`Control Mac agents from phone`), not "vs Cursor" |
| **Factual integration** in description OK | Review practice + conversion copy | "Control Cursor, Claude Code, Codex **on your Mac**" — capability, not impersonation |
| **"Alternative to X"** in visible metadata | High risk (2.3.7 + Lanham) | **Avoid** in title/subtitle/keywords; OK in **social/blog** with clear differentiation |
| Long-tail in **description** | Not indexed on iOS | Use for conversion + Gemini/Spotlight adjacency, not ranking |

### Google Play

| Rule | Source | Hermes implication |
|------|--------|-------------------|
| Don't use another app's title/name to **mislead** | [Store listing best practices](https://support.google.com/googleplay/android-developer/answer/13393723) | Title stays **Hermes Mobile: Mac AI Leash** — our brand |
| No **competitor mentions** in metadata | [AppDrift Play description policy](https://appdrift.co/blog/google-play-description-optimization) | No "better than Replit" or "Replit alternative" in title/short |
| **Problem-solution** comparisons OK | Deceptive-behavior boundary | "Metered cloud IDE credit burn" / "phone-only chatbot" — category, not trademark |
| **Named integrations** in full description | Common practice when factual | Cursor, Claude Code, Codex as agents **you remote-control** |
| Long-tail **indexed** on Play | Title + short + full | Front-load `AI coding agents`, `approve`, `Mac`, `phone` in first 250 chars |

### Branded vs long-tail strategy

| Tier | Examples | Where |
|------|----------|-------|
| **Head (avoid owning)** | hermes mobile, ai chat, chatgpt | Dominated by unrelated Hermes apps + phone AI giants |
| **Wedge (target)** | mac ai agent, approve ai agents, coding agent remote | Title + short + full opening |
| **Long-tail (win first)** | control cursor from phone, claude code approve mobile, codex mobile operator | Play full desc + social + Dev.to |
| **Social-only comparison** | replit alternative for mac owners, vs metered cloud agent | LinkedIn, Reddit, X — not store title |

---

## 2. Keyword universe (Hermes Mobile wedge)

### Primary targets (store metadata)

| # | Keyword / phrase | Store field | Rationale |
|---|------------------|-------------|-----------|
| 1 | **mac ai agent** | Title `Mac AI Leash` + short | Core wedge; own-machine agent |
| 2 | **coding agent** | iOS keywords + Play full | Category intent |
| 3 | **approve ai agents** | Play full front-load | Unique Leash capability |
| 4 | **remote coding agent** | iOS keywords `remote` + desc | Operator job-to-be-done |
| 5 | **local ai mac** | Play full `your hardware` | vs cloud + phone-only |
| 6 | **ai agent control** | Short + subtitle | Control plane positioning |
| 7 | **developer tools mobile** | iOS `devtools` | Dev audience |
| 8 | **gateway operator** | Keywords `gateway,operator` | Hermes power users |
| 9 | **agent safety approve** | Keywords `safety,approve` | Circuit-breaker angle |
| 10 | **codex mobile** | Keywords `codex` + social | OpenAI Codex operator searches |

### Secondary (description + social only — trademark-sensitive)

`cursor mobile`, `claude phone`, `claude code mobile`, `replit alternative`, `chatgpt mac control`, `gemini mac`, `openclaw mobile`, `windsurf mobile`, `devin alternative`

**Rule:** Name the agent only when describing **remote control of software the user already runs** — never "we are ChatGPT/Claude/Cursor."

---

## 3. Metadata gap analysis (2026-07-10)

| Field | Before (PR #115 base) | Gap | After (this pass) |
|-------|----------------------|-----|-------------------|
| Play title | `Hermes Mobile: Mac AI Leash` | ✅ aligned | unchanged |
| Play short | Live stream + Leash focus | Weak **agent** plural; typo risk | `Control YOUR Mac AI agents from phone — approve tools, no cloud credits.` |
| Play full | Cursor/Claude named; Replit-style | Missing **vs phone AI** + **vs cloud agent** sections | Added `VS METERED CLOUD AGENTS` + `VS PHONE-ONLY AI APPS` |
| iOS name | `Hermes Mobile: Mac AI Leash` | ✅ | unchanged |
| iOS subtitle | `Own Mac. No cloud credit burn` | Awkward "Own"; weak agent intent | `Control Mac agents from phone` |
| iOS keywords | `cursor,claude code` present | **Trademark rejection risk** | `coding agent,remote,approve,devtools,terminal,gateway,operator,safety,local,pair,tailscale,codex` (95/100) |
| iOS promo | Generic cloud IDE | Missing agent wedge | Agent control + not phone chatbot |
| iOS/Android desc | Partial | iOS missing parity sections | Synced with Play wedge blocks |

---

## 4. Recommended copy (shipped in `fastlane/metadata/`)

### Top 10 target keywords (priority order)

1. mac ai agent  
2. coding agent remote control  
3. approve ai agents  
4. local ai mac  
5. ai agent control phone  
6. developer tools mobile  
7. codex mobile operator  
8. gateway operator  
9. agent safety approve  
10. control mac agents from phone  

### Title (both stores) — **changed for AI agent wedge**

`Hermes Mobile: AI Agent Leash` (29/30) — brand + **AI agent** intent (supersedes `Mac AI Leash` from PR #115).

### Subtitle / short (changed)

| Store | Field | Copy | Chars |
|-------|-------|------|-------|
| iOS | Subtitle | `Control your Mac from phone` | 27/30 |
| Play | Short | `Control YOUR Mac AI agents from phone — approve tools, no cloud credits.` | 68/80 |

### iOS keywords (changed — trademark-safe)

`coding,remote,approve,devtools,terminal,gateway,operator,safety,local,pair,tailscale,codex,cli` (93/100)

**Removed from keywords (policy):** `cursor`, `claude`, `chatgpt`, `replit`, `gemini`, `copilot`, `windsurf` — these appear only in **descriptions** with explicit non-affiliation disclaimer.

See also: [AGENT-KEYWORD-MATRIX-JULY-2026.md](./AGENT-KEYWORD-MATRIX-JULY-2026.md) for cluster mapping.

### Honest positioning line (all channels)

> **Hermes Mobile controls YOUR Mac agents from your phone — it is not ChatGPT, Claude, or Replit.**

---

## 5. Social drafts (dev audiences)

See `docs/social/week-2026-07-10-ai-agents/` — five posts vs metered cloud agents and phone-only AI apps.

| # | Platform | Angle |
|---|----------|-------|
| 1 | LinkedIn | Mac owner vs Replit metered cloud |
| 2 | X | Cursor approve-from-couch hook |
| 3 | Dev.to | QR pair + local agent control guide |
| 4 | Reddit r/LocalLLaMA | Own-machine economics |
| 5 | Hashnode | Phone AI apps vs Mac agent control plane |

---

## 6. Ranking expectations

| Timeframe | Realistic outcome |
|-----------|-------------------|
| Week 1 | Conversion lift on long-tail Play queries (`approve ai agents`, `mac ai agent`) |
| Weeks 2–4 | Social backlinks → install velocity spikes |
| Month 2+ | Climb agent-intent searches; **not** #1 on "chatgpt" or "claude" |
| Never | Impersonating major AI brands in title — rejection + brand complaints |

---

## 7. Sources

1. https://developer.apple.com/app-store/product-page/
2. https://developer.apple.com/app-store/review/guidelines/ (§2.3.7)
3. https://support.google.com/googleplay/android-developer/answer/13393723
4. https://support.google.com/googleplay/android-developer/answer/9888077
5. https://appdrift.co/blog/google-play-description-optimization
6. https://trysonar.app/blog/app-store-keyword-field
7. https://asodesk.com/blog/using-branded-keywords-in-aso-strategy/
8. https://auditbuffet.com/audits/app-store-metadata-listing/checks

---

## 8. Vault handoff

Append: `~/Documents/AI-Agent-Sync/Handoffs/2026-07-10-aso-ai-agent-keywords.md`
