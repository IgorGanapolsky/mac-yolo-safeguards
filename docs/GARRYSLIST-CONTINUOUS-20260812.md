# Garry's List continuous ops (2026-08-12)

**Site:** https://garryslist.org/  
**What it is:** California builder/civic 501(c)(4) publication + membership community (Garry Tan orbit). **Not** a gig marketplace.

## Auth / membership (live)

| Step | Status |
|------|--------|
| Google SSO `iganapolsky@gmail.com` | Logged in as **Igor Ganapolsky** |
| LinkedIn verify (`ig5973700@gmail.com` Keychain) | **Connected** |
| Membership application | **Submitted 2026-08-12** — "You're in the Queue! Garry will be in touch" |
| Comment / publish | **Blocked until approved** |

Reply channel while pending: `apply@reply.garryslist.org`

## Continuous automation

```bash
node tools/garryslist-continuous-ops.js cycle --json
```

**LaunchAgent:** `com.igor.garryslist-continuous` — every 6 hours  
**State:** `~/.hermes-garryslist/` (`feed-latest.json`, `drafts/latest.json`, `ledger.jsonl`)  
**Vault:** `~/Documents/AI-Agent-Sync/Agent-State/garryslist-continuous.md`

### Policy (hard)

- Cron **stages drafts only** — no auto-comment spam
- After membership approval: max **2 value-first comments/day**, log live URLs in ledger
- Promo: AfterHours Ops / builder AI ops honesty; **no fake traction**; ECI wall on ThumbGate paid pilot GTM
- Never double-post

## Money path from this surface

| Content class | Angle |
|---------------|--------|
| AI / techno-optimism / gatekeepers / APIs | Builder multi-agent ops + memory-before-gen (credibility → clients) |
| Small business / red tape | After-Hours Leak Score $149 audits |
| Pure crime/housing politics | Intel only — low cash path |

## Manual engage when approved

1. Open top AI thread from `~/.hermes-garryslist/drafts/latest.json`
2. Paste staged comment (edit for tone)
3. Append ledger: `{event:"comment_live", url, ts}`
4. Article outlines: same drafts pack → publish when member write access exists
