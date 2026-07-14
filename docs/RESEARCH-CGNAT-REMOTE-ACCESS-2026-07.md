# Deep Research: Stable remote screen access across double T-Mobile CGNAT (July 2026)

**Date:** 2026-07-13 · **Method:** 109-agent deep-research workflow — 6 search angles, 26 sources fetched, 126 claims extracted, top 25 adversarially verified by 3-vote panels (23 confirmed, 2 refuted). Networking findings lean on Tailscale primary docs (validated Jan–Feb 2026, fetched 2026-07-13).

**Fleet context:** Mac mini (24GB) on T-Mobile Home Internet behind TP-Link Deco (double NAT + CGNAT); MacBook Pro on Samsung S25 hotspot (CGNAT). Tailscale direct paths decay to DERP(mia) within minutes each evening → 300ms–1.9s RTT → Screen Sharing unusable. 2026-07-13 incident: `uplink-flood-guard` logged tunnel retx storms of 91k/215k/85k per 10s.

## Why the evening decay happens (verified, 3-0 ×4)

- Every Tailscale connection **starts** relayed and only upgrades to direct if NAT traversal succeeds — relay fallback is the designed baseline, not an error.
- DERP is a **TCP-over-TLS** relay: handshakes, buffering, and loss-retransmission add latency a UDP tunnel would not have; packet loss triggers TCP head-of-line blocking.
- Tailscale's shared DERP fleet **deliberately throttles throughput for fairness** (GitHub #13133/#14661 corroborate).
- Evening T-Mobile bufferbloat amplifies all of the above. The 300ms–1.9s figure is a supported inference (geographic detour to mia + bufferbloat under TCP HoL), not a measured decomposition.

## Ranked action plan

### 1. End-to-end IPv6 (top fix — free) — **local test 2026-07-13 19:35: NOT currently working on either Mac**
Tailscale classifies IPv6 peers as "easy NAT" achieving direct connections "in almost every situation," prefers IPv6 automatically, and IPv6 bypasses CGNAT entirely (CGNAT is IPv4-only). *(high confidence; tailscale.com/docs/reference/device-connectivity, blog NAT-traversal series)*

**Live fleet test result:** `tailscale netcheck` reports `IPv6: no, but OS has support` on BOTH Macs.
- Mini: only ULA (`fd24:...` from the Deco) — **the Deco is not passing T-Mobile's IPv6 prefix through**. Action (Igor, ~5 min): Deco app → Internet/IPv6 settings → enable IPv6 (or put Deco in AP mode so the T-Mobile gateway serves the LAN directly, also removing double NAT).
- MacBook Pro: no global v6 from the S25 hotspot. Action: S25 → Mobile Hotspot settings; Samsung/T-Mobile support hotspot IPv6 on recent firmware but it is device/plan dependent — test after enabling.
- Caveats: T-Mobile prefixes rotate several times daily (brief re-punch on rotation); stateful IPv6 firewalls can still force DERP (tailscale #18032); IPv6 does NOT fix evening bufferbloat, only the relay problem.

### 2. Tailscale Peer Relay on a small VPS (the robust fix — ~$4-6/mo)
GA Feb 18 2026 (client v1.86+). User-operated UDP relay tried automatically BEFORE DERP (preference: direct > peer relay > DERP). Documented CGNAT case: 2.2 Mbit/s on DERP (452ms) → **27–35 Mbit/s via peer relay (12.5×)**. *(high confidence, 6 claims 3-0; first-party n=1 benchmark caveat)*

**Hard constraint (verified 3-0):** the relay needs an inbound-reachable UDP port — **neither CGNAT'd Mac can host it**. Setup: cheapest VPS in/near your metro (e.g. NYC) → join tailnet → `tailscale set --relay-server-port=<port>` → add `tailscale.com/cap/relay` grant in ACL. No client-side changes; path selection is automatic. Two free peer relays per user.

### 3. Disable the `mia` DERP region (zero-infra partial mitigation, 10 min)
Tailnet policy file `derpMap` → set RegionID for mia to `null` (default map: controlplane.tailscale.com/derpmap/default). Traffic reroutes to next-best region. Does NOT create direct paths and fairness throttling still applies — cheap mitigation only. Self-hosting full DERP is supported but **explicitly discouraged by Tailscale** in favor of peer relays, and loses cross-tailnet features. *(high confidence)*

### 4. Evening bufferbloat: cake-autorate on an inline OpenWrt box (hardware required)
The symptom (idle latency fine, loaded latency terrible) is textbook bufferbloat. `cake-autorate` is purpose-built for variable-rate 5G links — tracks capacity sub-second where static SQM fails. **Cannot run on the Deco or T-Mobile gateway**; needs an inline OpenWrt router (or any Linux box with CAKE qdisc + fping, e.g. a Pi). Key caveat: evening congestion is largely carrier-side (tower RAN buffers); user-side SQM may under-deliver on download. *(high confidence; OpenWrt forum reports include T-Mobile Home Internet specifically)*

### 5. App-layer alternative: Jump Desktop (Fluid protocol)
Direct P2P first, then nearest of many global encrypted relays; official self-hosted coturn relay option (UDP TURN — architecturally better than TCP DERP for screen traffic). *(medium confidence — vendor-asserted, no independent audit)* Practitioner consensus (HN) rates Fluid far above macOS Screen Sharing. Refuted (0-3): the claim that Jump advises against running Fluid inside a VPN.

## Refuted claims (do not carry)
- "DERP only as last resort / peer relays always tried first in all configs" as worded on the derp-servers page (1-2).
- "Jump Desktop advises against Fluid over any VPN; SSL/TCP VPNs unsuitable" (0-3).

## Open questions
1. Does enabling IPv6 on the Deco + S25 hotspot actually yield stable direct paths through prefix rotations? (Testable in one evening: `tailscale netcheck`, then `tailscale ping` during the decay window.)
2. Problem 2 (multi-agent memory governance on 24GB Macs) — **zero claims survived this pass**; dedicated research running separately (2026-07-13, run wf_469be4d7-8c6).
3. RustDesk / Sunshine+Moonlight / high-performance Screen Sharing comparisons under double CGNAT — no surviving claims this pass.
4. Whether tower-side RAN buffering dominates evening latency even after a UDP relay path exists.

## Recommended sequence for this fleet
1. **Tonight (free):** enable IPv6 on Deco + S25 hotspot; re-test `netcheck`. If both show global v6, the decay problem is likely solved.
2. **This week (~$5/mo, robust regardless of #1):** peer relay VPS near your metro. Fixes throughput/latency even when direct fails.
3. **Optional:** disable mia in derpMap (better DERP while #1/#2 roll out).
4. **Only if evenings still hurt:** inline OpenWrt/Pi with cake-autorate; or trial Jump Desktop for the screen-sharing layer.

## Interim safeguards already deployed (2026-07-13)
- `tailscale-path-keeper` (MacBook Pro LaunchAgent, 60s): re-punches (rebind+restun both ends) whenever the mini peer shows `active; relay`. Band-aid that restores direct windows.
- `uplink-congestion-sentinel` (both Macs, PR #255): alerts when LAN is fast but internet is slow — distinguishes ISP congestion from Mac problems.
- `uplink-flood-guard` self-heal (PR #232): auto rebind+restun on tunnel retx ≥ 20k/10s.
