# Tailscale research for Hermes Mobile (Android/iOS phone ↔ Mac gateway)

**Verdict at a glance**
- **Topic A — Peer Relay: PARTIAL.** Helpful concept to understand, but Hermes should not enable, configure, or depend on it. It exists to relay traffic when direct WireGuard cannot be established; both Hermes endpoints (phone + Mac) sit inside the same tailnet and almost always reach each other directly.
- **Topic B — Access Control / Grants / ACLs: HELP.** This is the likely root cause of "Connected but cannot reach Mac mini" symptoms, and the right place to spend configuration effort for Hermes Mobile.

---

## Topic A — Peer Relay ([11])

**What it is.** Peer Relays let you use a device inside your tailnet as a high-throughput relay for *client-to-client* traffic when a direct WireGuard connection is not possible (e.g. strict NAT). They sit *between* direct connections and DERP relay servers in Tailscale's connection preference order:

> direct → peer-relay → DERP (https://tailscale.com/docs/features/peer-relay)

**When it is used vs. DERP vs. direct.** Peer Relays are only consulted when a direct connection fails; if DERP is still faster or more reachable, DERP wins. They are a performance/throughput upgrade over DERP for two same-tailnet peers, not a replacement for either.

**Client requirements** ([11]):
- *Acting as* a peer relay: any OS *except* iOS, Apple TV, or Android. macOS, Linux, Windows, Synology, etc. can act as a relay. **Version 1.86+ required.**
- *Using* a peer relay: any Tailscale-supported OS, including iOS and Android, version 1.86+.

**Admin/ACL requirements.** Activating a peer relay requires Owner / Admin / Network-admin role. You then must add a *grant* in the tailnet policy that includes the application capability `tailscale.com/cap/relay`. The grant lets designated devices route through the relay using tags like:

```json
{
  "src": ["tag:us-east-relays"],
  "dst": ["tag:us-east-vpc"],
  "app": { "tailscale.com/cap/relay": [] }
}
```

**ROI for stranger / new-user phone↔Mac connectivity.** Low. Two same-tailnet devices on consumer networks almost always establish a direct WireGuard connection without intervention. The only case where Hermes would benefit is on networks with unusually hostile NATs where direct consistently fails — and even then, the *Mac* (not the phone) is the relay candidate, because iOS/Android clients cannot act as a relay per the OS restrictions above.

**What Hermes should do.**
- *Configure:* nothing.
- *Document for users:* "If your Hermes gateway Mac shows a Peer Relay badge on `tailscale status`, you can ignore it; Hermes does not require Peer Relay."
- *Avoid:* conflating Tailscale Peer Relay (a network-layer traffic relay) with any application-level "Hermes account relay" feature. Same word, different layer — keep them visually distinct in UI.

---

## Topic B — Access Control / Grants / ACLs ([3] · [1])

**Deny-by-default is absolute.** Tailscale's policy is *deny-by-default*: "By default, all connections between devices in your Tailscale network … are denied unless explicitly permitted through your tailnet policy file." This applies to both legacy `acls` and the newer `grants` syntax — they share the same zero-trust model.

**Grants vs. ACLs.** Grants are a superset of ACLs: they support the same `src`/`dst`/`ip` fields *plus* `app` capabilities (peer API, file sharing, Peer Relay, etc.). Anything you can express in `acls` you can express in `grants`. Per Tailscale, either works; grants are the recommended path.

**Port-level grants work the way you'd expect.** A grant with `"ip": ["tcp:443", "tcp:8642", "tcp:8765"]` allows TCP to ports 443, 8642, and 8765 on the destination. So Hermes's two gateway ports get exactly two entries:

```json
{
  "grants": [
    {
      "src":  ["autogroup:self"],
      "dst":  ["autogroup:self"],
      "ip":   ["tcp:8642", "tcp:8765"]
    }
  ]
}
```

**`autogroup:self` vs. tags vs. shared devices** (per [1]):
- `autogroup:self` selects "a user's own devices" — perfect for the phone→Mac case where a user reaches their own gateway from their own phone.
- Tags (`tag:foo`) identify owner-managed headless infrastructure — right for a Mac that should be reachable as a *server*.
- Shared devices let you expose a single node to a specific user without exposing the whole tag — useful if the Hermes Mac is a shared household Mac.
- The combination above (`autogroup:self → autogroup:self`) means: "let a user hit their own devices from their own devices" — the standard "personal device-to-personal device" pattern.

**Why Tailscale can show "Connected" while Hermes HTTP on port 8642/8765 fails.** Tailscale's connection indicator reflects the WireGuard tunnel state between two nodes (and the resolution of the MagicDNS/100.x.x.x address). It does *not* reflect per-port policy enforcement. Under deny-by-default, the tunnel can be up while the policy denies traffic to a particular TCP port — which is exactly the "I can ping the Mac but my Hermes app gets a connect timeout" symptom.

**Does this explain never connecting to the Mac mini?** Yes, almost certainly *if*:
- the tailnet is on the default deny policy or any policy that does not explicitly allow `tcp:8642` and `tcp:8765`,
- the Mac is on a different OS user than the phone's owner (so `autogroup:self` won't reach it), or
- the Mac has been tagged and the phone is not (so the dst selector misses it).

