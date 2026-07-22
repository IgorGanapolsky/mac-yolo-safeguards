# WorkOS production + hard $10/month spend cap

**Owner rule (2026-07-22):** ThumbGate public auth is **WorkOS Production**, and
WorkOS spend must stay **≤ $10/month**. Exceeding the cap is a policy failure.

## Live topology (cut over 2026-07-22)

| Item | Production (required) | Forbidden for public traffic |
|------|----------------------|------------------------------|
| Environment | WorkOS **Production** | Staging |
| Client ID | `client_01KY0306CYDV6QSXE43QKM2ZXW` | Staging `client_01KY0305…` |
| AuthKit host | `progressive-mouse-13.authkit.app` | `*-staging.authkit.app` |
| Redirect URI | `https://thumbgate.app/api/auth/callback` | localhost / missing |
| Worker secrets | `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, `WORKOS_REDIRECT_URI` on `hermes-control-plane` | `sk_test_…` keys on public site |

Verify anytime:

```bash
# Login must use production client + non-staging AuthKit
curl -sI https://thumbgate.app/api/auth/login | tr -d '\r' | grep -i location
# Follow redirects: final host must be progressive-mouse-13.authkit.app (or a future
# production AuthKit host), never *staging*.authkit.app
node tools/workos-production-guard.js
```

## What is allowed under $10/mo

Use **AuthKit User Management only** (hosted login UI + social/email methods):

- Email + password (enabled in Production)
- Free social OAuth when using **your own** Google/Apple/etc. developer apps (Google Cloud / Apple Developer) — no WorkOS per-connection enterprise fee
- Low MAU AuthKit usage (current scale is far below paid enterprise products)

## What is forbidden (will blow past $10/mo)

| Product / toggle | Why |
|------------------|-----|
| **Custom AuthKit / email domains** | WorkOS lists **~$99/month** for all custom domains — **never enable** under this cap |
| **Enterprise SSO connections** (Okta, Entra, etc.) | Billed per connection; keep connection count **0** |
| **Directory Sync** | Paid enterprise product — do not enable |
| **Radar / paid add-ons** without explicit budget | Not covered by $10 cap |
| Running **public traffic on Staging** | Wrong environment; also blocks real custom-domain path |

Enterprise SSO *toggle* may appear “Enabled” in AuthKit with **zero** connections — that is OK only while **Active connections = 0**. Adding any connection is a spend-cap violation unless the monthly budget is raised in writing.

## Cost ops (monthly)

1. WorkOS Dashboard → Production → billing/usage: confirm projected spend **≤ $10**.
2. Domains page: custom domains must remain **not purchased**.
3. Authentication → Providers: prefer own OAuth apps over long-term demo shortcuts.
4. Run `node tools/workos-production-guard.js` in CI/watchdog (public checks only).

## Incident: public site on staging (fixed)

Public `thumbgate.app` previously authorized with staging client
`client_01KY0305…` → `spectacular-camp-67-staging.authkit.app`.

**Fix applied:** Production API key + client id + redirect URI uploaded to
Cloudflare Worker secrets; Production app redirect URI set to
`https://thumbgate.app/api/auth/callback`; Email+Password enabled; live login
chain ends on `progressive-mouse-13.authkit.app`.

## Secrets hygiene

- Never commit WorkOS API keys.
- Rotate any key that appeared in chat, screenshots, or agent logs.
- Prefer `wrangler secret put` on Worker `hermes-control-plane`.
