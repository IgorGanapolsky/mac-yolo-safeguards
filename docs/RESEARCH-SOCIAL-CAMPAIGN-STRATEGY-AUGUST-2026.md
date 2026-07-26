# Research: Organic social measurement + A/B + closed-loop (August 2026)

| Field | Value |
|-------|--------|
| **run_id** | `trun_3682596d42784685b3e9e1e836e25b6e` |
| **processor** | `pro-fast` |
| **interaction_id** | `trun_3682596d42784685b3e9e1e836e25b6e` |
| **completed** | 2026-07-25 (~3m51s) |
| **raw report** | `parallel-research/social-campaign-strategy-aug-2026.md` |
| **raw metadata** | `parallel-research/social-campaign-strategy-aug-2026.json` |
| **product context** | Hermes Mobile + ThumbGate web; privacy-first; organic multi-channel; first-party UTM/`cta_id` spine |

---

## Verdict (decision-grade)

For **August 2026 solo/small-team devtool SaaS**, the winning system is **not** multi-platform dashboards or classical A/B tests. It is:

1. **First-party event spine** (UTM + `cta_id` → landing → install/pay) as the only auditable performance source  
2. **First-touch for creative decisions**, light multi-touch only for funnel diagnostics  
3. **Bandits / sequential tests** at low N — not p-value A/B on organic posts  
4. **Ledger + RAG** over experiment outcomes — dashboards last  
5. **Focus 2–3 channels + longform** — not spray across eight surfaces  

Our in-repo stack (content log, publish gates, dual-write attribution, `social-campaign-ds.js`, ThumbGate RAG) is the **correct architecture**. Gaps are: production deploy of attribution, install-level store referrer join, experiment ledger with installs_7d, and weekly bandit discipline.

**Treat platform-native claims (exact % reach drops, algo dates) as directional** — many secondary SEO blogs in the source mix; prefer first-party counters for decisions.

---

## Prioritized recommendations (mapped to this repo)

| Priority | Strategy | Map to our tools | Status |
|----------|----------|------------------|--------|
| **P0** | First-party counters only for performance | `funnel_attribution_counters` + content-log join | Built in #1035; deploy pending |
| **P0** | Full UTM on every CTA: source/medium/campaign/content + `cta_id` | Promo skills + content engine | Templates exist; enforce in drafts |
| **P0** | North star: **weekly activated installs from organic** (not impressions) | Scoreboard + store metrics | Partial — need install join |
| **P1** | First-touch for hooks; ignore multi-touch beyond ~3 | `social-campaign-ds.js` ranking | First-touch today |
| **P1** | Min-events gate before crowning winners | `--min-events` (default 5) | Built |
| **P1** | Kill criteria (e.g. &lt;5 installs in 14d → retire hook) | Scoreboard lessons + RAG | Document; automate later |
| **P1** | LinkedIn: links in **first comment**, not body | `publish-linkedin-via-chrome` | Already skill rule |
| **P1** | Play Install Referrer UTM; iOS store `ct=` campaign tags | Store CTA builders | Partial |
| **P2** | Thompson-style bandit over hooks when traffic grows | Extend scoreboard | Not built (use sequential manual A/B first) |
| **P2** | Nightly experiment ledger + embed winners for next draft | ThumbGate capture of `ragCaptureStub` | Stub exists; loop manual |
| **P2** | Bluesky Jetstream for free listening; **skip paid X API** for measurement | N/A | Decision only |
| **P3** | CUPED on landing tests at higher volume | Future | Not needed at current N |
| **P3** | Plausible/PostHog product analytics (not GA4) | Mobile already has PostHog path | Keep |

---

## Measurement architecture (what to trust)

| Source | Use for | Do not use for |
|--------|---------|----------------|
| First-party UTM dual-write | Channel → landing → CTA ranking | Full multi-touch identity graph |
| Content log + publish gates | Ops honesty (LIVE vs PARTIAL) | Business ROI alone |
| Platform analytics (LI/X/etc.) | Content feedback (dwell, comments) | Install/pay decisions |
| Play Install Referrer | Android last-click organic | Perfect multi-device |
| iOS ATT/SKAN-era signals | Coarse paid/organic buckets | Deterministic organic post→install |

**Required event priority (research):**

1. `landing_view` (organic)  
2. Store handoff / install  
3. Web signup / Continuity  
4. In-app activate (first real action)  
5. Share-back (optional)

---

## A/B at indie volume

| Method | When | Our posture |
|--------|------|-------------|
| Classical NHST A/B | ≥ hundreds visitors/arm/week | **Avoid** on organic posts now |
| Min-events + sequential manual | Two hooks, same campaign family | **Do this** via scoreboard |
| Thompson sampling bandits | Growing traffic, many variants | **Later** (P2) |
| CUPED | Landing tests with baseline traffic | **Later** |
| Holdout 10% | Pricing/positioning only | Rare |

