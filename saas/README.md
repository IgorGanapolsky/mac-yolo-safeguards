# Hermes SaaS transport prototype — superseded by the public control plane

> Historical prototype from PR #601. Its localhost harness is useful transport evidence,
> but it is not the production service: it uses in-memory state, query-string bearer
> tokens, fixture sessions, and a stub VPS. The canonical implementation is
> `apps/hermes-control-plane`, `tools/hermes-cloud-connector.js`, and
> `services/hermes-cloud-runner`.

The prototype target. A paying user opens a **browser** (no Tailscale, no VPN, no port
config), signs in, and sees/continues their agent sessions. Their Mac dials OUT to your
relay; when their Mac is offline, the relay serves from a VPS. The localhost transport
harness passes `tests/test-saas-relay-connector.sh` (6/6); it does not prove production
SSO, billing, TLS, durable tenancy, or a real cloud model execution.

## The three pieces

1. **`saas/relay.js`** — runs on your cheap VPS. The broker: issues pairing codes, holds
   the connectors' outbound connections, routes browser requests to the right user's Mac,
   and fails over to a VPS Hermes instance when a user's Mac is offline. Dependency-free.
2. **`saas/connector.js`** — the one thing the customer installs (one command). Dials OUT
   to your relay over 443, reads their local `~/.claude` sessions, answers routed
   requests. No inbound ports. This is what makes "no Tailscale" true.
3. **Web app + SSO + billing** (next module) — the marketing site, Google/Apple sign-in,
   Stripe subscription. These wrap the relay: SSO decides which `accountId` may pair;
   Stripe decides who's a paying subscriber. Commodity; the hard transport above is done.

## Do you need a domain? Yes — one, ~$12/year

Buy one domain (Cloudflare Registrar = at-cost, or Namecheap). Point `relay.yourdomain.com`
and `app.yourdomain.com` at your VPS / web host. That's the only mandatory purchase to go live.

## Where/how to host — cheapest that works

| Piece | Host | Cost |
|---|---|---|
| Relay + VPS-fallback Hermes | **1 small VPS** — Hetzner CX22 (2 vCPU/4GB) or DigitalOcean/Vultr $6 | **€4–6/mo** |
| Web app (marketing + dashboard UI) | **Vercel / Cloudflare Pages free tier** | **$0** to start |
| Auth (Google + Apple SSO) | WorkOS AuthKit or Clerk free tier (Apple $99/yr dev program) | **$0 + $99/yr Apple** |
| Billing | Stripe | **% of revenue only** |
| Domain | Cloudflare Registrar | **~$12/yr** |
| TLS | Caddy on the VPS (auto Let's Encrypt) or Cloudflare | **$0** |

**Total to launch: ≈ $5–6/mo + ~$110/yr (domain + Apple).** One €5 Hetzner box runs both
the relay and the fallback Hermes instance at early scale. The margin is exactly your point:
charge, say, $15–25/mo per seat; your marginal cost per user is pennies until you're big.

## Deploy the relay (on the VPS)

```bash
# on the VPS (Ubuntu):
sudo apt install -y nodejs
git clone <your repo> && cd mac-yolo-safeguards
# run the relay (put Caddy or Cloudflare in front for TLS on 443):
RELAY_PORT=9099 RELAY_VPS_FALLBACK_URL=http://127.0.0.1:4010 node saas/relay.js
# RELAY_VPS_FALLBACK_URL points at a Hermes/LiteLLM gateway ALSO running on the VPS,
# so offline users still get service.
```

Front it with Caddy for automatic HTTPS:
```
relay.yourdomain.com { reverse_proxy 127.0.0.1:9099 }
```

## What the customer does (the whole onboarding)

1. Sign in on `app.yourdomain.com` (Google/Apple), subscribe (Stripe).
2. The site shows a pairing code. On their Mac, once:
   `RELAY_URL=https://relay.yourdomain.com node saas/connector.js pair AB12-CD34`
3. Then run it as a daemon (launchd, one-liner installer we ship):
   `RELAY_URL=https://relay.yourdomain.com node saas/connector.js run`
4. Done. They use the browser from anywhere. Laptop asleep? The relay serves from the VPS.

## What's built vs. what needs you

- **Built + tested:** relay, connector, pairing, browser-reads-local-via-relay, offline→VPS
  failover. The genuinely hard part.
- **Needs you (spend/accounts, can't do autonomously):** buy the domain; spin up the VPS;
  create WorkOS/Clerk + Stripe + Apple-dev accounts (free tiers) and drop their keys in.
- **Next module I build once you have those:** the Next.js marketing+dashboard site with
  SSO + Stripe gating wired to this relay, and the one-line connector installer.
