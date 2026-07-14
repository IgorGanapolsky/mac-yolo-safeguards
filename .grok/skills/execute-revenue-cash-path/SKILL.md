---
name: execute-revenue-cash-path
description: >
  Execute the real cash path for mac-yolo-safeguards / ThumbGate: diagnose funnel,
  Apollo enrich, Gmail send, live Stripe links from Chrome, pipeline-update, never
  ship theater. Trigger when: make money, make money today, do everything, cash,
  revenue, sell, close, outreach, pipeline stuck, $0 revenue, Partner Pilot,
  diagnostic $499, hardening $1500, or when tempted to build another sales tool
  instead of sending. Slash: /execute-revenue-cash-path. Do NOT invoke for pure
  product engineering without a revenue ask.
---

# Execute the revenue cash path (do, don't scaffold)

**User directive (2026-07-14):** "i beg you. make money today" / "do everything" — execute outbound + payment infrastructure. **Do not** invent tools, mark `paid` without Stripe proof, or claim revenue without a ledger row.

## Session bootstrap (every time)

```bash
cd /Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards

# 1) Funnel truth (private data only — never *.example.tsv)
node tools/pipeline-data-science.js
node tools/payment-readiness.js
node tools/revenue-action-board.js 2>/dev/null | head -40
node tools/send-next.js

# 2) Apollo ready?
apollo auth whoami && apollo usage credits

# 3) Real Chrome has Stripe/Apollo?
osascript -e 'tell application "Google Chrome"
  set out to ""
  repeat with w in windows
    repeat with t in tabs of w
      set u to URL of t
      if u contains "stripe" or u contains "apollo" then set out to out & u & "\n"
    end repeat
  end repeat
  return out
end tell'
```

Then invoke sibling skills:

1. **diagnose-revenue-funnel** — name bottleneck stage  
2. **apollo-io-sales** — enrich missing emails  
3. **drive-logged-in-chrome** — recover live buy.stripe.com URLs if map has 403s  
4. Gmail MCP — send  
5. `pipeline-update.js` — record reality  

## Bottleneck → action map (anti-apparatus)

| Bottleneck | Do this | Do **not** |
|------------|---------|------------|
| Many `ready` | Send via Gmail/GH; Apollo if no email | Build more lead scrapers |
| `sent`, 0 replies | Follow-ups; check Gmail inbound; improve message | Another batch of 50 leads |
| Replied, not booked | Scope + CTA | New product features |
| Booked, not paid | **Live** Stripe link only (curl 200) | Fake `buy.stripe.com/Diagnostic` |
| No Stripe key in env | Drive **Chrome** Payment Links tab | "Need Stripe API key" as first reaction |

## Live payment links (verify every money day)

Private map: `business_os/revenue/stripe-offer-map-*.tsv`

```bash
# After Chrome scrape, always:
curl -sS -o /dev/null -w '%{http_code}\n' -L --max-time 12 'https://buy.stripe.com/…'
node tools/payment-readiness.js
```

Known ThumbGate live links (re-verify; do not trust forever without curl):

| Offer | Amount | Check Dashboard name |
|-------|--------|----------------------|
| Agent Reliability Diagnostic | $499 | AI Agent Reliability Audit |
| Hardening Sprint | $1,500 | AI Performance Marketing Audit (1hr Report) — amount match |
| Partner Pilot | $3,000 | Partner Pilot (Full) |

**Never send** payment URLs that return HTTP 403.

## Voice front door (after SpaceXAI / phone demos)

```bash
node tools/hermes-voice-front-door.js --event apply-pipeline --json \
  --pipeline business_os/revenue/pipeline-status-YYYY-MM-DD.tsv \
  --date YYYY-MM-DD \
  --signals-json '{...}'
# dry-run default; add --apply to write (create-if-missing seeds cold callers)
```

## Logging (private, gitignored)

- `business_os/revenue/agent-send-log-YYYY-MM-DD.md` — every email + GH comment + message ids  
- `business_os/revenue/apollo-enrichment-YYYY-MM-DD.md` — Apollo reveals  
- `business_os/revenue/stripe-live-links-YYYY-MM-DD.md` — curl-verified buy links  
- `business_os/revenue/money-priority-execution-YYYY-MM-DD.md` — daily board  

**Do not commit** buyer emails or Stripe secrets to the public repo.

## Honesty contract

- **Cleared revenue** = Stripe charge + `record-cleared-payment.js` / ledger row only.  
- Pipeline stage `paid` alone is **not** money.  
- "I sent N emails" is progress; it is **not** "we made money."  
- If blocked, name the **one** missing capability (e.g. inbound reply) — not a homework list of 12 logins.

## Self-check before claiming "done for money"

- [ ] Funnel stage counts shown?
- [ ] Apollo run for missing emails?
- [ ] Stripe links curl 200 and map updated?
- [ ] Sends logged with message ids?
- [ ] pipeline-update notes written?
- [ ] Did I avoid Playwright-as-auth-truth?
- [ ] Did I avoid building a new tool when the fix was send/enrich?
