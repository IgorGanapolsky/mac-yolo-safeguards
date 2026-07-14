# Tailscale peer relay (Fly.io)

Permanent low-latency fallback path between the two CGNAT'd Macs (mini on
T-Mobile Home Internet, MacBook on S25 hotspot). When a direct WireGuard path
can't hold, Tailscale clients (v1.86+) use this relay **before** the far-away
DERP fallback — preference order: direct > peer relay > DERP.

Deployed 2026-07-14: app `hermes-peer-relay`, region `ewr` (Secaucus NJ),
node `fly-peer-relay-ewr` (tag:relay), RelayServerPort 41641.

## Tailnet policy prerequisites (already applied)
- `tagOwners`: `"tag:relay": ["autogroup:admin"]`
- grant: `{"src":["autogroup:member"],"dst":["tag:relay"],"app":{"tailscale.com/cap/relay":[{}]}}`

## Redeploy
    flyctl deploy --app hermes-peer-relay --ha=false
Auth key is a Fly secret (TS_AUTHKEY); reusable, tagged tag:relay, 90-day expiry.
Rotate: generate a new tagged auth key, `printf 'TS_AUTHKEY=%s\n' <key> | flyctl secrets import --app hermes-peer-relay`.

## Verify it's relaying
    flyctl ssh console --app hermes-peer-relay -C "tailscale --socket=/var/run/tailscale/tailscaled.sock debug prefs" | grep RelayServerPort

## Cost
shared-cpu-1x / 256MB always-on ≈ $2/mo + 1GB volume. Destroy: `flyctl apps destroy hermes-peer-relay`.
