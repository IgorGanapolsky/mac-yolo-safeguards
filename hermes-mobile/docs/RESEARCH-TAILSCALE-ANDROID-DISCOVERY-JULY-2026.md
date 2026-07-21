# Research: Tailscale Android discovery (July 2026)

**Run id:** `trun_14d4d9dfad7c40989905924ccc707cd0`  
**Interaction id:** `trun_14d4d9dfad7c40989905924ccc707cd0`  
**Date:** 2026-07-21  
**Scope:** Why Hermes Mobile shows “Tailscale is off” / missing peers on cellular; map to product code; no secrets.

## Verdict (Hermes Mobile)

Hermes does **not** auto-enumerate the full Tailscale peer list via LocalAPI (Android LocalAPI is in-process to `com.tailscale.ipn` and is not exposed cross-app). Discovery is **probe-based**: pair/USB embeds `tailnet=` hosts, the app stores them, then probes `:8642/health`.

Two concrete failure modes hit dogfood on 2026-07-21 (S25, 5G, VPN key icon lit):

| Symptom | Root cause | Fix in this change |
|--------|------------|--------------------|
| Banner **“Tailscale is off on this phone”** while system VPN key is on | `GatewayContext` used `NetInfo.type === 'vpn'`. Samsung keeps `type=cellular` even with `tun0` `100.x` up. | Multi-signal `tailscaleVpnDetect` + reachability override after a successful Tailscale host probe; preflight before `probing=true` so picker copy does not flash false-off |
| Only one Mac / **Cannot reach** on MagicDNS | Stale MagicDNS node (bare name offline for weeks) vs live `*-1` rename / CGNAT IP; probe list not expanded | `expandTailnetProbeHosts` adds bare ↔ `-1` MagicDNS siblings; prefer probing stored CGNAT IPs alongside names |
| Mini missing from picker | Never in phone probe list / saved profiles (not a Tailscale ACL block — phone `curl` to both Macs `:8642/health` → 200) | Expansion + re-pair seeding; Find computers probes expanded hosts |

Live evidence (same session, no secrets): phone `tun0` in Tailscale CGNAT; Tailscale Android `1.98.8`; both fleet Macs `/health` 200 from phone shell over Tailscale; `adb reverse` 8642/8765 present; Mac-side discover script `--json` returns both Hermes gateways.

## Deep research summary (July 2026)

Source: Parallel deep research `trun_14d4d9dfad7c40989905924ccc707cd0` (full markdown under local `/tmp/ts-android-discovery-202607.md` for the authoring session).

1. **VpnService exclusivity** — Only one VPN owns the Android VPN slot. Key icon means *some* VPN is up, not necessarily Tailscale UI toggle accuracy ([tailscale#818](https://github.com/tailscale/tailscale/issues/818), [#17190](https://github.com/tailscale/tailscale/issues/17190)).
2. **Detection without SDK** — Prefer `NetworkCapabilities.TRANSPORT_VPN`, CGNAT `100.64/10` presence, and reachability to known `100.x` / `*.ts.net` hosts. Do **not** scrape Tailscale LocalAPI tokens cross-app.
3. **MagicDNS on cellular** — When the tunnel is half-up, `*.ts.net` falls back to carrier DNS (NXDOMAIN / wrong answers). Prefer CGNAT IPs for chat URLs when available.
4. **Peer API** — Desktop `tailscale status --json` / LocalAPI peer lists are the Mac-side seed (`tools/hermes-discover-tailscale-macs.js`). Phone cannot call that API; it must be seeded at pair time and refreshed via pair-server `tailnetProbeHosts`.
5. **ACLs / subnet routers** — Can hide peers or block `:8642`; not the 2026-07-21 failure (phone reached both gateways).
6. **Battery / Doze** — Always-on + OEM killers can drop the tunnel; separate from false NetInfo detection.

## Hermes implementation map

| Concern | Code |
|--------|------|
| VPN-on flag for picker copy | `GatewayContext` → `tailscaleVpnActive` → `computerPickerStatus` |
| Detection helper | `src/utils/tailscaleVpnDetect.ts` |
| Probe host expansion | `src/utils/tailnetProbeExpand.ts` |
| Probe /health | `src/services/tailscaleDiscovery.ts` |
| Mac-side peer seed | `tools/hermes-discover-tailscale-macs.js` |
| USB same-machine handoff | `src/utils/usbTransportHandoff.ts` (coord; unchanged here) |

## Honesty / RAG notes

- Do not treat “probe in flight” as VPN-on (2026-07-18 lesson).
- Do not claim Connected from `/health` alone — chat needs authenticated `/api/sessions`.
- Auto-discovery of *all* tailnet devices without pair seeds is **not** available to third-party Android apps in July 2026 without embedding Tailscale or a custom coordination channel.

## Checklist for agents

1. Prove phone tunnel: `adb shell ip -4 addr` shows `tun0` `100.x`, or phone can `curl` a Mac `100.x:8642/health`.
2. Prove Macs: `tailscale status` + discover script `--json`.
3. Prefer CGNAT URLs in profiles when MagicDNS renames nodes (`*-1`).
4. Never ship “fixed” without picker UI proof after OTA/reload.
