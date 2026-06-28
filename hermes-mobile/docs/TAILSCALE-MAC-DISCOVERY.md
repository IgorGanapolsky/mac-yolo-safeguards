# Tailscale Mac discovery

Hermes Mobile can discover other Hermes Macs on your tailnet without hardcoding IPs.

## Phone app

1. During USB pairing, `tools/hermes-mobile-pair.js` runs `tools/hermes-discover-tailscale-macs.js` and embeds **all tailnet peer hosts** (plus any Hermes-responding hosts) in the `hermes://setup` deep link (`tailnet=` params).
2. The app stores those probe hosts and re-checks `:8642/health` on Settings load, after local network search, and after health refresh.
3. When a new computer responds, Settings and the Chat connection panel show **Mac reachable on Tailscale** with an **Add {hostname}** chip (fallback if auto-add has not run yet).
4. On bootstrap and whenever tailnet hosts are probed, healthy Tailscale gateways are **auto-saved** as computer profiles (Switch computer lists them immediately).
5. USB pairing embeds Mac mini on Tailscale as `extraUrl` when discoverable, plus `tailnet=` probe hosts.
6. Saved profiles using `100.x.x.x` or `*.ts.net` show route label **Tailscale** in the computer picker.

## MacBook (pairing host)

```bash
node tools/hermes-mobile-pair.js
node tools/hermes-discover-tailscale-macs.js --json
```

## Mac mini (optional pair server)

Pair server `:8765` is optional for QR/LAN onboarding. On the mini, start Hermes gateway (`:8642`) and optionally:

```bash
cd /path/to/mac-yolo-safeguards
node tools/hermes-mobile-pair.js --server-only
```

Tailscale discovery does not require the pair server — only `/health` on `:8642`.
