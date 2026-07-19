# Revenue Loop — experiment memory

The weekly revenue loop (cloud routine `revenue-loop-weekly`) reads this file at the start of every run and appends one entry at the end of every run. This is the loop's memory: what was tried, what the objective metrics said, what to do differently next run. Principles (loop engineering): one Minimal Viable Loop, objective external metrics only, cheap runs on a long cadence, human sends — the agent never sends outreach itself.

## Loop definition

- **Cadence:** weekly (Mondays)
- **Objective metrics (in priority order):**
  1. Replies to outreach (Gmail threads with a response from a prospect)
  2. Booked calls (cal.com bookings mentioned in Gmail)
  3. Sends completed by Igor (drafts that left the Drafts folder)
  4. Leading indicators: LinkedIn post impressions, GitHub repo traffic
- **Actions per run:** review metrics vs. last entry → source 5–10 fresh prospects (GitHub issues / HN Algolia, "scary security email" pain) → enrich via Apollo → create Gmail DRAFTS using the best-performing template variant → append experiment log entry → open PR with the updated log.
- **Kill criteria:** if 4 consecutive runs produce 0 replies across ≥20 sends, the loop must recommend changing the offer/hook, not produce more volume.
- **Templates:** docs/social/scary-security-email-outreach-template.md (variants A/B/DM).
- **Offer:** docs/AI-APP-SAFETY-AUDIT.md ($500 Triage Scan / $2,500 Safety Audit).

## Experiment log

