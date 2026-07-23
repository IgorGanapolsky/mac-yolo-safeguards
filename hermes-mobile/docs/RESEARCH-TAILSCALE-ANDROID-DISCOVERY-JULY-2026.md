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
| Banner **“Tailscale is off on this phone”** while system VPN key is on | `GatewayContext` used `NetInfo.type === 'vpn'`. Samsung keeps `type=cellular` even with `tun0` `100.x` up. **Also (2026-07-23):** Samsung on home Wi‑Fi keeps `type=wifi` + LAN IP while tun0 `100.70.124.54` is Active — NetInfo never exposes the CGNAT address. | Multi-signal `tailscaleVpnDetect` + reachability override after a successful Tailscale host probe; preflight / scan-time `reachedTailscaleHostRef` flip; Choose-computer mid-scan never asserts “off” until proven; discoveries keep Add chips while scanning |
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

## Tailscale Admin API (`tailscale.com/docs/reference/tailscale-api` → `/api`)

**Verdict for Hermes Mobile / mac-yolo-safeguards: PARTIAL** — useful on Mac tooling, **not** a stranger-mobile path.

| Capability | Admin API (`api.tailscale.com` / OAuth / `tskey-api-*`) | Stranger-safe? | Hermes use |
|---|---|---|---|
| List devices / online peers | Yes (tailnet-scoped) | **No** — needs owner/admin credentials | Theater if baked into the app |
| Resolve MagicDNS | Indirect via device DNS names | **No** on phone without admin key | Prefer CGNAT IP + local expand |
| Auth keys / ephemeral nodes | Yes | **No** for end-user phones | Optional Mac fleet bootstrap only (keychain/env) |
| ACL / tags | Yes | **No** | Operator policy, not mobile client |
| Device posture | Yes (enterprise) | **No** | Out of scope |
| Webhooks | Yes | **No** for phone UX | Optional ops alerts only |
| Local peer status | `tailscale status --json` / LocalAPI on the device | **Yes** on Mac/desktop | `tools/hermes-discover-tailscale-macs.js` already seeds pair links |
| Android LocalAPI | In-process to `com.tailscale.ipn` only | **No** cross-app | Do not scrape; use NetInfo+CGNAT+reachability |

**What actually fixes Igor's pain (discovery stuck / cellular / “Tailscale off” / Find computers):**

1. Multi-signal Tailscale-on (`tailscaleVpnDetect`) — not Admin API.
2. MagicDNS sibling + probe-host expand (`tailnetProbeExpand`) — not Admin API.
3. Mac-side LocalCLI peer seed at pair time — already wired; never requires strangers to paste a tailnet API key.

**Do not build:** mobile client calling Admin API with Igor's (or any shared) tailnet key; “Find computers” that only works when a fleet admin OAuth client is embedded.

## Honesty / RAG notes

- Do not treat “probe in flight” as VPN-on (2026-07-18 lesson).
- Do not claim Connected from `/health` alone — chat needs authenticated `/api/sessions`.
- Auto-discovery of *all* tailnet devices without pair seeds is **not** available to third-party Android apps in July 2026 without embedding Tailscale or a custom coordination channel.
- Admin API credentials must never live in the mobile binary; Mac tools may use LocalCLI or keychain-scoped ops keys only.

## Checklist for agents

1. Prove phone tunnel: `adb shell ip -4 addr` shows `tun0` `100.x`, or phone can `curl` a Mac `100.x:8642/health`.
2. Prove Macs: `tailscale status` + discover script `--json`.
3. Prefer CGNAT URLs in profiles when MagicDNS renames nodes (`*-1`).
4. Never ship “fixed” without picker UI proof after OTA/reload.
