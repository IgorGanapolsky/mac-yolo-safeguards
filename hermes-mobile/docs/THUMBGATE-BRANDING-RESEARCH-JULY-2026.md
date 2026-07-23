# ThumbGate branding research — Hermes Mobile store titles (July 2026)

**Research date:** 2026-07-10  
**Trigger:** Play Store screenshot showed `Hermes Mobile: Mac AI Leash` — Igor pushback: Windows/Linux users, ThumbGate Leash firewall angle, thumbgate.ai alignment.  
**Package:** `com.iganapolsky.hermesmobile`  
**Related:** [ASO-AI-AGENT-KEYWORDS-JULY-2026.md](./ASO-AI-AGENT-KEYWORDS-JULY-2026.md), PR [#120](https://github.com/IgorGanapolsky/mac-yolo-safeguards/pull/120), [thumbgate.ai](https://www.thumbgate.ai)

---

## Executive summary

| Finding | Detail |
|---------|--------|
| **Live Play title (pre-fix)** | `Hermes Mobile: Mac AI Leash` — **wrong** for cross-platform product truth |
| **PR #120 merged** | Repo moved to `AI Agent Leash` but **`fastlane supply` never ran** — Play stayed on Mac-only title |
| **thumbgate.ai** | Positions ThumbGate as **pre-action governance / firewall** for AI agent tool calls — **ThumbGate Leash** is the mobile enforcement surface |
| **Product truth** | Hermes gateway pairs to **Mac, Linux, or Windows** (code + review notes + full descriptions) |
| **iOS** | v1.0 `WAITING_FOR_REVIEW` — **do not change ASC name/subtitle until approved or rejected** |
| **Action taken** | Play metadata patched + `supply` pushed (verified via Publisher API); iOS fastlane updated in repo only (post-review paste) |

---

## 1. thumbgate.ai — key messaging (fetched 2026-07-10)

Source: [https://www.thumbgate.ai](https://www.thumbgate.ai) (llms.txt / homepage synthesis).

### Headline & category

| Element | Copy |
|---------|------|
| **Hero** | "Stop Costly AI Agent Mistakes Before They Run" |
| **Category** | Pre-action governance / AI agent security infrastructure |
| **Buyer outcome** | Prevent expensive AI mistakes; turn assistant into reliable operator |
| **June 2026 wedge** | "Who controls the tools agents can call?" — MCP security, token-spend control, auditability |

### Product names & branding

| Name | Role |
|------|------|
| **ThumbGate** | Parent brand — CLI + hooks + lesson DB |
| **PreToolUse hooks** | Technical mechanism — tool calls gated before execution |
| **ThumbGate Leash** | Mobile approval relay (Hermes Mobile Pro tab; IAP `thumbgate_leash_monthly`) |
| **Leash Pro** | Store IAP display name ($19.99/mo) |
| **Workflow Hardening Sprint** | Enterprise first paid motion |

### Firewall / governance language (steal list)

Phrases that map directly to store copy:

1. **"Pre-action governance layer"** — not post-hoc git revert
2. **"Network Egress Firewall Governance"** — proxy outbound agent HTTP through allowlists
3. **"Blocks actions before execution"** — vs CLAUDE.md suggestions
4. **"Warn-by-default; hard-block catastrophic classes"** — secret exfil, `rm -rf`, supply-chain
5. **"AI agent security infrastructure"** — enterprise framing (NIST/SOC2 tags in product)
6. **"Repeated AI coding mistakes → pre-action checks → ThumbGate"** — AI search association loop

### Cross-platform claims on thumbgate.ai

- Runs **locally on each developer's machine** (Node.js ≥18.18)
- Agents: Claude Code, Cursor, Codex, Gemini CLI, Amp, OpenCode, ChatGPT Actions, CI, MCP runtimes
- **No Mac-only claim** in primary positioning — desktop dev machine, any OS with Node
- Hermes Mobile is the **phone control plane** for a user-operated gateway (not a cloud relay)

### Pricing alignment

| Tier | Price | Hermes tie-in |
|------|-------|---------------|
| Free local CLI | $0 | Pairing + chat on Hermes Mobile |
| ThumbGate Pro | $19/mo or $149/yr | Same order of magnitude as Leash Pro $19.99/mo |
| Enterprise sprint | Custom | Hardening sprint URL in app |

---

## 2. What shipped vs live (PR #120 / supply gap)

### PR #120 (merged 2026-07-10T16:07Z)

Merged `Hermes Mobile: AI Agent Leash` into `fastlane/metadata/` + ASO docs. Test plan item **unchecked**: "After merge: push Play metadata via fastlane supply."

### Evidence — Play Publisher API (2026-07-10)

| Field | **Live Play (before this pass)** | **Repo after #120 (unshipped)** |
|-------|----------------------------------|----------------------------------|
| Title | `Hermes Mobile: Mac AI Leash` | `Hermes Mobile: AI Agent Leash` |
| Short | `Control YOUR Mac AI from phone — no cloud credits. Leash Pro $19.99/mo.` | `Control YOUR Mac AI agents from phone…` |
| Full (opening) | Mac/Linux/Windows in body | Same cross-platform opening |

Public `og:title` confirmed: `Hermes Mobile: Mac AI Leash`.

### iOS ASC (frozen)

| Field | ASC v1.0 in review |
|-------|-------------------|
| State | `WAITING_FOR_REVIEW` |
| App name (API) | `Hermes Mobile — AI Control` |
| Promo (truncated) | "Control AI coding agents on YOUR Mac from your phone…" |

**Rule:** No ASC metadata upload while `WAITING_FOR_REVIEW` unless Apple rejects for metadata reasons.

---

## 3. Why `Mac AI Leash` is wrong

| Issue | Evidence |
|-------|----------|
| **Product lie** | `full_description.txt`, `README.md`, `asc-review-notes-template.txt`, `releaseSafetyContract.test.ts` all assert **macOS, Linux, or Windows** gateways |
| **Lost Windows/Linux buyers** | Title is the highest-weight Play index field; "Mac" signals exclusion |
| **ThumbGate brand miss** | In-app Pro surface is **THUMBGATE LEASH** (`ApprovalsScreen.tsx`, `monetization.ts`); thumbgate.ai sells **firewall/governance**, not "Mac leash" |
| **Internal inconsistency** | Full description already says Mac/Linux/Windows; title/short contradicted body copy |
| **Stale after #120** | Team thought title was fixed; supply never ran |

### What was *partially* right

- "Leash" — matches Pro feature and operator metaphor (Moshi "baby monitor for agents")
- "AI" — correct category vs generic Hermes apps on store SERP

---

## 4. Product truth — cross-platform gateway

| Source | Claim |
|--------|-------|
| `fastlane/metadata/android/en-US/full_description.txt` | "your own Mac, Linux, or Windows computer" |
| `scripts/asc-review-notes-template.txt` | "user's OWN computer (macOS, Linux, or Windows)" |
| `src/__tests__/releaseSafetyContract.test.ts` | Asserts review notes contain cross-platform string |
| `README.md` | "Hermes on your computer (macOS, Windows, or Linux)" |

**Honest caveat (REAL-USER-READINESS):** Stranger onboarding is still operator-shaped (user must run gateway on *a* computer). Cross-platform ≠ zero setup. Copy must not imply phone-only AI.

---

## 5. Brand hierarchy (canonical)

```
ThumbGate (parent — thumbgate.ai, CLI, lesson DB, firewall hooks)
  └── Hermes Mobile (app store identity — mobile control plane)
        └── ThumbGate Leash / Leash Pro (paid — approve/deny tool calls from phone)
```

| Layer | Store-visible | In-app |
|-------|---------------|--------|
| App | **Hermes Mobile** | Bottom nav, settings |
| Pro feature | **ThumbGate Leash** (title suffix) | Leash tab header "THUMBGATE LEASH" |
| IAP SKU | Leash Pro $19.99/mo | `thumbgate_leash_monthly` |

**Do not** rename the Play/App Store listing to bare "ThumbGate" — Hermes Mobile is the installed app identity; ThumbGate is the enforcement brand inside the title suffix and Pro tab.

---

## 6. Recommended title strategy — 3 options (ranked)

### Option 1 — **RECOMMENDED** (shipped to Play this pass)

| Store | Field | Copy | Chars |
|-------|-------|------|-------|
| Play + iOS (repo) | Title / Name | `Hermes Mobile: ThumbGate Leash` | 28/30 |
| Play | Short | `Self-Improving Firewall for your AI agents — approve + learn. Mac/Linux/Win.` | 78/80 |
| iOS (repo, post-review) | Subtitle | `Your computer, not cloud` | 24/30 |

**Why #1:** Matches ThumbGate **Self-Improving Firewall** positioning (lessons, promote/demote, re-rank), in-app "ThumbGate Leash" Pro name, IAP wiring, and cross-platform honesty in short description.

**Keywords indexed:** ThumbGate, Leash, self-improving firewall, AI agents, Mac, Linux, Windows.

> **Note (2026-07-23):** Live Play/ASC short strings are owned by `T-LISTING-ALIGN-*` / listing lane — do not push this research string without that lane.

---

### Option 2 — AI-agent SEO wedge (PR #120)

| Field | Copy | Chars |
|-------|------|-------|
| Title | `Hermes Mobile: AI Agent Leash` | 29/30 |
| Play short | `Approve AI agents on YOUR computer — Mac, Linux, Windows. No cloud credits.` | 72/80 |
| iOS subtitle | `Approve agents from phone` | 25/30 |

**Why #2:** Stronger generic "AI agent" search intent; weaker ThumbGate brand surfacing.

**Use when:** Play Console experiment shows Option 1 underperforms on retained installers.

---

### Option 3 — Firewall-forward (aggressive category claim)

| Field | Copy | Chars |
|-------|------|-------|
| Title | `Hermes Mobile: Agent Firewall` | 27/30 |
| Play short | `Stop costly AI mistakes before they run — approve tools from your phone.` | 72/80 |
| iOS subtitle | `Pre-action agent safety` | 23/30 |

**Why #3:** Closest to thumbgate.ai hero ("Stop Costly AI Agent Mistakes"); risks sounding like network firewall vs agent tool gate.

**Use when:** A/B testing problem-aware queries ("ai agent firewall", "stop runaway cursor").

---

## 7. Steal-from-thumbgate.ai — store copy blocks

### Play full description — insert after paragraph 1 (optional)

> **ThumbGate Leash** is the mobile side of the self-improving firewall for agent tool calls: see the diff, approve or deny, and sync standing gate rules with your desktop ThumbGate lessons (promote/demote + re-rank).

### iOS promotional text (post-review paste)

> ThumbGate Self-Improving Firewall for your AI agents — approve risky commands from your phone; lessons promote/demote and re-rank over time. Mac, Linux, or Windows gateway; not a cloud IDE burning credits.

### Feature graphic / screenshot caption

> Stop costly AI mistakes before they run · ThumbGate Leash on your phone

### Social (not in store title — trademark-safe)

> Your coding agent wants to `git push --force`. ThumbGate Leash on Hermes Mobile lets you deny it from the couch — on the Mac, Linux, or Windows box you already own.

---

## 8. A/B variants (Play Console experiments)

Existing variant files: `fastlane/metadata/android/en-US/variants/`.

| Experiment | Control | Treatment | Metric |
|------------|---------|-----------|--------|
| **Title** | Option 1 ThumbGate Leash | Option 2 AI Agent Leash | Retained first-time installers, ≥7d |
| **Short** | Option 1 firewall + OS list | Option 3 "Stop costly AI mistakes…" | Same |
| **Short (hybrid)** | README hybrid C: `Your Mac, not cloud credits. Leash Pro $19.99…` | Option 1 firewall line | Monetization vs discovery |

Do **not** run title + short experiments simultaneously — one variable per experiment ([Play best practices](https://support.google.com/googleplay/android-developer/answer/13393723)).

---

## 9. What was updated vs doc-only

| Item | Status |
|------|--------|
| `fastlane/metadata/android/en-US/title.txt` | ✅ `Hermes Mobile: ThumbGate Leash` |
| `fastlane/metadata/android/en-US/short_description.txt` | ✅ Cross-platform + firewall |
| `fastlane/metadata/ios/en-US/name.txt` | ✅ Repo only — **not pushed to ASC** |
| `fastlane/metadata/ios/en-US/subtitle.txt` | ✅ Repo only — **not pushed to ASC** |
| Play `fastlane supply` | ✅ Pushed 2026-07-10 (text metadata only; `--skip_upload_changelogs/images/screenshots`) |
| iOS ASC | ❌ Frozen — `WAITING_FOR_REVIEW` |
| This document | ✅ |

---

## 10. Post-iOS-approval checklist

1. Paste iOS name/subtitle from Option 1 into ASC (or run `deliver` metadata-only).
2. Start Play Store Listing Experiment: title Option 1 vs Option 2.
3. Update screenshot frame 2 caption: "ThumbGate Leash — block destructive commands."
4. Sync vault handoff: `~/Documents/AI-Agent-Sync/Handoffs/2026-07-10-thumbgate-branding.md`.

---

## Sources

1. https://www.thumbgate.ai (fetched 2026-07-10)
2. Play Publisher API — `com.iganapolsky.hermesmobile` listings/en-US
3. Public Play page `og:title` / JSON-LD
4. `node scripts/verify-asc-listing.js` — iOS `WAITING_FOR_REVIEW`
5. PR #120 merge commit + unchecked supply test plan
6. `src/constants/monetization.ts`, `ApprovalsScreen.tsx`
7. [COMPETITOR-ASO-TEARDOWN.md](./store-assets/COMPETITOR-ASO-TEARDOWN.md)
