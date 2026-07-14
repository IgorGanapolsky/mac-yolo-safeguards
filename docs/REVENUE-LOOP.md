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