**When NOT to A/B:** &lt;100 visitors/week; irreversible copy; no baseline metric.

---

## Channel tactics (August 2026 framing)

| Channel | Cadence (research) | CTA placement | Watch-out |
|---------|-------------------|---------------|-----------|
| LinkedIn | 3–4×/wk mid-week morning ET | **First comment** | Body links hurt reach (directional) |
| X | 5–7×/wk threads | Reply chain mid | API measurement expensive — publish only |
| Bluesky | 3–5×/wk | Body OK | Smaller; open APIs for listening |
| Threads | 3–5×/wk conversation | Body OK | Depth &gt; likes |
| Reddit | Value-first, rare | Comment if needed | No shill |
| HN | Show HN / deep comments | Body | Timing Tue–Thu AM ET |
| dev.to | 1–2 longform/wk | Body UTMs | SEO compounder |
| Medium | ≤1/wk | Body | Weaker organic; we already saw title-only failure |

**Focus rule:** ASO + one launch hub + two longform beats eight-channel spray.

---

## Closed loop (ledger + RAG)

```
Content log → publish gates → dual-write attribution
        → weekly social-campaign-ds scoreboard
        → ragCaptureStub → ThumbGate lesson
        → next draft retrieves winners
```

Minimum experiment fields (research): channel, format, hook, cta_id, hypothesis, clicks_7d, installs_7d, paid_7d, notes.

Anti-patterns (aligned with our gates): vanity metrics, false LIVE, double-post, fake traction, trust dual-write without store cross-check.

---

## 30-day action checklist (this repo)

### Week 1 — close the measurement spine
- [ ] Merge + deploy #1035 (attribution table + FunnelSignals)
- [ ] Enforce `utm_campaign` = content-log `Campaign` + unique `cta_id` on every CTA
- [ ] Wire weekly `node tools/social-campaign-ds.js` (with admin attribution dump when available)
- [ ] Capture every scoreboard `ragCaptureStub` into ThumbGate

### Week 2 — install truth
- [ ] Standardize Play `referrer=` UTM and iOS `ct=` / campaign tags on all store CTAs
- [ ] Define north star: **activated installs from organic / week**
- [ ] Kill criteria: e.g. hook retired if &lt;5 attributed landings in 14d (or installs when measurable)

### Week 3 — channel focus A/B
- [ ] Run **one** sequential experiment: two hooks × primary channel (LinkedIn first-comment CTAs)
- [ ] Secondary: one longform (dev.to) with matching campaign tokens
- [ ] Do **not** spray identical copy to all networks same hour

### Week 4 — learning system
- [ ] Append outcomes to experiment notes / ledger (content-log Outcome + scoreboard JSON)
- [ ] Retrieve prior WINNER hooks before drafting (ThumbGate recall / scoreboard)
- [ ] Review: drop zombie variants; double down on winner format only

---

## What we should NOT do (research + our honesty rules)

1. Optimize for impressions/likes  
2. Crown A/B winners under min-events  
3. Pay for X API just to measure organic  
4. Trust platform analytics as ROI  
5. Multi-touch graphs at cold start  
6. Public dashboards exposing operational telemetry (ThumbGate lesson: no public D1 telemetry cards)  
7. Hashnode publish (CEO freeze) / Zernio / double-post  

---

## Alignment with shipped code

| Research asks | We have | Gap |
|---------------|---------|-----|
| Dual-write UTM counters | PR #1035 | Deploy |
| Pre-publish gates | #1034 on main | — |
| Scoreboard join posts→events | `social-campaign-ds.js` | Install metrics |
| Min-events honesty | `--min-events` | — |
| RAG of winners | `ragCaptureStub` | Automatic capture job |
| Bandits | — | Defer until N grows |
| Experiment ledger table | Content log TSV | Optional SQLite ledger later |

---

## Uncertainty notes

- Several “April 2026 LinkedIn algo” / exact reach % claims come from marketing blogs — use as **hypotheses**, not law.  
- X API pricing tiers move; still treat paid X analytics as low ROI for organic measurement.  
- Bluesky open firehose/Jetstream is the free listening path vs closed X.  
- iOS organic install attribution remains **coarse**; UTM in click path is still the best indie signal.

---

## Follow-up research

```bash
parallel-cli research run "..." --previous-interaction-id trun_3682596d42784685b3e9e1e836e25b6e
```

Possible follow-ups: Play Install Referrer encoding for Expo; LinkedIn first-comment CTR benchmarks for B2B tools; Thompson sampling implementation sketch for scoreboard.
