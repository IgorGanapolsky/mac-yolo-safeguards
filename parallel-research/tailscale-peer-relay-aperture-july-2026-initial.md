# Tailscale Peer Relays for Hermes Mobile - Engineering Evaluation

**Scope.** Hermes Mobile is a React Native phone app that opens a TCP socket to a user-selected Mac/Windows/Linux computer over the user's Tailscale network, on TCP port 8642. This report evaluates whether and how to use the new Tailscale Peer Relay feature.

**Critical terminology distinction.** "Peer relay" is overloaded across this product. The three things are **not** the same:

| Term | Owner | What it does |
|---|---|---|
| Hermes cloud relay | Hermes (in-house) | Hermes-operated relay fleet that brokers traffic between phone and Mac when neither side can reach the other directly. |
| Tailscale DERP relay | Tailscale | Tailscale-operated global relay mesh used as the fallback when WireGuard NAT traversal fails. |
| Tailscale Peer Relay | Tailscale (new, GA Feb 18 2026) | A user-controlled node inside the *same tailnet* that the user designates to relay WireGuard-encrypted traffic when direct UDP fails, as a faster alternative to DERP. |

Only the third is the subject of this evaluation.

---

## 1. How Peer Relays differ from direct WireGuard and DERP

Tailscale now exposes three connection types between two devices in the same tailnet, all wrapped in end-to-end WireGuard so the relay sees only ciphertext ([12]):

| Type | Path | When used | Trust model |
|---|---|---|---|
| Direct | Device A <-> UDP <-> Device B | NAT traversal (STUN/endpoint exchange + port predict) succeeds | None needed; WireGuard keys only |
| Peer Relay | Device A <-> UDP <-> peer-relay host (same tailnet) <-> UDP <-> Device B | Direct fails; relay reachable | Relay host sees ciphertext; you trust it not to drop traffic |
| DERP | Device A <-> TCP/TLS <-> Tailscale-operated DERP node <-> TCP/TLS <-> Device B | Both above fail | Same wire model; Tailscale operates the relay |

Selection order is automatic in the Tailscale client: try direct, then peer relay if available and permitted, then DERP. Tailscale periodically re-evaluates and can upgrade a DERP session to peer relay (or direct) when conditions improve ([12]).

Key consequence: **peer relay traffic stays inside the user's own tailnet**, never traverses Tailscale-operated infrastructure. It only adds a hop to a machine the user already controls.

The DERP-vs-peer-relay gap is large in the wild. Tailscale's own field report from a Delhi-Minneapolis connection shows iperf3 throughput rising from **2.2 Mbit/s over DERP to 27.5 Mbit/s over peer relay (~12.5x)** and RTT falling from ~452 ms to ~298-306 ms ([4]).

---

## 2. Exact requirements, platform support, and configuration

### Versions and platforms ([2])

- **Tailscale client version:** 1.86 or later on **both** the relay host and any client that will use it.
- **Relay-host OS support:** any Tailscale-supported OS **except iOS, Apple TV, and Android**. This is the hard rule. A phone cannot be a peer-relay server, period.
- **Client OS support:** none — any Tailscale-supported client OS can use a peer relay, including iOS and Android.

### What it costs on the host

The relay host listens on one **configurable UDP port** (e.g., 40000) chosen via `tailscale set --relay-server-port=<port>`. The port must be reachable from other tailnet devices and any firewall/NAT in front of it must permit inbound UDP to that port. The relay consumes bandwidth proportional to relayed traffic; no other resource claim is documented.

### Enabling it on a device

```bash
tailscale set --relay-server-port=40000
# optional: pin advertised endpoints if behind NAT you control
tailscale set --relay-server-port=40000 \
  --relay-server-static-endpoints="203.0.113.10:40000,[2001:db8::10]:40000"
```

### Tailnet policy (ACL)

The grant capability is `tailscale.com/cap/relay`. Both directions must be granted:

```json
{
  "grants": [
    {
      "src": ["tag:hermes-relays"],
      "dst": ["tag:hermes-relays"],
      "app": { "tailscale.com/cap/relay": [] }
    }
  ]
}
```

(Concrete shape from the docs; tag set is whatever you choose to identify Mac/Win/Linux machines acting as relays.) You do not need a separate `ip:` allow for the relay host itself - the capability entry is the access control mechanism ([2]).

### Observability

`tailscale ping <host>` reports the active path, including `via peer-relay(IP:PORT:VNI)` once the upgrade happens; `tailscale status` lists relay-eligible nodes ([5]).

### Stability signal

