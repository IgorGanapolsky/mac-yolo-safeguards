# Research ingest — ASO / stellar store listings (July 2026)

**run_id:** `trun_aec2731adfeb4ec59b01600d3347a04d`  
**interaction_id:** `trun_aec2731adfeb4ec59b01600d3347a04d` (use for follow-ups)  
**processor:** `pro-fast`  
**completed:** 2026-07-15  
**raw:** [`parallel-research/hermes-aso-stellar-july-2026.md`](../../parallel-research/hermes-aso-stellar-july-2026.md) · [`.json`](../../parallel-research/hermes-aso-stellar-july-2026.json)

---

## Verdict (decision-grade)

**“Stellar” in July 2026 = conversion system, not static brochure.**  
Native testing + targeted pages + review velocity beat keyword stuffing. Hermes is live on both stores with **~1+ installs and 0 ratings**, so ranking is review-starved and experiments need traffic before they can reach 90% confidence.

**Asymmetry (load-bearing):**

| Store | Indexed for search | Implication |
|-------|--------------------|-------------|
| **Apple** | Title (30) + subtitle (30) + keyword field (100) only — **not** long description | Every iOS metadata character is load-bearing; PPO cannot A/B subtitle |
| **Google** | Title + short desc (80) + **long description (4000)** | Dense, structured Play prose wins; SLE can test short desc / creatives |

**Trademark:** Brand names in live iOS subtitle (`Approve Claude Code, Cursor`) are **Guideline 5.2 risk**. Research: strip brands before next submission; use category language (“AI agent control”), not brand conquesting at our volume.

**Experiments without traffic:** SLE/PPO will often stay “Indeterminate” until ~hundreds of visitors/week (research cites ~5k unique visitors/variant/week for confident PPO reads — unrealistic for us soon). Prefer **single-variable** tests + distribution first.

---

## Hermes live state vs research (2026-07-15)

| Research item | Hermes status |
|---------------|---------------|
| Strip brand subtitle | **Not live** — still `Approve Claude Code, Cursor`; fixed only on draft **1.1** |
| Safe keyword field | Live 1.0 keywords still include `copilot,windsurf,aider,gemini`; 1.1 draft cleaner |
| Preview/promo video | **Play trailer live**; ASC 6.7 preview present |
| Review prompt post-value | Code: after **1 approval** (`STORE_REVIEW_THRESHOLD=1`); research prefers multi-session — OK for cold start |
| SLE short A vs C | Variants exist; **experiment not created** |
| CPPs / Custom listings | **Not built** (research: 70 CPPs / 50 Play CSLs caps) |
| Public Play FAQ accuracy | API fixed; **public HTML still stale** (CDN) |

---

## Action checklist (research × our P0)

Mapped to research weeks, ordered by ROI for *our* state.

### Week 0 — Stop the bleed (ship now)

1. **Attach build to ASC 1.1 → submit → release** so live subtitle becomes `Control Mac agents from phone` (or shorter “AI Agent Control”) and keywords drop brand-adjacent terms.  
   - Metric: no 5.2 rejection; live subtitle without Claude/Cursor.
2. **Audit iOS keywords on 1.1** — no duplicates of title/subtitle, no brand tokens, long-tail devtool terms.  
   - Metric: rank for ≥1 4-word query in 14 days (if any search volume).
3. **Re-poll public Play FAQ** until CDN drops “iOS is in App Store review”; force listing nudge if >48h.

### Week 1 — Conversion foundation

4. **Do not start multi-arm PPO yet** unless distribution starts — research: single high-leverage variable (screenshot #1) only, full 90 days.
5. **Play long description first ~170 chars** — keyword-dense value prop (already partly hybrid C; keep iOS-live FAQ accurate).
6. **Video:** already present on Play + ASC; only re-shoot if first 2s fail the value-prop test.

### Week 2 — Targeted pages (after clean metadata)

7. **3 Apple CPPs** (AI agent control / mobile devtool / category conquest — **no brand names**). Organic keyword-targeted CPPs since Jul 2025.
8. **3 Play Custom Store Listings** mirrored themes + keyword targeting.

### Week 3–4 — Velocity

9. **Drive installs** (distribution) so review prompt can fire → goal **≥1 review in 14 days**, stretch **10 ratings / 60 days**.
10. **Play SLE** short description A vs C when store traffic exists (research: wait for meaningful visitors; don’t starve the experiment).
11. **Quarterly** keyword/long-desc refresh.

### Anti-goals (research)

- No “Claude alternative” / “Cursor mobile” keyword chasing.  
- No iOS title/subtitle A/B via PPO (impossible).  
- No Friday-afternoon metadata submits.

---

## Confidence notes

- Primary sources mixed: Apple/Google help pages (high) + vendor ASO blogs (medium). CVR % for video (15–30%) is **vendor-reported**, not Hermes-proven.
- Research suggested packing `claude-api` into keywords — **contradicts** trademark section; **do not** put Claude/Cursor/Copilot tokens in live metadata.
- PPO “5k visitors/variant/week” implies most indie PPO tests stay indeterminate — treat creatives as qualitative until traffic exists.

---

## Follow-up research

```bash
parallel-cli research run "…" --previous-interaction-id trun_aec2731adfeb4ec59b01600d3347a04d --processor lite-fast --text --no-wait --json
```
