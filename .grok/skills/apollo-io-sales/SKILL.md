---
name: apollo-io-sales
description: >
  Use Apollo.io for sales contact discovery and email enrichment on Igor's Mac.
  CLI: /opt/homebrew/bin/apollo (apollo-io-cli), already authenticated. Trigger when:
  make money, outreach, prospects, enrich email, find founder email, no public email,
  pipeline send, Partner Pilot, cold call, leads, Apollo, or when tempted to give up
  because leads.csv says "no public email." Slash: /apollo-io-sales. NEVER skip Apollo
  when money depends on a real inbox.
---

# Apollo.io sales enrichment (mandatory for cash outreach)

**Hard lesson (2026-07-14):** Agent said MindFort/Puntt had "no public email" and stopped. Apollo CLI was installed, logged in, and had **2k+ lead credits**. User had to ask "are you using Apollo?" — that is a directive breach.

## Preconditions (run every money session)

```bash
which apollo   # expect /opt/homebrew/bin/apollo
apollo auth whoami
apollo usage credits
```

If `whoami` fails: open Chrome tab `https://app.apollo.io` (usually already logged in) and `apollo auth login` — do **not** ask Igor for an API key first. Chrome is often already on Apollo (see drive-logged-in-chrome).

## Default workflow (before any "can't email them")

1. **Domain people search** for company founders/C-suite:
   ```bash
   apollo people search --domain mindfort.ai --seniority founder c_suite --per-page 5 -f json
   ```
2. For each person with `has_email: true`, **reveal email** (consumes credits — worth it for $499–$3k offers):
   ```bash
   apollo people email --id <APOLLO_PERSON_ID> -f json
   ```
3. Prefer `email_status: verified`. Log privately under `business_os/revenue/apollo-enrichment-YYYY-MM-DD.md` (gitignored ops — do not commit PII to public git).
4. **Send** via Gmail MCP (not Apollo sequences unless user asked for sequences).
5. **pipeline-update.js** note: `Apollo: emailed X@Y (verified)`.

## Useful commands

| Goal | Command |
|------|---------|
| Search people | `apollo people search --domain <co.com> --seniority founder c_suite -f json` |
| Keyword | `apollo people search -q "Name Here" -f json` |
| Reveal email | `apollo people email --id <id> -f json` |
| Enrich by name+domain | `apollo people enrich --name "Jane Doe" --domain acme.com -f json` |
| Credits | `apollo usage credits` |
| Auth | `apollo auth whoami` / `apollo auth login` |

## When Apollo is mandatory

- Pipeline stage `sent`/`ready` with next_action needing contact and leads.csv has no email
- User says make money / outreach / follow up / "do everything"
- Partner Pilot / diagnostic / hardening closes
- "No public email" is about to leave your mouth

## When not to burn credits

- Prospect already has a verified working email in leads.csv (still OK to verify once)
- Domain NXDOMAIN bounce (e.g. asquaredgames.com) — mark lost; don't re-mail same bad To:
- Direct dial: credits often exhausted; **email first**

## Anti-patterns

- Skipping Apollo and declaring "no email" from GitHub/HN only
- Putting revealed emails into **public** git files
- Using Playwright for Apollo when CLI already works
- Building more lead scrapers instead of `apollo people email`

## Pair with

- `execute-revenue-cash-path` — full funnel + send
- `drive-logged-in-chrome` — Stripe live payment links
- `diagnose-revenue-funnel` — bottleneck stage
- Gmail MCP for send; `tools/pipeline-update.js` for state