If the phone and Mac are both owned by the same user and the policy is default-open (`{"grants":[{"src":["*"],"dst":["*"],"ip":["*"]}]}`), then ACLs are not the bug — and the issue is connectivity, DNS, or the Hermes app's local port binding.

**What strangers / first-time Hermes users need documented.**
1. They need a tailnet, and their phone + Hermes Mac must be in it.
2. The Hermes gateway ports (`tcp:8642`, `tcp:8765`) need to be allowed by policy.
3. The simplest, safest policy template is "self-to-self on those ports" using `autogroup:self`.
4. They should *not* run Tailscale with ACLs disabled ("Disable ACLs" toggle) — that breaks the deny-by-default model.

**Igor's personal tailnet — should he change ACL?** Only if the Mac mini currently cannot be reached from his phone on those ports and `tailscale status` shows the tunnel as direct/reachable. If he is the only user and only owns the two devices, a minimal `autogroup:self` grant with the two TCP ports is the right hardening move; otherwise leaving the default permissive ACL on a personal tailnet is fine. No change needed for peer-relay reasons.

---

## Renaming the in-app "Relay" toggle to "Tailscale"

**Verdict: accurate and worth doing, with a small caveat.**

- "Tailscale" is what the connection is. The relay label is overloaded (DERP servers, peer relay, app-level Hermes relay) and confuses non-network users.
- Rename to **"Tailscale connection"** or **"Connect via Tailscale"** in Settings.
- The renaming is *accurate*, not a lie, because Hermes itself is a Tailscale client — peer-relay is a separate, optional optimisation and the user never needs to toggle it.

**What to configure vs. ignore for Hermes Mobile**

| Area | Configure | Ignore |
| --- | --- | --- |
| Peer Relay | Nothing. Hermes Mobile does not require it. | Do not expose a "peer relay" toggle to users. |
| Grants / ACLs | A single grant: `autogroup:self → autogroup:self`, `ip: ["tcp:8642","tcp:8765"]`. Optional: add `tag:hermes-gateway` on the Mac and switch dst to that tag for shared/household setups. | Don't ship a "Tailscale ACL editor" inside Hermes. Link users to `login.tailscale.com/admin/acls/file` and only if they ask. |
| Version | Tailscale ≥ 1.86 on gateway Mac and on phone clients. | Older versions. |
| Admin role | Owner / Admin role required to grant `tailscale.com/cap/relay` *if* you ever decide to enable peer relay. | Not needed for the basic self→self grants. |

