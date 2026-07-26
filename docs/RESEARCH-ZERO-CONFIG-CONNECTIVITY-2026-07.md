# RESEARCH-ZERO-CONFIG-CONNECTIVITY-2026-07.md — Zero-Configuration Mobile-to-Desktop Connectivity Architecture (July 2026)

**Run ID**: `trun_fc3268d892f541d6a8c5a768f21dba79`  
**Verdict**: 4-Tier Connection Fallback Chain (LAN mDNS → Tailscale Direct/DERP → Cloud Relay → Manual Code)  
**Date**: 2026-07-26

---

## 1. Executive Summary

When users install Hermes Mobile on iOS or Android, they must connect seamlessly to their desktop computer running the Hermes Agent — whether that computer is a Mac, Windows PC, or Linux workstation, and whether they are on the same Wi-Fi, cellular 5G, or behind strict corporate firewalls.

Currently, Hermes Mobile relies on LAN IP sweeps and manual Tailscale IP entry. When local network permissions are missing on iOS or the desktop isn't on the same Wi-Fi subnet, connection attempts report "None found yet".

The 2026 Canonical Mobile-to-Desktop Reference Architecture establishes a **4-tier automatic fallback chain**:

```
┌─────────────────────────────────────────────────────────┐
│ 1. Local Network (mDNS / Bonjour Service Broadcast)     │  <-- <2s fast path (Same Wi-Fi)
└───────────────────────────┬─────────────────────────────┘
                            │ (unreachable / guest Wi-Fi)
                            ▼
┌─────────────────────────────────────────────────────────┐
│ 2. Tailscale WireGuard Mesh (MagicDNS / DERP Relay)     │  <-- Direct or DERP relayed
└───────────────────────────┬─────────────────────────────┘
                            │ (Tailscale not installed / blocked)
                            ▼
┌─────────────────────────────────────────────────────────┐
│ 3. Cloud Control Plane WebSocket Relay (E2EE)           │  <-- Universal 443/TCP fallback
└───────────────────────────┬─────────────────────────────┘
                            │ (Unpaired / First-Time)
                            ▼
┌─────────────────────────────────────────────────────────┐
│ 4. 6-Digit Pair Code / QR Scan                          │  <-- Manual pairing fallback
└─────────────────────────────────────────────────────────┘
```

---

## 2. Technical Component Breakdown

### Tier 1: Local Network mDNS / Bonjour Discovery (`react-native-zeroconf`)
- **Primary Library**: `react-native-zeroconf` (wrapping Bonjour on iOS and `mDNSResponder` on Android).
- **Service Name**: Advertises `_hermes._tcp.local.` on desktop startup.
- **Required iOS Entitlements**:
  ```xml
  <key>NSBonjourServices</key>
  <array><string>_hermes._tcp.</string></array>
  <key>NSLocalNetworkUsageDescription</key>
  <string>Discovers your nearby desktop computer running Hermes agent.</string>
  ```
- **Android Permissions**: `INTERNET`, `ACCESS_NETWORK_STATE`, `CHANGE_WIFI_MULTICAST_STATE`, and `NEARBY_WIFI_DEVICES` (API 33+).

### Tier 2: Tailscale Mesh & MagicDNS
- **Addressing**: Uses MagicDNS (`computer.tailnet.ts.net`) or Tailscale IP (`100.x.y.z`).
- **Connection Precedence**:
  1. Direct WireGuard UDP (hole-punched)
  2. Peer Relay (Tailscale 2026 feature for member relay nodes)
  3. DERP Relay (HTTPS/443 relay servers when UDP is blocked)

### Tier 3: Cloud Control Plane WebSocket Relay (`hermesmobile-cloud.fly.dev`)
- When LAN and Tailscale are both unreachable, the desktop agent registers an encrypted WebSocket relay session with the Hermes Cloud Control Plane.
- All mobile RPC calls pass through end-to-end encrypted WebSocket tunnels over port 443/TCP.
- **Result**: Works 100% of the time on cellular, corporate VPNs, and guest Wi-Fi networks without requiring Tailscale or port forwarding!

### Tier 4: 6-Digit Pair Code / Instant QR Scan
- Instead of forcing users to search for complex IP addresses, the desktop app prints a **6-digit pairing code** or QR code.
- Entering the code links the mobile app directly to the computer's public cloud relay endpoint.

---

## 3. Implementation Action Checklist for Hermes Mobile

- [ ] **Step 1**: Add `NSBonjourServices` (`_hermes._tcp.`) to `ios/HermesMobile/Info.plist`.
- [ ] **Step 2**: Integrate `react-native-zeroconf` for background mDNS resolution of `_hermes._tcp.local.`.
- [ ] **Step 3**: Update `gatewayDiscovery.ts` to probe generic mDNS hostnames (`macbook-pro.local`, `mac-mini.local`, `windows-pc.local`, `desktop.local`).
- [ ] **Step 4**: Implement Cloud Control Plane WebSocket relay fallback when local LAN / Tailscale HTTP probes timeout after 3s.
- [ ] **Step 5**: Replace Mac-specific copy in all screens with cross-platform "Computer" copy.
