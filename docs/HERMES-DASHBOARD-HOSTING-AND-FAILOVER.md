# Hermes Dashboard — hosting & offline failover

## Where it's hosted (today)

`tools/hermes-dashboard.js`, run as an always-on launchd service
(`com.igor.hermes-dashboard.plist`, KeepAlive) on the MacBook Pro. It binds
**`127.0.0.1:8787`** — local only. It reads `~/.claude/projects` session threads and
never phones home.

Three ways to reach it, cheapest first:
1. **This Mac:** http://127.0.0.1:8787
2. **Your phone / other devices (private):** Tailscale Serve publishes it to your tailnet
   only (authenticated devices, not the public internet):
   `tailscale serve --bg 8787` → reach it at `https://igors-macbook-pro.tail<...>.ts.net`.
3. **Public SaaS (the product):** NOT this local server. That is the multi-tenant website
   with Google/Apple SSO + Stripe + a pairing relay — architecture in the canonical doc
   `docs/RESEARCH-HERMES-PUBLIC-SAAS-ARCHITECTURE-2026-07.md` (Codex, PR #590). The local
   dashboard is the single-user prototype the SaaS UI will mirror.

## Offline failover — "keep working when the primary machine is offline"

The dashboard now resolves across a **priority-ordered list of Hermes instances** and
serves from the highest-priority one that answers its health check. When the primary
(local) goes offline, `active` automatically becomes the next healthy instance — no manual
switch.

- `GET /api/instances` — every instance with `up`/`active` status + an `allDown` flag.
- `GET /api/active` — the endpoint the relay/resume should target **right now** (503 if
  all are down, so nothing ever routes to a dead host).
- The header shows the chain: `local → mini → vps`, with the active one highlighted and
  offline ones struck through.

### Default chain
1. `local` — `http://127.0.0.1:4010` (LiteLLM gateway on this Mac)
2. `mini` — `http://100.94.135.78:11436` (Mac mini over Tailscale)
3. `vps` — only present if you configure one (below)

### Adding a VPS failover target (the one human step)

Provisioning a VPS costs money / needs an account, so that step is yours. Once you have a
Hermes instance running on a VPS with a `/health` endpoint:

    echo 'HERMES_FAILOVER_VPS_URL=https://your-vps.example.com' >> ~/.hermes/.env
    launchctl kickstart -k gui/$(id -u)/com.igor.hermes-dashboard

The dashboard reads that on restart, adds `vps` to the chain, and fails over to it when
both local and mini are offline. To fully customize the chain, set `HERMES_INSTANCES` to a
JSON array of `{label,kind,url,health}` instead.

**Recommended VPS shape:** a small always-on box (Fly.io machine, Hetzner, or a $5–10/mo
VPS) running the same Hermes/LiteLLM gateway, reachable over Tailscale or HTTPS. Because
it's last in priority, it only carries load when your Macs are both down — cheap insurance
that a session started on your laptop can keep running after the laptop sleeps.

Proven: with local + mini down, `/api/active` correctly switches to the VPS; with all down
it returns 503 rather than a dead endpoint. Tests: `tests/test-hermes-dashboard.sh` (19/19).
