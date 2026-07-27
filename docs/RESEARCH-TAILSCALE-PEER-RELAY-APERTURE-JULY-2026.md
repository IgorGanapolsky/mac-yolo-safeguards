# Hermes Mobile: Tailscale Peer Relay, Access Control, and Aperture

Date: 2026-07-21

Research runs:

- Initial Peer Relay evaluation: `trun_56ed24e6e8a04488b6fb2f2ce435183d`
- Chained Access Control and Aperture evaluation: `trun_fca424e03b83408983b712242661299e`
- Official-page extraction: `extract_b1852c169722c9de8cf39522a959c7f7`

## Decision

Do not deploy a Tailscale Peer Relay or adopt Aperture to address the current Hermes Mobile connection incident.

The current production failures are above the network layer:

1. The app is crashing in a React list render loop (`Maximum update depth exceeded` at `FlashList`).
2. An asynchronous USB handoff can commit the previously selected MacBook Pro after the user selects the Mac mini.
3. Settings copy says that an unexplained Hermes "Relay" is the default even while the active route is visibly `Connected · Tailscale`.

Peer Relay, Access Control, and Aperture cannot correct any of those state-management defects. The high-ROI order is:

1. Remove the list render loop and prove a cold-started physical-device session.
2. Guard async transport commits by selected-profile identity or generation.
3. Use plain Tailscale-first connection copy.
4. Measure actual Tailscale path quality before adding relay infrastructure.
5. Re-evaluate Aperture only for model governance, not connectivity.

## Correct terminology

| Term | Layer | What it does | Hermes UI |
|---|---|---|---|
| Tailscale direct | Network | End-to-end WireGuard path directly between phone and computer | Say `Tailscale` |
| Tailscale DERP | Network fallback | Tailscale-operated relay when a direct path cannot form | Keep diagnostic-only |
| Tailscale Peer Relay | Network fallback | A user-controlled node in the same tailnet that relays encrypted traffic before DERP fallback | Keep diagnostic-only |
| Hermes cloud relay | Application | Hermes pairing/approval/chat service and credentials | Do not call it the active path when the selected computer is connected by Tailscale |
| Aperture | AI application gateway | Central model-provider routing, credentials, logging, budgets, guardrails, and connectors | Not connection copy |

