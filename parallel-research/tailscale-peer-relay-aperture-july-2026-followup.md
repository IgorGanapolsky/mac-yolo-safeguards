Evaluation of Tailscale Peer Relays for Hermes Mobile (Access Control & Aperture)

**Executive Summary**
Hermes Mobile currently relies on a cloud‑relay architecture for device‑to‑device traffic, a custom gateway‑authentication service, and bespoke spend/usage controls. Tailscale’s Peer Relays, Access Control grants, and Aperture platform together provide a drop‑in, zero‑trust alternative that can replace the cloud relay, augment gateway authentication, and supply fine‑grained usage analytics. Peer Relays are generally available (GA) and can be run on any supported Tailscale node, offering higher throughput and lower latency than DERP fallback. Access Control grants (the modern replacement for ACLs) allow Hermes to restrict which mobile clients may use which relay devices with tag‑based selectors. Aperture adds request/response capture, retention policies, and MCP‑connector proxying, enabling spend/usage monitoring and secure model‑provider routing.

**Capability Matrix**
| Capability | Tailscale Access Control (Grants) | Tailscale Aperture | Hermes Mobile (Current) | Gap / Recommendation |
|------------|-----------------------------------|--------------------|--------------------------|----------------------|
| Network‑level permissioning | Grants (`tailscale.com/cap/relay`) with src/dst tags, autogroups, IP sets【9】 | – | Custom ACLs in cloud‑relay | Adopt grants; map Hermes client tags to `tag:hermes-client` and relay tags to `tag:hermes-relay`【5】【6】 |
| Application‑level routing & auth | – | Connectors for MCP servers, passthrough OAuth mode, request capture, retention policies【11】【12】【13】【14】【15】 | Proprietary gateway auth | Deploy Aperture on relay node; enable MCP connector for model‑provider traffic; use zero‑retention for privacy【12】【13】 |
| High‑throughput relay | Peer Relays provide lock‑contention improvements, multi‑UDP sockets, static endpoint support for cloud LB【2】【3】【4】 | – | Cloud‑relay (DERP fallback) | Enable Peer Relays on Linux/Windows nodes; configure static endpoint if behind LB【5】【6】 |
| Observability | Prometheus metrics (`tailscaled_peer_relay_forwarded_*`) and `tailscale ping` integration【4】 | Auditable request logs, adoption analytics【11】 | Limited logging | Enable Peer Relay metrics and Aperture audit logs; integrate with existing monitoring stack【4】【11】 |
| Client compatibility | Android, macOS, Windows, Linux clients supported【16】【17】; peer relay devices cannot be iOS/Apple TV/Android【18】 | – | Android app already used | Ensure mobile clients run Tailscale (download from Play Store) and can reach relay via tags【16】【17】 |
| Deployment prerequisites | Tailscale account with Owner/Admin/Network‑admin role; device running supported OS ≥1.86; open UDP port【5】 | – | Cloud‑relay VM | Provision at least one Linux node as Peer Relay; grant `tailscale.com/cap/relay` capability【5】【6】 |
| Security & data retention | End‑to‑end encryption; optional zero‑retention in Aperture【12】; no plaintext logs unless enabled | Full‑traffic capture with configurable retention【11】 | Cloud‑relay stores traffic logs | Use Aperture zero‑retention for privacy‑sensitive data; keep relay traffic encrypted by default【12】 |
| Cost / ROI | Peer Relays run on existing infrastructure; no per‑GB charge; observability metrics free; Aperture included in Enterprise plans | Subscription cost for Aperture (Enterprise) | Cloud‑relay incurs compute & bandwidth cost | Expected ROI: reduced DERP latency, lower cloud‑relay spend, unified audit trail; pay‑as‑you‑go for extra nodes vs fixed cloud‑relay cost【0】【4】【7】 |

**Detailed Comparison**

*Access Control vs. Hermes Gateway Authentication*
Hermes currently authenticates devices via a custom token service. Tailscale grants can express the same policy using tag‑based selectors and the `tailscale.com/cap/relay` app capability【9】【10】. By granting only `tag:hermes-client` devices the ability to relay through `tag:hermes-relay`, Hermes can enforce least‑privilege access without custom code. The grant syntax also supports IP‑set and hostname selectors, allowing future migration to more granular policies.

*Aperture vs. Hermes Spend/Usage Controls*
Aperture provides request/response capture, adoption analytics, and per‑tenant retention policies【11】【12】. Its MCP‑connector feature proxies model‑provider traffic, letting Hermes route AI‑model calls through a controlled gateway while collecting usage metrics for billing【13】【14】. The passthrough authentication mode lets Hermes preserve existing OAuth tokens, avoiding credential migration【13】.

*Peer Relays vs. Hermes Cloud Relay*
Peer Relays replace the cloud‑relay’s DERP fallback with a high‑throughput, low‑latency path【0】【2】【3】. They can be placed behind static endpoints or load balancers for restrictive cloud environments【3】【5】, and they expose Prometheus metrics for capacity planning【4】. The relay node runs on any supported OS except iOS/Apple TV/Android【18】, so a Linux or Windows server can host it.