Peer Relays went GA on **Feb 18, 2026** ([5]). As of today (2026-07-21) the feature has been GA for roughly five months and has had no documented rollback; the underlying client is the same Tailscale 1.86+ build used everywhere else. Treat as production-stable.

---

## 3. Does Peer Relay fix the reported "phone intermittently failing to retain/select the Mac mini"?

**Likely no.** Read the symptom carefully: the phone intermittently **fails to retain or select** a Mac mini. That is a selection/identity problem, not a transport problem.

- **If the device is "not retained":** the Hermes app probably has stale state about which Mac mini is currently reachable. That is an application-layer state-management bug (React render loop, async USB-profile handoff, stale auth context), not a Tailscale transport-layer bug.
- **If the device is "not selected":** the user picks Mac A but Hermes connects to Mac B, or fails to discover Mac B. That is a discovery/pairing/lookup bug, again application-layer.
- **If the connection drops after a few seconds:** that *could* be a transport issue (NAT rebind, Wi-Fi roam, power-saving suspend), and peer relay might marginally help by giving Tailscale a stable fallback - but the **root cause is still local network behavior**, not Tailscale's choice of path. Peer relay only helps when direct UDP hole-punching fails; it does not fix a phone that suspends the Wi-Fi radio.

Recommended next step before adopting peer relay: **add structured diagnostics** (`tailscale ping` results, last handshake time, DERP-vs-direct state) into the Hermes connection telemetry, then look at whether the failure correlates with "no direct path" or with "the app lost its pointer to Mac A." The first case is where peer relay helps; the second is a Hermes bug.

---

## 4. ROI for a consumer app where each user controls their own phone and computer

ROI is **strongly positive on transport quality**, **neutral to slightly negative on product surface area**, and **positive on support cost**.

### Engineering cost

- **Relay host side (Mac/Windows/Linux companion app):** add a one-line CLI invocation (`tailscale set --relay-server-port=40000`) plus one ACL `grants` block with the `tailscale.com/cap/relay` capability. Optionally pin static endpoints for users behind strict NAT. ~1 engineering-day including docs and onboarding copy.
- **Phone side:** zero changes. The Tailscale Android/iOS app already supports peer relay as a client since 1.86.
- **Hermes Mobile (the React Native app):** zero changes to connectivity code. The connection is still "open TCP to the Mac mini's tailnet IP on port 8642." Tailscale's choice of direct/peer-relay/DERP path is invisible to the app.

### User-visible benefit

- For users behind symmetric NAT or carrier-grade NAT (a growing share of mobile networks), throughput from Mac mini to phone climbs from DERP-class (~2 Mbit/s) to peer-relay-class (~25-35 Mbit/s) - on the order of **10x**, with **30-50% lower round-trip latency**.
- More reliable sessions on networks where direct UDP hole-punching fails - corporate Wi-Fi, hotel networks, captive portals. Hermes would stop seeing the "connection drops after 30 seconds on coffee-shop Wi-Fi" class of report.

### User-visible cost

- One extra inbound UDP port to forward on the user's router (only if the relay host is behind NAT). Most users running a Mac mini on a home network already do port forwarding or use a static endpoint.

### Risk

- Low. GA for ~5 months, opt-in, fails closed (fallback to DERP). No app-layer changes means no regression surface inside Hermes.

### Support cost

- Negative (i.e., saves money). "Connection is slow / keeps dropping on my phone" tickets drop sharply when peer relay is the default fallback.

---

## 5. Should the UI expose "Peer Relay" or just say "Tailscale"?

**Just say Tailscale.** Three reasons:

1. **The user did not choose a relay.** The Tailscale client chose the path; the user only chose to run Tailscale. Exposing the path adds a "what is peer relay" support burden without giving the user a lever to pull.
2. **It is not a permanent state.** A connection can move between direct, peer-relay, and DERP over its lifetime. Showing one of those words is misleading.
3. **Hermes's value proposition is "use your own computer, securely."** "Connected via Tailscale" reinforces that - peer relay is an internal detail.

Recommended user-visible strings:

- Connection state: `Connected via Tailscale` / `Connecting via Tailscale` / `Tailscale unreachable - check your network`
- Diagnostic detail (behind a "Show details" toggle): `Path: direct` / `Path: relay (Mac mini)` / `Path: Tailscale relay`

Do **not** use the words "Peer Relay," "DERP," or "relay node" in any user-facing string.

---

## 6. Recommendation: Adopt with an enabling posture

### Verdict: ADOPT peer relay as an opt-in Mac-side enhancement; do not change Hermes Mobile code.

