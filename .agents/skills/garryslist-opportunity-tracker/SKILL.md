---
name: garryslist-opportunity-tracker
description: >
  Garry's List (garryslist.org) continuous intel + membership engage pipeline.
  Site is a California builder/civic publication (501c4), not a gig marketplace.
  Scrape public posts, score AI/tech high-value, stage comments/articles.
  Login: Google SSO Igor's personal Gmail; LinkedIn verify for membership.
  Trigger: garryslist, Garry's List, garryslist.org, scrape garry, engage garry.
---

# Garry's List continuous ops

## Truth

- **URL:** https://garryslist.org/
- **What:** Builder-lens California civic + tech journalism + membership forum
- **Not:** Craigslist-style marketplace
- **Account:** Igor Ganapolsky (`iganapolsky`) via Google SSO; LinkedIn connected
- **Membership:** application submitted 2026-08-12 — pending Garry approval before comments/publish

## Commands

```bash
node tools/garryslist-continuous-ops.js cycle --json
node tools/garryslist-continuous-ops.js scrape --json
node tools/garryslist-continuous-ops.js status --json
```

**LaunchAgent:** `com.igor.garryslist-continuous` (every 6h)  
**State:** `~/.hermes-garryslist/`  
**Docs:** `docs/GARRYSLIST-CONTINUOUS-20260812.md`

## Engage policy

| NEVER | ALWAYS |
|-------|--------|
| Auto-comment from cron before membership | Stage drafts only |
| Spam product links on crime/housing threads | Value-first on AI/tech threads |
| Fake traction / false affiliation | Honest AfterHours Ops + builder AI ops |
| Double-post | Ledger every live URL |

## Money angles

- AI/tech posts → builder multi-agent credibility
- Small business → AHLS $149 audits
- Membership publish → longform when approved

## Related

- BrowserOS neo for login-walled flows
- `never-double-post`, ECI ThumbGate wall for paid pilot GTM
