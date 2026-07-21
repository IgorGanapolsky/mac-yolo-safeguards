# Tailscale peer-relay + ACL/grants + Aperture — Hermes Mobile verdict (2026-07-21)

Deep research done this session (not prior). Primary docs + Parallel runs:

- Peer-relay + ACL: `parallel-research/tailscale-peer-relay-acl-hermes-2026-07.md` (`trun_bab0de69f552490ca11ef4b58b28650d`)
- Aperture follow-up: `parallel-research/tailscale-aperture-hermes-followup-2026-07.md` (`trun_986263221574488f9aec154704918207`, `--previous-interaction-id` of the first)

Sources: [peer-relay](https://tailscale.com/docs/features/peer-relay), [access-control](https://tailscale.com/docs/features/access-control), [grants](https://tailscale.com/docs/features/access-control/grants), [Aperture](https://tailscale.com/docs/aperture/what-is-aperture).

## Combined HELP / PARTIAL / NO

| Topic | Verdict | Action |
| --- | --- | --- |
| **Peer Relay** | **PARTIAL** | Understand; **do not enable or ship**. Same-tailnet phone↔Mac almost always goes **direct → (optional peer-relay) → DERP**. Not our product surface. |
| **ACL / Grants** | **HELP** (diagnostics + stranger docs) | Deny-by-default can show Tailscale “Connected” while `:8642`/`:8765` are blocked. Verify policy; document for strangers. Do **not** blindly replace a working open personal ACL with a narrow grant. |
| **Aperture** | **NO** | Org LLM reverse-proxy / AI governance. Orthogonal to Hermes leash + Mac gateway. Ignore for product. |

## What each thing actually is

### Peer Relay (3 bullets)

- A **same-tailnet** high-throughput UDP relay node used only when **direct WireGuard fails** (strict NAT); preference is direct → peer-relay → DERP.
- Must be **explicitly** configured (`tailscale set --relay-server-port=…`) plus a grant with `tailscale.com/cap/relay`. Phones/Android/iOS can *use* a relay; they cannot *be* one (macOS/Linux/Windows can).
- Irrelevant to Hermes product code. Not an exit node. Not “Hermes account relay.”

### Access control (ACL / grants)

- Tailnet policy is **deny-by-default** unless you still run a permissive default (`src/dst/ip *`).
- Grants (recommended) can allow `tcp:8642` and `tcp:8765` phone→Mac while Tailscale UI still shows Connected when those ports are denied.
- Can explain “never reach Mac mini” **when** the tunnel is up but HTTP to gateway ports fails. Historical Igor incidents were often **wrong key / app state with a healthy Tailscale path** — check ACL only after a port probe fails.

### Aperture

- Centralized **LLM/AI gateway**: reverse proxy between clients and providers; injects org API keys; cost/telemetry/guardrails; identity from Tailscale.
- Does **not** replace Hermes pairing, gateway API keys, or `:8642` HTTP. Does **not** conflict unless someone wrongly routes Hermes through it.
- Enterprise AI governance — not the phone↔Mac leash path.

## Settings UI “Relay” copy

**Do not rename to “Tailscale.” That would be a lie.**

`SettingsScreen` copy (“Relay is the default path for approvals…”, “Hermes account relay”) means the **Hermes cloud / account approval relay** (`connectionMode: 'relay'`), not Tailscale peer-relay, DERP, or Aperture.

If copy changes later: clarify *Hermes account relay* vs *Tailscale transport* — never collapse the words.

## What to configure (Igor + strangers)

1. **Peer-relay:** nothing. No app feature. No tailnet peer-relay setup for v1.
2. **Aperture:** nothing. Do not onboarding-document it.
3. **ACL/grants:**
   - **Igor:** if phone→`100.x:8642` / `:8765` already works, leave policy alone. If Tailscale is Connected but those ports time out, inspect Access Controls and ensure phone→Mac TCP for those ports (e.g. `autogroup:self` / member→self grant). Prefer **verify**, not “harden by replacing `*` with only two ports” (that can break SSH and other tools).
   - **Strangers:** document “phone + Mac on same tailnet; policy must allow TCP 8642 and 8765.” Optional pasteable grant snippet in onboarding/troubleshooting — not an in-app ACL editor.
4. **App code:** no peer-relay or Aperture implementation. Optional later: clearer “Hermes account relay” wording only.

## Explicit non-goals

- Do not implement Tailscale peer-relay in Hermes Mobile.
- Do not route Hermes through Aperture.
- Do not treat Settings “Relay” as Tailscale.