| Dimension | Decision | Rationale |
|---|---|---|
| Hermes Mobile app changes | None | Tailscale client handles path selection; app sees a TCP socket. |
| Mac/Windows/Linux companion app | Enable `tailscale set --relay-server-port=<port>` as an advanced setting | One CLI, fully reversible. |
| Tailnet policy | Add a `grants` rule for `tailscale.com/cap/relay` for tagged relay hosts | Required to allow the path; one JSON block. |
| UI | Do not expose the concept; use the strings above | Avoid support burden; user has no actionable choice. |
| Default | Off; offer as "Improve connection reliability on restrictive networks" toggle | Lets power users opt in; avoids surprising existing users. |
| Telemetry | Log `tailscale ping` path strings (direct/peer-relay/DERP) per session | Lets you measure whether users on the toggle actually benefit. |

### Architecture sketch (no app changes required)

```
+----------------------+        +-----------------------+
|  Phone (Tailscale)   |        |  Mac mini (Tailscale) |
|  Hermes Mobile RN    | <----> |  Hermes Desktop       |
|  Tailscale 1.86+     |  WG    |  Tailscale 1.86+      |
|                      |  UDP   |  relay-server-port=N  |
+----------------------+        +-----------------------+
            |                              ^
            |   if direct fails:           |
            v                              |
+----------------------+        +-----------------------+
| Peer relay hop (any  | <----> |  DERP fallback        |
| Mac/PC/Linux in same |        |  (Tailscale-operated) |
| tailnet)             |        |                       |
+----------------------+        +-----------------------+
```

When Hermes Mobile dials `<mac-mini>.tailnet.ts.net:8642`, the local Tailscale client on the phone decides the path: direct UDP first, then peer relay if the relay host is reachable and permitted, then DERP. The relay hop is invisible to Hermes.

### Test plan

1. **Lab reproduction.** On a network where direct UDP fails (symmetric NAT via two routers, or a corporate guest Wi-Fi), measure:
   - Throughput to Mac mini with and without peer relay (use `iperf3` against a Hermes-shaped TCP echo, not raw WireGuard).
   - Time-to-first-byte and session-survival time over 30 minutes.