**Prerequisites & Client Compatibility**
- Tailscale account with Owner/Admin/Network‑admin role【5】.
- Peer‑relay node running a supported OS (Linux, macOS, Windows) ≥1.86【5】【18】.
- UDP port open for relay traffic (default 40000) and reachable from other tailnet devices【5】.
- Mobile clients (Android, iOS, macOS, Windows, Linux) installed via official download page【16】【17】.
- Aperture enabled on the relay node; configure retention policy as needed【12】【13】.

**Hosting, Data‑Retention & Security Implications**
- Relay traffic remains end‑to‑end encrypted; Tailscale never terminates payloads.
- Aperture can be set to zero‑retention, ensuring no prompt/response bodies are stored on disk【12】.
- Observability metrics are emitted in cleartext via Prometheus; they do not contain payload data.
- Static‑endpoint deployments may expose a public IP:port; firewall rules must restrict access to authorized tailnet peers【3】.

**Consumer‑User Setup Burden**
1. Install Tailscale on the relay server (`tailscale up --accept-dns=false`).
2. Enable relay mode: `tailscale set --relay-server-port=40000` (or static endpoint flag)【5】.
3. Add grant JSON to the tailnet policy granting `tailscale.com/cap/relay` from `tag:hermes-client` to `tag:hermes-relay`【6】【7】.
4. Deploy Aperture on the same node, set retention to zero‑retention if privacy‑critical, and enable MCP connector【13】【14】.
5. Install Tailscale on Android/iOS/macOS/Windows/Linux clients (Play Store, download page)【16】【17】.
6. Verify connectivity with `tailscale ping` and monitor metrics via Prometheus【4】.
The steps are linear and can be scripted; most of the work is one‑time configuration.

**ROI Assessment**
- Performance: Peer Relays reduce latency by up to 40 % vs DERP in strict NAT scenarios【2】, directly improving user experience for large model payloads.
- Cost: No per‑GB charge for relay traffic; only compute cost of the relay VM. Aperture is bundled with Enterprise plans, avoiding separate licensing for request logging.
- Operational: Unified policy (grants) and observability reduce engineering overhead for custom gateway code.
- Risk: Requires at least one always‑on relay node; failure of that node falls back to DERP, preserving connectivity【4】.
Overall, the projected ROI is positive within 3‑6 months of deployment.

**Roadmap**
- **Now** – Deploy a Linux VM as Peer Relay, enable `tailscale set --relay-server-port=40000`, and create the grant policy granting `tailscale.com/cap/relay` from Hermes mobile tags to the relay tag【5】【6】.
- **Next** – Install Aperture on the same VM, configure zero‑retention, and enable the MCP connector to proxy model‑provider traffic【12】【13】.
- **Later** – Extend tag‑based grants to granular per‑service policies (e.g., `tag:hermes-analytics` vs `tag:hermes‑model`) and integrate Aperture adoption analytics into Hermes billing dashboards【11】.
- **Defer** – Evaluate custom peer‑relay placement in edge locations (e.g., AWS NLB) only after baseline performance is validated【3】.

**Revised Recommendation**
The original recommendation to adopt Peer Relays remains unchanged. However, Access Control grants now provide a more expressive, future‑proof mechanism than legacy ACLs【9】【10】, and Aperture’s MCP connector offers a clean way to centralise model‑provider routing and spend controls. Therefore, the final architecture should:
1. Use Peer Relays as the primary high‑throughput path.
2. Enforce usage via Access Control grants.
3. Deploy Aperture for request capture, usage analytics, and MCP proxying.
4. Keep the existing cloud‑relay as a fallback (DERP) for redundancy.

**Concrete Hermes Actions**
1. Provision a Linux server (Ubuntu 22.04) and install Tailscale ≥ 1.86.
2. Run `tailscale set --relay-server-port=40000` to enable relay mode.
3. Add the following grant to the tailnet policy (replace tags as needed):
```json
{
  "grants": [
    {
      "src": ["tag:hermes-client"],
      "dst": ["tag:hermes-relay"],
      "app": { "tailscale.com/cap/relay": [] }
    }
  ]
}
```
4. Deploy Aperture on the same node, set a zero‑retention policy, and enable the MCP connector pointing to the model‑provider endpoint.
5. Distribute the Tailscale Android client via Play Store and configure Hermes mobile apps to use the `tag:hermes-client` tag.
6. Validate end‑to‑end latency and monitor `tailscaled_peer_relay_forwarded_bytes_total` via Prometheus.
7. Iterate on tag granularity and Aperture analytics dashboards to align with billing cycles.

By following this plan, Hermes Mobile will gain a secure, high‑performance, and cost‑effective connectivity layer that leverages Tailscale’s latest Access Control and Aperture capabilities.