### 2026-07-14 — run 0 (manual bootstrap, this session)
- **Hypothesis:** "scary security email triage" hook meets founders at a moment of fear and outperforms a generic audit pitch.
- **Actions taken:** LinkedIn post published (live: https://www.linkedin.com/feed/update/urn:li:share:7482822852161908736) with first-comment CTA (cal.com + repo). Outreach template with 3 variants merged to main (PR #361). Audit offer doc updated with Triage Scan positioning.
- **Metrics at start:** replies 0, booked calls 0, sends 0 (baseline; no outreach sent with this hook yet). Post-publish note: LinkedIn "Most relevant" view initially hides the CTA comment; body says "details in first comment" to compensate.
- **Next run should:** source first 5–10 prospects (GitHub "Trust Center"/"security violation" issue threads, HN Algolia "was I breached"/security-email posts), enrich via Apollo, create variant-A drafts for prospects with a public security mention, variant-B otherwise. Measure post impressions as a leading indicator.

### 2026-07-14 — run 1
- **Hypothesis (carried from run 0):** "scary security email triage" hook meets founders at a moment of fear and outperforms a generic audit pitch.
- **Metrics measured (objective, via Gmail search):**
  - Replies to outreach: **0** — no threads exist yet for this campaign because run 0 sent zero outreach (only the LinkedIn post + template merge happened).
  - Booked calls (cal.com): **0** — searched `from:cal.com OR subject:(New booking) OR subject:(booking confirmed)`; the only hits were unrelated Upwork/Viator/Kiwi.com bookings.
  - Sends completed from last run: **0** — run 0 created no drafts, so there was nothing to check as "left the Drafts folder."
  - LinkedIn post impressions: **unmeasured** (no LinkedIn API/MCP access this run).
  - GitHub repo traffic: **unmeasured** (no traffic-endpoint access this run).
- **Learn:** Zero sends so far means the reply/booking metrics can't be evaluated yet — kill-criteria (4 consecutive 0-reply runs across ≥20 sends) doesn't apply until sends actually happen. The real finding this run is a **sourcing-channel outage**: the GitHub Search API is unavailable from this environment for anything outside the `mac-yolo-safeguards` repo — `curl https://api.github.com/search/issues...` and `GET /orgs/{org}`/`GET /repos/{owner}/{repo}` all return "session bound to configured repositories" / "access not enabled." This blocks the "GitHub issues/discussions search" sourcing channel entirely; only HN Algolia was usable this run. Next run should try `WebSearch`/`WebFetch` against `github.com` search UI pages as a workaround, since the raw REST API path is closed.
- **Actions taken:**
  - Sourced prospects via HN Algolia only (`hn.algolia.com/api/v1/search` and `search_by_date`), across ~20 queries: Snowflake/Supabase/AWS security-alert language, "was I breached," vibe-coding hack/leak stories, Ask-HN agent-security threads, and Show-HN security-tool launches.
  - Screened ~25 HN candidates; cross-checked identity via HN user profiles, linked GitHub/personal sites, and Apollo (`apollo_mixed_people_api_search` + `apollo_people_match`). Most candidates were **security-tool builders responding to the same fear** (competitor-adjacent) rather than buyers, or had no verifiable email in Apollo — skipped per the "no guessed addresses" rule: Ashish Patil (Guardian Runtime, no Apollo email), natechensan/"Nate" (ClawCare, no public email), liulanggoukk ($300 Gemini API-key-leak story, no identifiable real name/email), Rodrigo Tari (Supashield CLI), xyborg (SupaExplorer leak scanner), why_prem (Pincer-MCP/Vouchly — Apollo search returned unrelated companies), helpful_human (Sieve secret scanner — App Store developer name didn't match the linked GitHub site, identity too ambiguous to trust).
  - 3 prospects cleared both bars (real public security-relevant post + Apollo-verified or self-disclosed email):
    1. **Hsinho Yeh** — Founder & CEO, Footprint-AI — [HN: cryptominer found via CVE-2025-29927 Next.js middleware bypass, root cause was an AI-pinned vulnerable dependency in a vibe-coded app](https://news.ycombinator.com/item?id=47387054) — variant A, personalized to his specific incident.
    2. **Hang Huang** — Co-Founder & CEO, InsForge (YC P26) — [Show HN: InsForge, open-source "Heroku for AI coding agents"](https://news.ycombinator.com/item?id=48181342) — variant B (general ICP: ships agent-native infra, will hit the same provider alerts).
    3. **Jonathan Rogivue** — CTO / technical partner across multiple startups — [Ask HN: AI Agent and harness containerization/security recommendations](https://news.ycombinator.com/item?id=48899674) — hybrid: variant-A-style personalized opener referencing his specific Ask HN post, variant-B pitch body (he described a general worry, not a specific alert/breach).
  - Created 3 Gmail drafts (unsent, `{{cal_link}}` filled with https://cal.com/igor-g-kvqxfo/30min). Igor reviews and sends.
- **Next run should:**
  1. Once Igor sends these 3 drafts, search Gmail replies/threads scoped to `footprint-ai.com`, `insforge.dev`, and `cambria-labs.com` to measure real reply/booking metrics.
  2. Work around the GitHub Search API outage — try `WebSearch`/`WebFetch` against github.com's web search UI instead of the REST API, since raw `api.github.com` calls are blocked outside this repo in this environment.
  3. This run landed below the 5–10 prospect target (3) because most HN-sourced candidates were unpaid tool-builders without a verifiable email rather than buyers — next run should widen HN queries to founder-describes-own-incident stories specifically (not "I built a scanner because...") to raise the qualified-prospect yield.

### 2026-07-19 — directive: Phase-0 dashboard-wedge demand test (Igor-approved)

**Decision:** NO dashboard product code is built until a strict buyer-pull gate is met.
The next revenue-loop runs double as the demand test. Full plan:
`docs/PHASE0-DASHBOARD-WEDGE-DEMAND-TEST.md`.

- **Lead the Agent Reliability Diagnostic ($499) / Hardening Sprint ($1,500) outreach with
  this outcome line** (Igor's words — the outcome we already own):
  > Stop runaway AI-agent loops, unsafe terminal actions, and silent failures before they
  > burn budget or damage a repository — from your phone.
  Do NOT pitch a "dashboard subscription." Sell the existing outcome; the dashboard is a
  possible later product.
- **Watch two live prospects for the dashboard pull signal** (both sourced from GitHub
  issues that describe it): `webai — David Stout` (ragentop #24, "kill switch for runaway
  agent sessions") and `2389 — Harper Reed` (coven-gateway #67, "in-flight requests that
  cannot be cancelled"). Log any request for continuous monitoring / remote intervention.
- **Build/kill gate (real payment is the only strong signal):** BUILD only if ALL of —
  (1) ≥3 qualified buyer conversations, (2) ≥1 PAID $499 diagnostic cleared, (3) ≥2 buyers
  explicitly request continuous monitoring or remote intervention. One reply or an LOI is
  too weak and does NOT count. KILL the dashboard idea if two message/segment iterations
  produce no paid diagnostic.
- **Not the wedge:** EU AI Act compliance (Digital Omnibus moved Annex III high-risk to
  Dec 2 2027 / Annex I to Aug 2 2028; coding assistants aren't high-risk under Article 6) —
  a later enterprise segment only, never the 2026 opener.
- **Durability note:** position on local models + metered provider APIs, never third-party
  OAuth into Claude Pro/Max subscription quotas (Apr 4 2026 wrapper ban).
- Human sends only — the loop never sends outreach itself.