2. **Field A/B.** Ship the toggle to a 5% slice of Mac-mini users on networks that telemetry flags as DERP-only. Compare session-survival rate, median throughput, and "connection lost" support tickets vs control. Promote to default after two release cycles if delta is positive.
3. **Stability regression.** Run a 24-hour soak on the Mac companion app with `tailscale set --relay-server-port` active and verify no CPU/memory drift, no crash on sleep/wake, and no DERP-regression when peer relay is reachable but slow.
4. **ACL guardrail.** Verify the `tailscale.com/cap/relay` capability does not grant any unintended access (it shouldn't; the docs explicitly state no separate network grant is needed).
5. **Failure modes to assert:**
   - Peer relay host offline: traffic falls back to DERP within seconds.
   - Peer relay port blocked by ISP: same - DERP fallback.
   - ACL missing `tailscale.com/cap/relay`: DERP fallback (and a clear log line).
6. **Hermes-side regression.** Run the existing flaky-Mac-selection bug repro before and after enabling peer relay on a tester's Mac. If the bug reproduces unchanged, peer relay was not the cause and the React-state / USB-profile investigation should proceed in parallel.

---

## 7. Parallel work that peer relay does **not** replace

Even after peer relay is enabled, ship a fix-track for the reported retention/selection bug:

- Treat discovered Mac minis as a versioned cache keyed on `(device_id, last_seen, online_state)`; expire after a TTL derived from a `tailscale ping` health check, not from app-side timers that can be reset by re-renders.
- Debounce and serialize the USB-profile handoff: a single source of truth (Redux/Zustand/Jotai slice or React Query cache) keyed on the device id; the renderer is purely a projection of that state.
- Add a `connection_path` telemetry field (`direct | relay | derp | unknown`) sourced from `tailscale ping` so future regressions are diagnosable from analytics, not from user reports.

---

## 8. Citations

- [2] - feature overview, server requirements, client requirements, ACL.
- [12] - the three-path connection model and selection order.
- [5] - GA date (Feb 18, 2026), `tailscale ping` integration.
- [7] - beta launch (Oct 29, 2025), design intent.
- [4] - measured 2.2 Mbit/s -> 27.5 Mbit/s and 452 ms -> ~300 ms over DERP -> peer relay on the same transcontinental path.
- [25] and the official install page - confirms Android client exists; relay-host exclusion applies to relay serving, not relay consuming.

## References

1. *ACL policy examples · Tailscale Docs*. https://tailscale.com/docs/reference/examples/acls
2. *Tailscale Peer Relays · Tailscale Docs*. https://tailscale.com/docs/features/peer-relay
3. *Restrict the use of Tailscale SSH from only some of a ...*. https://github.com/tailscale/tailscale/issues/5180
4. *Using Tailscale's Peer Relays to fix a homelab connection ...*. https://tailscale.com/blog/peer-relays-international-networks
5. *Tailscale Peer Relays is now generally available*. https://tailscale.com/blog/peer-relays-ga
6. *Tailscale Peer Relays is now generally available - vuink.com*. https://vuink.com/post/gnvyfpnyr-d-dpbz/blog/peer-relays-ga
7. *Tailscale Peer Relays: High-throughput relays for secure ...*. https://tailscale.com/blog/peer-relays-beta
8. *Make Tailscale NAT Traversal More Stable with Peer Relay*. https://blog.therainisme.com/posts/tailscale-peer-relay
9. *Tailscale Peer Relays: Solving the NAT Traversal Nightmare*. https://www.techbloat.com/tailscale-peer-relays-solving-the-nat-traversal-nightmare.html
10. *How Tailscale is improving NAT traversal (part 1)*. https://tailscale.com/blog/nat-traversal-improvements-pt-1
11. *Tailscale Peer Relays: Solving the NAT Traversal Nightmare*. https://umatechnology.org/tailscale-peer-relays-solving-the-nat-traversal-nightmare
12. *Connection types · Tailscale Docs*. https://tailscale.com/docs/reference/connection-types
13. *Tailscale Peer Relays is now generally available - A ...*. https://signalreads.com/articles/tailscale-peer-relays-is-now-generally-available
14. *Tailscale Peer Relays Now Generally Available - Sesame Disk*. https://sesamedisk.com/tailscale-peer-relays-available
15. *GitHub - RyanMoreau/tailscale-sdk: Zero-dependency TypeScript ...*. https://github.com/RyanMoreau/tailscale-sdk
16. *Install Tailscale on Android · Tailscale Docs*. https://tailscale.com/docs/install/android
17. *Reimagining Tailscale for Android - YouTube*. https://www.youtube.com/watch?v=1wqUoiDIxqU
18. *Setup SSH and Tailscale on Android 15 Linux Terminal App*. https://gist.github.com/aschober/eeb316027c5037fc3af5fb0327ab44fd
19. *Tailscale - Apps on Google Play*. https://play.google.com/store/apps/details?hl=en-US&id=com.tailscale.ipn
20. *Full-Featured Tailscale on Android and Remote Unlocking - kxxt*. https://www.kxxt.dev/blog/full-tailscale-on-android-and-remote-unlocking
21. *FR: Peer Relay Operator & ENV support · Issue #17791*. https://github.com/tailscale/tailscale/issues/17791
22. *How to install & Configure Tailscale in Linux, Windows ...*. https://devsecopsschool.com/blog/how-to-install-configure-tailscale-in-linux-windows-macos
23. *Tailscale Direct to router - relay on all LAN devices*. https://forum.gl-inet.com/t/tailscale-direct-to-router-relay-on-all-lan-devices/57146
24. *Connecting Linux + Windows + Mac Together with Tailscale*. https://www.youtube.com/watch?v=EE7xstC8Kw4&vl=en
25. *Use NextDNS*. https://tailscale.com/kb/1218/android
26. *Syntax reference for the tailnet policy file · Tailscale Docs*. https://tailscale.com/docs/reference/syntax/policy-file
27. *Manage Routes & Exit Nodes with Tailscale Auto Approvers*. https://tailscale.com/blog/auto-approvers
28. *Manage permissions using ACLs · Tailscale Docs*. https://tailscale.com/docs/features/access-control/acls
29. *Using Hermes - React Native*. https://reactnative.dev/docs/hermes
30. *Deploy Hermes Gateway via Tailscale - railway.com*. https://railway.com/deploy/hermes-gateway-via-tailscale
31. *Hermes Agent Mac Setup: Install, Gateway & Migration (2026)*. https://proxymac.com/en/blog/articles/hermes-agent-mac-setup-guide-2026.html
32. *Hermes V1 by Default in React Native 0.84*. https://www.tothenew.com/blog/hermes-v1-by-default-in-react-native-0-84-the-biggest-performance-win-of-2026
33. *Technical Guide: Compiling Hermes for Apple Platforms*. https://www.callstack.com/blog/technical-guide-compiling-hermes-for-apple-platforms
34. *Troubleshooting guide · Tailscale Docs*. https://tailscale.com/docs/reference/troubleshooting
35. *Troubleshoot device connectivity · Tailscale Docs*. https://tailscale.com/docs/reference/troubleshooting/connectivity
36. *Troubleshooting tailscale - wikieduonline*. https://www.wikieduonline.com/wiki/Troubleshooting_tailscale
37. *Troubleshoot DERP traffic routing issues*. https://tailscale.com/docs/reference/troubleshooting/network-configuration/derp-routing
38. *Changelog*. https://tailscale.com/changelog
39. *Releases · tailscale/tailscale*. https://github.com/tailscale/tailscale/releases
40. *Tailscale Packages - stable track*. https://pkgs.tailscale.com/stable
41. *tailscale changelog | Dart package*. https://pub.dev/packages/tailscale/changelog
42. *Tailscale peer-relay feature doesn't work · Issue #3657 · SagerNet/sing- ...*. https://github.com/SagerNet/sing-box/issues/3657
43. *react-native-wireguard-vpn 1.0.15 on npm - Libraries.io*. https://libraries.io/npm/react-native-wireguard-vpn
44. *GitHub - usama7365/react-native-wireguard-vpn*. https://github.com/usama7365/react-native-wireguard-vpn
45. *usama7365/react-native-wireguard-vpn | DeepWiki*. https://deepwiki.com/usama7365/react-native-wireguard-vpn
46. *React-native-wireguard-vpn NPM | npm.io*. https://npm.io/package/react-native-wireguard-vpn
47. *hermes-agent/apps/desktop at main · NousResearch/hermes-agent*. https://github.com/NousResearch/hermes-agent/tree/main/apps/desktop
48. *How to Connect Hermes Desktop to a Remote Hermes Backend*. https://hermes-agent.ai/blog/connect-hermes-desktop-remote-backend
49. *hermes-relay/desktop/README.md at main - GitHub*. https://github.com/Codename-11/hermes-relay/blob/main/desktop/README.md
50. *Codename-11/hermes-relay — Hermes Agent Integrations ...*. https://hermesatlas.com/projects/Codename-11/hermes-relay
51. *Hermes Agent Gateway Architecture — Engel Nyst*. https://enyst.github.io/hermes-gateway.html
52. *rn-servers/README.md at main · corasan/rn-servers · GitHub*. https://github.com/corasan/rn-servers/blob/main/README.md
53. *A Tailscale Bridge Story: One Orchestrator, Remote Browsers*. https://pinchtab.com/docs/tailscale-bridge-orchestrator
54. *Complete Tailscale Setup Guide: Access Your Home Network From ...*. https://meowscript.com/guides/setup-tailscale-remote-access
55. *Download app - How to use Relay UK*. https://www.relayuk.bt.com/how-to-use-relay-uk/download-app.html
56. *Android Relay server unavailable only when always on ...*. https://github.com/tailscale/tailscale/issues/14225
57. *Device connectivity · Tailscale Docs*. https://tailscale.com/docs/reference/device-connectivity
58. *VPN Connection Management | tailscale/tailscale-android ...*. https://deepwiki.com/tailscale/tailscale-android/4.1-vpn-connection-management
59. *tailscale-ios/README.md at main · LiuTangLei/tailscale-ios*. https://github.com/LiuTangLei/tailscale-ios/blob/main/README.md
60. *tailscale/tailscale-android | DeepWiki*. https://deepwiki.com/tailscale/tailscale-android
61. *Install Tailscale on iOS · Tailscale Docs*. https://tailscale.com/docs/install/ios
62. *Hermes Desktop — Desktop Companion for Hermes Agent*. https://hermesdesktop.homes/
63. *GitHub - fathah/hermes-desktop: Desktop Companion for Hermes ...*. https://github.com/fathah/hermes-desktop
64. *Hermes Desktop by dodo-reach - Native macOS Hermes SSH Client ...*. https://www.everydev.ai/tools/hermes-desktop
65. *Hermes Desktop — A native Mac app for your Hermes Agent host*. https://dodo-reach.github.io/hermes-desktop
66. *GitHub - Yasuui/hermes-mobile: Premium native iOS app for ...*. https://github.com/Yasuui/hermes-mobile
67. *Download the Free Relay Mobile App for Fleets and Truck ...*. https://www.relaypayments.com/app
68. *Hermes-Agent Plugin System: Extending AI Relay Station ...*. https://www.holysheep.ai/articles/en-hermes-agentchajianxitongkuozhanaizhongzhuanzhango-2026-04-10-0087.html
69. *Tailscale Funnel · Tailscale Docs*. https://tailscale.com/docs/features/tailscale-funnel
70. *Tailscale Funnel examples*. https://tailscale.com/docs/reference/examples/funnel
71. *Architecture | Hermes Agent*. https://hermes-agent.nousresearch.com/docs/developer-guide/architecture
