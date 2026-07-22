---
name: drive-logged-in-chrome
description: >
  ONLY when Igor explicitly asks for Chrome UI in that same message (see AGENTS.md § No desktop hijack).
  Otherwise use Stripe CLI, Play API, ASC API, gh. Legacy AppleScript path for login-walled dashboards
  when CLI/API cannot work AND HERMES_ALLOW_INTERACTIVE_CHROME=1. NEVER use Playwright MCP as login truth.
  Slash: /drive-logged-in-chrome. Cross-ref: use-existing-browser-sessions (same explicit-ask gate).
---

# Drive logged-in Google Chrome (not Playwright)

> **BANNED BY DEFAULT (2026-07-22):** Do not use this skill unless Igor explicitly asked to drive his interactive Chrome in **that same message** and you set `HERMES_ALLOW_INTERACTIVE_CHROME=1`. Prefer CLI/API — see [AGENTS.md](../../../AGENTS.md) § No desktop hijack and [docs/NO-DESKTOP-HIJACK.md](../../../docs/NO-DESKTOP-HIJACK.md).

**Hard lesson (2026-07-14):** Playwright MCP navigated to Stripe and saw **login**. Igor's Chrome was already open on **Payment Links – ThumbGate** (`acct_1RNcJ1GGBpd520QY`). Agents who trust Playwright alone invent "blocked / need login" theater.

## Decision tree

```
Need auth-walled site?
  1. osascript: list Chrome tabs for stripe / apollo / target domain
  2. If tab exists → activate that tab (inherits session)
  3. If not → open URL in existing Chrome window (same profile, inherits cookies)
  4. Drive via: AppleScript `execute active tab javascript "..."`  OR Chrome CDP if 9222 up
  5. ONLY if Chrome has no session (screenshot/login form on REAL Chrome) → for ASC, run
     `bash .cursor/skills/ingest-chat-credentials/scripts/ensure-asc-session.sh` (session → `.p8` API →
     Keychain/`asc-apple-id-password.sh` piped into System Events). Never ask Igor for the password.
```

**Playwright is OK for:** public pages, form scrapes that don't need Igor's cookies.  
**Playwright is NOT OK for:** "prove we're logged into Stripe/Apollo/Play/LinkedIn."

## Stripe (ThumbGate) — cash path

| Item | Value |
|------|--------|
| Account | ThumbGate `acct_1RNcJ1GGBpd520QY` |
| Payment Links list | `https://dashboard.stripe.com/acct_1RNcJ1GGBpd520QY/payment-links` |
| Offer map (private) | `business_os/revenue/stripe-offer-map-*.tsv` |

### Live link recovery (do this BEFORE claiming mid-tier pay links are dead)

1. Activate Chrome tab matching `dashboard.stripe.com` + `payment-links`.
2. JS-scan rows for product names / amounts ($499, $1,500, $3,000).
3. Open each `plink_…` detail URL; extract `https://buy.stripe.com/…` from page text.
4. `curl -L -o /dev/null -w '%{http_code}'` each URL — require **200**.
5. Write verified URLs into the private stripe offer map (`status=ready`). Never leave placeholders like `buy.stripe.com/Diagnostic` (those 403).

Known good product names on Dashboard (as of 2026-07-14):

- **$499** → "AI Agent Reliability Audit" (map as Agent Reliability Diagnostic)
- **$1,500** → "AI Performance Marketing Audit (1hr Report)" (map as Hardening Sprint — amount match)
- **$3,000** → "Partner Pilot (Full)"

## AppleScript snippets

### List auth tabs

```applescript
tell application "Google Chrome"
  set out to ""
  repeat with w in windows
    repeat with t in tabs of w
      set u to URL of t
      if u contains "stripe" or u contains "apollo" or u contains "linkedin" then
        set out to out & u & " | " & (title of t) & linefeed
      end if
    end repeat
  end repeat
  return out
end tell
```

### Activate Stripe Payment Links tab

```applescript
tell application "Google Chrome"
  activate
  repeat with w in windows
    set i to 0
    repeat with t in tabs of w
      set i to i + 1
      if (URL of t) contains "dashboard.stripe.com" and (URL of t) contains "payment-links" then
        set active tab index of w to i
        set index of w to 1
        return URL of t
      end if
    end repeat
  end repeat
end tell
```

### Execute JS in active tab

```bash
osascript -e 'tell application "Google Chrome" to execute active tab of front window javascript "(() => { return document.title; })()"'
```

### Extract buy.stripe.com from payment-link detail page

```javascript
(() => {
  const m = document.body.innerText.match(/https:\/\/buy\.stripe\.com\/[A-Za-z0-9]+/g) || [];
  return JSON.stringify({ url: location.href, buy: [...new Set(m)] });
})()
```

## Anti-patterns (directive breach)

- Claiming "Stripe needs login" after only Playwright saw `/login`.
- Asking Igor to "open Stripe and paste the link" when Chrome already has the dashboard.
- Writing `buy.stripe.com/Diagnostic` style placeholders into the offer map.
- Storing Stripe secret keys in skills/repo/chat.

## Self-check before saying "blocked on auth"

- [ ] Listed real Chrome tabs for the domain?
- [ ] Tried open-in-existing-Chrome (not Playwright)?
- [ ] Extracted buy links + curl 200?
- [ ] Updated private offer map?