Tailscale automatically prefers direct connectivity, then an eligible Peer Relay, then DERP. Hermes still opens the same computer address; it should not ask a consumer to choose among those Tailscale internals. See [Tailscale Peer Relays](https://tailscale.com/docs/features/peer-relay).

## Peer Relay: useful capability, wrong immediate fix

Tailscale documents Peer Relays as a high-throughput alternative when direct connections cannot form and DERP adds unacceptable latency or throughput loss. It does not replace DERP.

Requirements include:

- Tailscale 1.86 or later on the relay host and participating devices.
- A relay host running something other than Android, iOS, or Apple TV.
- A reachable configured UDP port on the relay host.
- Tailnet Owner, Admin, or Network Admin authority.
- An explicit grant using `tailscale.com/cap/relay`.
- The participating devices and relay host must be in the same tailnet.

Android can consume a Peer Relay path but cannot host the relay. Tailscale also warns against broad source rules and says source devices should typically be stable machines behind strict NAT or firewalls, not mobile devices or laptops that frequently change networks.

That matters for Hermes: its consumer pattern is a roaming phone connecting to one personal computer, and chat traffic is not currently proven to be DERP-throughput-bound. Adding a VM, UDP exposure, policy grants, and onboarding burden without DERP-only evidence would increase cost and support surface while leaving the observed crashes unchanged.

### Peer Relay recommendation

Defer production adoption. Permit a bounded lab experiment only after all of these are true:

- Machine selection remains stable through USB, Wi-Fi, and Tailscale transitions.
- The app completes cold start and a 30-minute session without the React error boundary.
- Diagnostics prove a meaningful cohort is stuck on DERP rather than direct connectivity.
- Measured DERP latency or throughput materially harms Hermes chat, attachment, or tool traffic.

If those gates pass, test one opt-in relay host and compare direct/DERP/peer-relay path, health latency, time to first reply, attachment throughput, and 30-minute survival. Do not expose `Peer Relay` or `DERP` in the main UI; show them only under diagnostics.

## Access Control: least privilege, not application authentication

Tailscale recommends Grants over legacy ACLs. Grants can restrict sources, destinations, network ports, and application capabilities. The Peer Relay capability only controls who may allocate relay bindings; it does not replace Hermes gateway credentials or authorize Hermes application operations. See [Access control](https://tailscale.com/docs/features/access-control).

For a managed or enterprise tailnet, a least-privilege policy should limit Hermes clients to the selected computer's TCP 8642 service and separately grant Peer Relay capability only if a relay experiment is enabled. For the consumer product, each customer controls their own tailnet; Hermes cannot silently impose tags or rewrite the customer's policy. Policy automation therefore belongs in a future managed-tailnet or enterprise offering, not fresh-user mobile onboarding.

## Aperture: promising AI governance, unrelated to Mac reachability

[Aperture](https://tailscale.com/docs/aperture/what-is-aperture) is a Tailscale-identity-aware AI gateway. Its relevant capabilities are:

- Central provider API-key management and model-name routing.
- Usage and token-cost visibility.
- Request/response capture with configurable retention and a zero-retention mode.
- Guardrails that can inspect, modify, or block AI requests.
- MCP and HTTP connectors with centralized authentication.
- Provider passthrough for subscription credentials.

It does not route arbitrary phone-to-Mac TCP traffic and cannot replace the Hermes connection state machine. Current official material says Aperture is beta, is purchased separately from paid Tailscale plans, does not support direct public-internet access, and is currently hosted in the European Union. Those constraints require a deliberate privacy, cost, residency, availability, and vendor-dependency review before production use. See [Aperture overview](https://tailscale.com/docs/aperture) and [AI Gateway](https://tailscale.com/use-cases/securing-ai).

### Aperture recommendation

Defer production adoption. Revisit as a small internal or enterprise pilot after mobile connectivity is stable and there is measured demand for centralized provider keys, model policy, spend controls, MCP governance, or audited AI usage.

The first pilot should use synthetic or non-sensitive prompts, zero retention, one provider, one model, and no replacement of existing Hermes authentication. Compare operational cost, latency, provider compatibility, incident visibility, and privacy posture against the current gateway. A beta gateway must not become a new availability dependency for the consumer chat path without an explicit fallback.

## User-facing copy

The Settings screen should explain the active product behavior in this order:

- `Connect to your computer with Tailscale, USB, or home Wi-Fi.`
- `Tailscale keeps your selected computer reachable on Wi-Fi or cellular. USB and home Wi-Fi are optional local paths.`
- Use `Search home Wi-Fi` for the local discovery action.

Do not say `Relay is the default path` when the selected machine is connected through Tailscale. Do not expose `Peer Relay`, `DERP`, grants, or Aperture in ordinary connection UI.

## Corrected findings from the generated research

The chained research output recommended immediate VM deployment and described Aperture as an Enterprise-bundled component that could be installed on the relay node. Current official sources contradict that recommendation:

- Peer Relay guidance does not support treating a roaming phone as the default source cohort.
- Aperture is beta and separately purchasable.
- Aperture is an AI gateway, not a drop-in network or Hermes application-auth replacement.
- The follow-up's claimed 3-6 month ROI was not supported by Hermes traffic, cost, or cohort telemetry.

Those generated claims are retained in the raw artifacts for auditability but are not accepted as the architecture decision.

## Acceptance evidence for any future network rollout

1. Record selected computer identity before and after every transport transition.
2. Record Hermes `/health` status and latency without secrets.
3. Record Tailscale path from `tailscale ping` or `tailscale status` on a controlled test device.
4. Force direct-path failure in a lab and verify DERP fallback before enabling Peer Relay.
5. Enable one Peer Relay and prove `peer-relay` path selection, then take the relay offline and prove DERP recovery.
6. Run 30-minute chat and attachment tests across Wi-Fi, cellular, sleep/wake, and network changes.
7. Compare failure rate and latency against the same scenarios without Peer Relay.
8. Keep React crash and selected-profile invariants as independent release gates; network success must never mask application-state failure.

## Primary sources

- [Tailscale Peer Relays](https://tailscale.com/docs/features/peer-relay)
- [Tailscale Access Control](https://tailscale.com/docs/features/access-control)
- [What is Aperture?](https://tailscale.com/docs/aperture/what-is-aperture)
- [Aperture documentation status](https://tailscale.com/docs/aperture)
- [Aperture AI Gateway](https://tailscale.com/use-cases/securing-ai)
