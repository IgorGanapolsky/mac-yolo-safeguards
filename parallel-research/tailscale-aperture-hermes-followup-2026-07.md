
# Tailscale research for Hermes Mobile - Part 2 (Aperture added)

**Verdict at a glance**

- **Topic A - Peer Relay: PARTIAL** - Useful concept to understand; Hermes should NOT enable, configure, or depend on it. Two reasons: (1) both Hermes endpoints sit in the same tailnet and almost always reach each other directly, and (2) as of May 29, 2026, GitHub issue #19925 documents that peer-relay handshake never completes on Apple platforms (macOS/iOS/iPadOS), so for an iPhone-controlling-Mac use case peer relay is currently non-functional even when it would be needed.
- **Topic B - ACLs / Grants: HELP** - This is the most likely root cause of "Connected but cannot reach Mac mini" symptoms, and is where Igor should spend configuration effort.
- **Topic C - Aperture: NO** - Aperture is an LLM/AI gateway product; it is orthogonal to Hermes phone-to-Mac gateway control. Ignore.

---

## Topic A - Peer Relay (carry-over summary)

Peer Relays let a tailnet device forward traffic between two *other* clients when direct WireGuard cannot be established (e.g. strict NAT). Connection preference order is **direct -> peer-relay -> DERP** [https://tailscale.com/docs/features/peer-relay, https://tailscale.com/docs/reference/connection-types]. A relay must be explicitly designated via CLI and meet hardware/OS requirements. Open issue #19925 (https://github.com/tailscale/tailscale/issues/19925) shows peer-relay sessions allocate on all platforms but the UDP relay handshake completes only on Linux; on Apple platforms the relay records the session with zero packets and zero bytes transferred, so traffic silently falls back to DERP. Both Hermes endpoints are Apple, so peer-relay is doubly irrelevant: there is no benefit in normal operation (direct almost always works), and in the rare NAT-strict case it currently does not work anyway. **Action: do nothing in Hermes app code; do nothing in Igor's tailnet.**

---

## Topic B - ACLs / Grants (carry-over + new guidance)

Tailscale's tailnet policy is deny-by-default: every connection must be explicitly allowed. Two syntaxes coexist in the same policy file [https://tailscale.com/docs/features/access-control, https://tailscale.com/docs/reference/syntax/policy-file]:

- **ACLs** (legacy `acls:` section) - source -> destination IP/port rules.
- **Grants** (recommended) - source + destination + capabilities (network `ip:` ports OR application-layer `app:` capabilities). Tailscale docs state explicitly: "the recommended best practice is to prefer grants" [https://docs.tailscale.com/docs/reference/migrate-acls-grants].

For Hermes Mobile, the minimal correct policy is one grant that lets the phone reach the Mac on **tcp:8642** and **tcp:8765**. The cleanest version uses **`autogroup:self`** on the destination, which means "this device's own machines" - the Mac can grant the phone access to itself without enumerating specific IPs:

```json
{
  "grants": [
    {
      "src": ["autogroup:member"],
      "dst": ["autogroup:self"],
      "ip": ["tcp:8642", "tcp:8765"]
    }
  ]
}
```

Alternative: tag the Mac (`tag:hermes-gateway`) and reference `tag:hermes-gateway` in `dst`; reference `autogroup:member` (or a group) in `src`. Use the `tests` block to assert `src->dst:8642` is accepted and `dst:80` is denied, so a stray rule change cannot silently break Hermes without breaking CI. Use `tagOwners` so only the tailnet admin can assign the gateway tag.

**Why this is the real fix for "Connected but cannot reach Mac mini":** Tailscale shows the connection as healthy (the wire is up, DERP/peer-relay transport is working), but TCP to :8642/:8765 is dropped at the policy layer because no rule allows it. This looks identical to "the gateway is not listening" from the Hermes app's perspective, so most users blame the Mac firewall or the app - neither is the actual cause. The single most useful documentation item for strangers is a one-line copy in the Hermes onboarding: *"If the app says Connected but commands never return, add the grant above to your tailnet policy."* That one paragraph converts the #1 support case into a 30-second fix.

**Action:** Igor should add the grant above to his personal tailnet (one-time, 2 minutes). Hermes app code change: none required - the existing :8642/:8765 client just starts working.

---

## Topic C - Tailscale Aperture (new)

**What it is.** Aperture is described by Tailscale as *"a centralized AI gateway that secures, monitors, and routes LLM requests across your organization"* [https://tailscale.com/docs/aperture/what-is-aperture]. It is a managed, EU-hosted reverse proxy that sits between your developers/agents and upstream LLM providers (OpenAI, Anthropic, MCP servers, etc.). Core capabilities are central API-key management, per-user/per-model usage visibility and cost attribution, PII scrubbing guardrails, and outbound integration to MCP/HTTP APIs [https://tailscale.com/docs/aperture/what-is-aperture]. Access control uses a parallel **Aperture-grants** syntax with `src` plus `app["tailscale.com/cap/aperture"]` capabilities (`role`, `models`, `mcp_tools`, `mcp_resources`, `mcp_templates`); there are **no `dst` or `ip` fields** because the destination is always the Aperture device itself [https://tailscale.com/docs/aperture/how-grants-work].

**Who it is for.** Security, platform, and compliance teams rolling out AI coding assistants and internal agents organization-wide and needing centralized visibility and policy over which models and tools each employee/agent can call [https://tailscale.com/docs/aperture/what-is-aperture].

**HELP/PARTIAL/NO for Hermes Mobile: NO.** Aperture controls who may invoke *AI models through the Aperture gateway*. It does not control who may connect to a user's personal Mac on :8642/:8765 over Tailscale; that is the job of the tailnet policy (ACLs/grants), not Aperture. Adding Aperture to Hermes would either (a) require every Hermes user to also be an Aperture-customer and route their agent traffic through an Aperture instance, or (b) introduce a second proxy hop that solves no problem for Hermes's use case. The two products share the word "grants" and even share the word "policy," but they are distinct products with distinct configuration surfaces.

**Action:** None in Hermes app code, none in Igor's tailnet. Do not document Aperture in user-facing onboarding; it would confuse the actual ACL setup step users do need.

---

## Terminology: keep "Relay" copy, do not rename to "Tailscale"

Hermes Settings currently shows strings like **"Relay is the default path for approvals"** and references an **"Hermes account relay."** Renaming any of these to "Tailscale" would be **factually inaccurate** and worse than the current copy:

- "Relay" in Hermes refers to Hermes's own app-level cloud approval relay - the broker that carries the user's phone -> Mac permission prompts when a direct LAN/Wi-Fi channel is unavailable. It is Hermes software, not Tailscale infrastructure.
- "Tailscale" in this product surface means the encrypted transport/wire layer, which is conceptually below the relay, not the relay itself.
- Conflating them would mislead users into thinking they need a Tailscale account to use Hermes's relay, or that disabling "the relay" disables the network - neither is true.

If anything, tighten the copy so users can tell the two apart: e.g. *"Hermes Relay uses our cloud to deliver approval prompts; traffic between your devices is end-to-end encrypted by Tailscale."* That sentence is honest and explains the relationship without renaming anything.

---

## Combined verdict - what Igor should do

1. **Edit his personal tailnet policy.** Add the grant shown in Topic B. Two-minute change, immediate effect for his own phone-to-Mac setup. (Highest ROI, safe.)
2. **Document the grant in the Hermes onboarding flow.** Ship a copy/pasteable policy snippet + a "Connected but no response" troubleshooting page that points users at the ACL/grants step. (Highest leverage: collapses the top support failure.)
3. **Do not enable, advertise, or depend on Peer Relay.** Apple's peer-relay bug means even fallback won't work there; documenting it would create a false expectation.
4. **Do not introduce Tailscale Aperture.** Wrong product for the use case.
5. **Do not rename Hermes "Relay" UI to "Tailscale."** Keep the current term; if anything, clarify it.

For stranger users on their own tailnets, the same single change (a one-rule grant opening tcp 8642/8765 to the phone) is the only Hermes-relevant Tailscale configuration. Everything else in the Tailscale product surface can be safely ignored for v1.

---

**Sources cited**

- https://tailscale.com/docs/features/peer-relay
- https://tailscale.com/blog/peer-relays-ga
- https://github.com/tailscale/tailscale/issues/19925 (Apple peer-relay handshake bug, open 2026-05-29)
- https://tailscale.com/docs/reference/connection-types
- https://tailscale.com/docs/features/access-control
- https://tailscale.com/docs/reference/syntax/policy-file
- https://tailscale.com/docs/features/access-control/grants
- https://docs.tailscale.com/docs/reference/migrate-acls-grants
- https://tailscale.com/docs/reference/syntax/grants
- https://tailscale.com/docs/aperture/what-is-aperture
- https://tailscale.com/docs/aperture/how-grants-work

## References

1. *Grants - Tailscale Docs*. https://tailscale.com/docs/features/access-control/grants
2. *Migrate from ACLs to grants · Tailscale Docs*. https://tailscale.com/docs/reference/migrate-acls-grants
3. *Manage permissions using ACLs*. https://tailscale.com/docs/features/access-control/acls
4. *Managing Tailscale Network Access with ACLs | by Mithun Rosinth*. https://medium.com/%40blabber_ducky/managing-tailscale-network-access-with-acls-e2989b550e27
5. *ACL policy examples · Tailscale Docs*. https://tailscale.com/docs/reference/examples/acls
6. *Peer relay handshake never completes on Apple platforms ...*. https://github.com/tailscale/tailscale/issues/19925
7. *Tailscale Peer Relays · Tailscale Docs*. https://tailscale.com/docs/features/peer-relay
8. *MacOS tailscale client and auth key support - Reddit*. https://www.reddit.com/r/Tailscale/comments/16dv95c/macos_tailscale_client_and_auth_key_support
9. *Tailscale Peer Relays: High-throughput relays for secure ...*. https://tailscale.com/blog/peer-relays-beta
10. [[Feature] Track for supporting Tailscale Peer Relays](https://github.com/juanfont/headscale/issues/2841)
11. *Device posture management - Tailscale Docs*. https://tailscale.com/docs/features/device-posture
12. *Enhance Security with Tailscale Device Posture Management*. https://tailscale.com/blog/device-posture
13. *What is Aperture? · Tailscale Docs*. https://tailscale.com/docs/aperture/what-is-aperture
14. *Manage devices · Tailscale Docs*. https://tailscale.com/docs/features/access-control/device-management
15. *Use Device Identity Collection · Tailscale Docs*. https://tailscale.com/docs/features/access-control/device-management/how-to/manage-identity
16. *Grants vs. ACLs*. https://tailscale.com/docs/reference/grants-vs-acls
17. *How Aperture grants work*. https://tailscale.com/docs/aperture/how-grants-work
18. *Tailscale Pricing 2026*. https://www.g2.com/products/tailscale/pricing
19. *Tailscale Pricing (2026) — Plans, Costs & Free Tier ...*. https://notanothertool.com/pricing/tailscale
20. *Tailscale Pricing 2026: Personal & Starter Plans from $6/mo*. https://comparedge.com/tools/tailscale/pricing
21. *Tailscale pricing*. https://tailscale.com/pricing
22. *Tailscale pricing update: clearer plans, more value*. https://tailscale.com/blog/pricing-v4