**Bottom line for the two named symptoms**
- "Never connecting to Mac mini" → almost always an ACL/policy gap on `tcp:8642`/`tcp:8765`, not Peer Relay. Fix with the `autogroup:self` grant above.
- "Tailscale says Connected but Hermes requests fail" → expected under deny-by-default when ports aren't in policy. Re-check the grant.

Sources: [11], [1], [3], [19].

## References

1. *Grants syntax · Tailscale Docs*. https://tailscale.com/docs/reference/syntax/grants
2. *Manage permissions using ACLs*. http://tailscale.com/docs/features/access-control/acls
3. *Access control - Tailscale Docs*. https://tailscale.com/docs/features/access-control
4. *Grants vs. ACLs*. http://tailscale.com/docs/reference/grants-vs-acls
5. *Syntax reference for the tailnet policy file*. http://tailscale.com/docs/reference/syntax/policy-file
6. *Grants · Tailscale Docs*. https://tailscale.com/docs/features/access-control/grants
7. *Grant examples · Tailscale Docs*. https://tailscale.com/docs/reference/examples/grants
8. *Grants syntax*. http://tailscale.com/docs/reference/syntax/grants
9. *Tailscale Serve examples*. https://tailscale.com/docs/reference/examples/serve
10. *Manage network and application access with Tailscale Grants*. https://tailscale.com/blog/acl-grants
11. *Tailscale Peer Relays · Tailscale Docs*. https://tailscale.com/docs/features/peer-relay
12. *Tailscale_Relay/README.md at main - GitHub*. https://github.com/LoopeyTheGreat/Tailscale_Relay/blob/main/README.md
13. *Tailscale Peer Relays is now generally available*. https://tailscale.com/blog/peer-relays-ga
14. *DERP servers · Tailscale Docs*. https://tailscale.com/docs/reference/derp-servers
15. *Make Tailscale NAT Traversal More Stable with Peer Relay*. https://blog.therainisme.com/posts/tailscale-peer-relay
16. *Tailscale - App Store - Apple*. https://apps.apple.com/us/app/tailscale/id1475387142
17. *Introducing Tailscale Peer Relays*. https://tailscale.com/blog/peer-relays-beta
18. *FR: Peer Relay Operator & ENV support · Issue #17791*. https://github.com/tailscale/tailscale/issues/17791
19. *Grants vs. ACLs*. https://tailscale.com/docs/reference/grants-vs-acls
20. *Tailscale's Peer Relays will change how you connect to self ...*. https://www.xda-developers.com/tailscale-peer-relay-change-connect-self-hosted
21. *Application-defined capabilities · Issue #4217 · tailscale ...*. http://github.com/tailscale/tailscale/issues/4217
22. *http://github.com/Chesszyh/tailscale-docs/blob/master/features/tailnet-policy-file/ip-sets/index.md*. http://github.com/Chesszyh/tailscale-docs/blob/master/features/tailnet-policy-file/ip-sets/index.md
23. *Connection types · Tailscale Docs*. https://tailscale.com/docs/reference/connection-types
24. *Android: Stuck on DERP / Fails to establish direct connection ...*. https://github.com/tailscale/tailscale/issues/19297
25. *Group visibility on Tailscale clients*. https://tailscale.com/docs/features/group-visibility-clients
26. *How Aperture grants work · Tailscale Docs*. https://tailscale.com/docs/aperture/how-grants-work
27. *Group devices with tags · Tailscale Docs*. https://tailscale.com/docs/features/tags
28. *Tagged server can access subnet routes when ACL should ...*. https://github.com/tailscale/tailscale/issues/8726
29. *FR: add new action type "deny" for ACL · Issue #6915*. https://github.com/tailscale/tailscale/issues/6915
30. *FR: Tags for mullvad exit nodes in ACL · Issue #11574*. https://github.com/tailscale/tailscale/issues/11574
31. *When creating an ACL-Tag for port 53, the Services (alpha) ...*. https://github.com/tailscale/tailscale/issues/6205
