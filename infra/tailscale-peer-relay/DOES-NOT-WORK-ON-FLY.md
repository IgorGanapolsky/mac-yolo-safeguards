# ⚠️ This Fly.io approach DOES NOT WORK — kept as reference only

Verified 2026-07-14 across 3 iterations (userspace→kernel TUN, shared→dedicated
IPv4, explicit /dev/net/tun): a Tailscale peer relay on Fly.io reports
`Self Endpoints: None` and is therefore **never reachable for relaying**.

**Root cause:** Fly.io's UDP proxy breaks the symmetric ip:port mapping that
Tailscale's STUN-based endpoint discovery relies on. The node joins the tailnet
and `RelayServerPort` is set correctly, but it advertises no reachable UDP
endpoint, so peers can never send relayed traffic to it.

The Fly app was destroyed (no ongoing cost).

## What actually works
A Tailscale peer relay needs a host with a **real public IP and direct UDP**
(no proxy in front of the WireGuard port):
- A plain VPS: DigitalOcean / Hetzner / Vultr (~$4-6/mo), or
- GCE / EC2 e2-micro-class instance with an external IP (free-tier eligible),
  running `tailscaled` bound directly to the public interface, then
  `tailscale set --relay-server-port=41641` + the `tailscale.com/cap/relay`
  ACL grant (the tagOwners + grant added to the tailnet policy 2026-07-14 are
  still valid and reusable for any such host).

## Meanwhile, the working mitigation (no relay needed)
- `tailscale-path-keeper` (both Macs) re-punches the direct path when it decays.
- Miami DERP region disabled in the tailnet policy → fallback is now iad
  (~115ms) instead of mia (300ms-1.9s).
- The real permanent fix is **end-to-end IPv6** (free): enable IPv6 on the
  TP-Link Deco + S25 hotspot so Tailscale holds direct paths with no relay at
  all. See docs/RESEARCH-CGNAT-REMOTE-ACCESS-2026-07.md.
