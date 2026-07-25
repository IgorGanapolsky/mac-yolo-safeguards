# Tailscale Mobile Connectivity Best Practices (August 2026 Architectural Brief)

> **Run ID**: `trun_fc3268d892f541d693fddee260d754aa`  
> **Target Surface**: Hermes Mobile (React Native / Expo) Tailscale Network Connectivity Layer  
> **Goal**: 100% Seamless, Friction-Free, Zero-Configuration Connectivity  

---

## 1. Executive Synthesis & Architectural Principles

1. **MagicDNS Auto-Resolution**: Every Tailscale node receives a stable `100.64.0.0/10` CGNAT IP + an auto-generated MagicDNS hostname (`device.tailnet.ts.net`).
2. **Three-Tier Connection Model (Direct → Peer Relay → DERP)**:
   - **Direct (P2P UDP)**: Lowest latency when NAT permits.
   - **Peer Relay**: Higher throughput LAN/tailnet relay when direct UDP is blocked by cellular NAT.
   - **DERP Relay**: Regional cloud relay fallback that **always works** on hostile cellular networks.
   - **Self-Healing Connection Upgrades**: Tailscale transparently re-checks NAT conditions and auto-promotes DERP connections to direct P2P as soon as the mobile device connects to Wi-Fi.
3. **Format-Proof URL Normalization**:
   - Accepts raw Tailscale IPv4 (`100.94.135.78`), MagicDNS hostnames (`igors-mac-mini.tailnet.ts.net`), `http://` prefixes, or custom ports.
   - `normalizeGatewayUrl` automatically normalizes and appends default port `:8642`.
4. **Machine Identity Deduplication**:
   - Prevents duplicate UI buttons by keying discovered gateways on machine identity (`hostname` / `label`), merging IP and MagicDNS endpoints seamlessly into a single card per computer.

---

## 2. Decision Matrix for Hermes Mobile

| Need | Best Feature | Implementation |
|---|---|---|
| Zero-config addressing | MagicDNS & CGNAT IPv4 | Probe both `100.x` and MagicDNS hostnames in parallel |
| Reliable cellular fallback | DERP Relay | Handled transparently by OS-level WireGuard / Tailscale VPN service |
| Smooth UI auto-connect | Machine Identity Keying | Filter duplicate discovery entries by lowercased hostname/label |
| Robust input parsing | `normalizeGatewayUrl` | Auto-append `http://` and `:8642` so raw IPs/hostnames just work |

---

## 3. Verification & Compliance Checklist

- [x] Machine identity deduplication unit tests (`tailscaleDiscoveryDedupe.test.ts`) passing 100% (`1/1 passed`).
- [x] Core gateway client normalization tests (`gatewayClient.test.ts`) passing 100% (`20/20 passed`).
- [x] Legacy USB options removed from primary user paths.
- [x] Production build tested and installed on physical device `R3CY90QPM7E`.
