# Public Hermes Dashboard SaaS: Architecture Decision (July 2026)

Research run: `trun_d3be5e813aa9497081c4bcec4fdffd29` (`pro-fast`, completed 2026-07-19), chained from market run `trun_fc3268d892f541d6a8b57d2d5921d234`.

## Decision

**CONDITIONAL GO** for a public, multi-tenant subscription control plane that pairs with a user's own Hermes machine. **NO-GO** for another generic "sync my AI chats" product.

The local dashboard at `127.0.0.1` is a useful diagnostic prototype, not the subscription product. A public product requires web identity, tenant isolation, billing entitlements, a separately authenticated local connector, an outbound relay, revocation, audit records, and a narrowly authorized remote-command protocol.

Build only after three paid design partners accept the safety/governance wedge. CloudCLI already offers a mature web/mobile UI for Claude Code, Cursor, Codex, and Gemini, with a hosted product starting at EUR 7/month. Hermes therefore cannot win on thread browsing alone. It can win if it safely detects and stops runaway or destructive agent behavior while preserving local control.

**Positioning:** "CloudCLI shows what your agent did. Hermes shows the session burning money or approaching a destructive action, and lets an authorized operator stop it from a phone."

## Direct answer: how does a customer find or pair Hermes?

The customer should **not** paste a model-provider API key or a long-lived Hermes bearer token into the website.

Use two separate identities:

1. A **human identity** signs into the website with Google or Apple. Its browser session is scoped to an organization and roles.
2. A **device identity** belongs to the installed Hermes Connector. On first start, the connector generates a hardware-local asymmetric keypair. The private key stays in macOS Keychain, Windows DPAPI, or Linux Secret Service; only the public key is registered.

Pairing then works like this:

```text
Hermes Connector            SaaS control plane                 Signed-in browser
      |                              |                                |
      |-- create pairing request --->|                                |
      |<- short code + QR + expiry --|                                |
      |                              |<-- enter/scan code ------------|
      |                              |--- show device + fingerprint -->|
      |                              |<-- explicit approval -----------|
      |-- redeem code + key proof -->|                                |
      |<- device ID + short access --|                                |
      |   token + rotating refresh   |                                |
      |== outbound WSS over 443 =====|<==== authorized web session ====|
```

The short code is a one-time pairing grant, not an API key. Make it single-use, expire it after 10 minutes, rate-limit attempts, and require the logged-in user to confirm the machine name and a public-key fingerprint. A QR may embed the complete verification URL, but the user must still see and confirm the short code; RFC 8628 explicitly calls this out as protection against remote phishing.

After approval, issue:

- a stable, opaque `device_id`;
- a short-lived access token (5–15 minutes) scoped to that device, organization, and allowed protocol actions;
- a rotating refresh credential bound to the connector's public key; and
- a server-side revocation record.

Every refresh and high-value command should require proof of possession by the device key. A stolen bearer string alone must not be sufficient. OAuth 2.0 Security BCP recommends sender-constrained access tokens such as DPoP or mutual TLS; the connector can implement the same principle even if the first protocol is application-specific.

The connector initiates an **outbound-only WSS connection on port 443**. There is no inbound firewall rule, public IP discovery, router configuration, or customer Tailscale account. Tailscale Serve can remain an optional private deployment mode, but Funnel is the wrong default: it requires Tailscale configuration, is limited to tailnet DNS names and specific ports, and makes the local service public.

## Reference architecture

```text
Google / Apple
      |
      v
WorkOS AuthKit ----> Web app / API ----> Postgres control data
                           |                    |
Stripe Checkout ----------+             orgs, users, devices,
Stripe Billing/Portal/                   subscriptions, grants,
Entitlements webhooks                    audit, thread metadata
                           |
                    Cloudflare Worker
                           |
                  Durable Object relay
                    /             \
          browser WSS               connector WSS (outbound)
                                           |
                                  local Hermes gateway
                                           |
                                local sessions and safeguards
```

Recommended service boundaries:

- `app.<domain>`: public marketing, sign-in, subscription, dashboard.
- `api.<domain>`: organization, device, pairing, billing, audit, and metadata APIs.
- `relay.<domain>`: WSS upgrade endpoint and stateful routing.
- one relay coordinator per organization or bounded device shard, not one process per customer.

Cloudflare Durable Objects are a credible relay candidate because their hibernation API preserves WebSocket connections while the object sleeps. Incoming messages are billed at a 20:1 ratio and outgoing messages are not request-billed. Costs depend on connection and message patterns, however, so the product must load-test its actual heartbeat, telemetry, and transcript traffic before making margin claims.

### Vendor and cost decision matrix

| Layer | Recommended | July 2026 public price signal | Decision boundary |
|---|---|---|---|
| Identity | WorkOS AuthKit | first 1M active users free; next 1M USD 2,500/month | Best fit for social login now and enterprise SSO later |
| Identity fallback | Clerk | Hobby 50K MRU/app; Pro USD 25 monthly or USD 20 billed annually | Choose only if framework integration saves meaningful delivery time |
| Billing | Stripe Checkout + Billing + Portal + Entitlements | payment processing plus Billing at 0.7% of Billing volume; Tax additional | Keep Stripe as billing truth and application DB as authorization projection |
| Relay | Cloudflare Workers + Durable Objects | Workers Paid USD 5 minimum; DO includes 1M requests/month then USD 0.15/M plus duration/storage | Use hibernating inbound WebSockets; benchmark real traffic before margin claims |
| Private-network option | Tailscale Serve | plan-dependent | Optional enterprise/self-host mode, not universal onboarding |
| Public reverse tunnel | Tailscale Funnel | plan-dependent and configuration-constrained | Reject as the default pairing/relay architecture |
| Control data | Managed Postgres with RLS-capable tenant controls | select only after measured storage, backup, and egress comparison | Provider is replaceable; tenant isolation tests are not |

## Identity recommendation

### Default: WorkOS AuthKit

Use WorkOS AuthKit from the first public build:

- it supports Google and Apple social login;
- organizations, MFA, RBAC, and passkeys are in the same product;
- it leaves a direct path to SAML/OIDC enterprise SSO and Directory Sync;
- the July 2026 price page lists the first 1 million monthly active users free, then USD 2,500 per additional million; enterprise SSO connections are USD 125 each for the first 15.

This is a recommendation, not a claim that auth is free forever. Record the commercial terms at implementation time and keep internal `users`, `organizations`, and `memberships` keyed by provider-independent IDs so a vendor migration remains possible.

Clerk is the reasonable second choice if its UI/SDK integration materially accelerates the selected web framework. Its current Hobby tier lists 50,000 monthly retained users per app; Pro is USD 25/month or USD 20/month billed annually. The earlier automated report's 10,000-user figure was stale.

For either provider, use Authorization Code + PKCE, exact redirect URI matching, issuer and nonce validation, secure HTTP-only cookies for the web session, and no provider tokens in local storage.

### Apple is the setup constraint

Google requires a Cloud project, OAuth client, consent screen, registered redirect URI, and server-side ID-token validation.

Sign in with Apple for the web additionally requires:

- Apple Developer Program enrollment (USD 99/year for an individual or organization; USD 299 is the separate Enterprise Program);
- an organization D-U-N-S number if enrolling as an organization;
- a primary Apple-platform App ID enabled for Sign in with Apple;
- a Services ID associated with that App ID;
- registered domains/subdomains and exact HTTPS return URLs; and
- a Sign in with Apple private key used to sign developer tokens, stored only in a secret manager and rotated by creating a new key before revoking the old one.

Apple's current documentation says no server file upload is required to register the web domains. The automated research draft's DNS-file assertion was wrong.

## Subscription and entitlement design

Use Stripe Checkout for purchase, Billing for the subscription lifecycle, Customer Portal for self-service changes, and Entitlements for features such as:

- number of paired devices;
- live remote control;
- retention period;
- team seats and roles;
- advanced watchdog rules; and
- audit export.

Stripe is the billing source of truth, but the application should persist a local entitlement projection for fast authorization. Webhook processing must:

- verify `Stripe-Signature` against the raw request body;
- store processed event IDs and be idempotent;
- accept that Stripe does not guarantee event order;
- retrieve current Stripe objects when reconciliation is needed;
- process asynchronously and return promptly; and
- periodically reconcile local entitlements against Stripe's API.

Do not grant device or remote-command access solely from `checkout.session.completed`. Authorize from the current internal entitlement projection, and fail closed for sensitive commands if billing state cannot be confirmed within a defined grace window.

Current public list prices include 2.9% + USD 0.30 for domestic online card payments and 0.7% of Billing volume for pay-as-you-go Stripe Billing. Stripe Tax is additional when used. The automated report omitted the Billing fee, so its gross-margin calculation is not decision-grade.

## Minimum data model

| Entity | Required fields and boundaries |
|---|---|
| `users` | internal ID, auth-provider subject(s), verified-email state |
| `organizations` | tenant ID, name, policy mode, retention setting |
| `memberships` | user, org, role, status; unique per user/org |
| `billing_customers` | org, Stripe customer; no card data |
| `entitlements` | org, lookup key, state, effective timestamps, source event |
| `devices` | org, device ID, public key, name, platform, version, last seen, revoked at |
| `pairing_grants` | hashed device code, short-code hash, key thumbprint, expiry, attempts, consumed at |
| `device_credentials` | credential ID, device, token family, rotation/revocation timestamps; store hashes, not raw refresh secrets |
| `threads` | org, device, local thread ID, title policy, timestamps, latest sequence, deletion state |
| `thread_events` | existing Hermes schema plus org/device binding, monotonic sequence, idempotency key |
| `commands` | org, target device/thread, typed command, requester, approval, expiry, state, idempotency key |
| `audit_events` | append-only actor, action, target, result, request ID, timestamp, source IP/device metadata |

The existing `packages/hermes-protocol` is useful groundwork: it already enforces account-scoped bearer authentication, monotonic per-thread `seq`, deterministic projection, tombstone deletion, and idempotent client `mutation_id` handling. It does **not** yet provide public-SaaS identity, device credentials, organizations, billing, WebSockets, remote control, or browser/mobile wiring. Preserve its event guarantees, but replace its static token map at the public boundary with the device-identity design above.

## Remote-command safety contract

Do not expose a raw terminal or arbitrary PID kill endpoint as the first public feature. Define typed, versioned commands:

- `session.stop`
- `session.pause`
- `approval.respond`
- `message.submit`

Each command carries `command_id`, `org_id`, `device_id`, `thread_id`, `issued_at`, `expires_at`, requester identity, and an idempotency key. The server checks tenant, role, entitlement, device status, command scope, and freshness; the connector independently validates the same target and rejects unknown command kinds.

For destructive or high-impact actions:

- require recent reauthentication/passkey or MFA;
- display the exact device, thread, and action;
- use a short expiry and prevent replay;
- never accept arbitrary shell fragments;
- record request, approval, delivery, execution result, and timeout as separate immutable audit events; and
- give the connector a local deny policy that cloud authorization cannot override.

## Privacy recommendation

Default to **metadata-only cloud storage plus on-demand encrypted relay**, not server-readable transcript storage.

Store only what is required to list and route threads: tenant/device IDs, opaque local thread ID, timestamps, status, token/cost aggregates, watchdog signals, and optionally a user-controlled title. Retrieve message bodies from the online connector when the user opens a thread; do not retain them after the relay response by default.

This choice limits offline history and cloud-wide full-text search, but aligns with the local-first buyer and materially reduces breach impact. If customers later demand offline continuity, add an explicit encrypted-sync mode with documented server visibility and retention. Do not market ordinary KMS-at-rest encryption as end-to-end encryption. True E2EE would keep plaintext and content keys away from the service and would require a separate multi-device key design.

Treat prompts, outputs, filenames, tool calls, command arguments, and thread titles as potentially sensitive. Apply deletion and export rules to metadata as well as content.

## Threat model and release gates

| Threat | Required mitigation before public beta |
|---|---|
| Pairing-code phishing | signed-in approval, displayed code and device fingerprint, short expiry, single use, attempt limits |
| Stolen connector credential | hardware-local key, sender-constrained short tokens, refresh rotation, revoke device/token family |
| Cross-tenant access | org key on every row/object, centralized authorization, database RLS/constraints, negative tenant-isolation tests |
| Browser/session theft | HTTP-only secure cookies, CSRF defenses, PKCE/nonce/issuer checks, recent reauth for control actions |
| Relay replay or reorder | command IDs, expiry, monotonic sequence, idempotency, connector-side state checks |
| Arbitrary remote execution | typed allowlisted commands only; no arbitrary shell/PID parameters |
| Compromised control plane | local connector deny rules, least-privilege command scopes, audited emergency revocation |
| Billing race/fraud | signed idempotent webhooks, local projection, API reconciliation, bounded grace policy |
| Sensitive transcript leak | metadata-only default, no relay caching, encryption in transit, retention and deletion tests |
| Connector supply-chain compromise | signed/notarized releases, verified update manifest, rollback, SBOM and dependency scanning |

## Product and pricing gates

Pricing is a hypothesis until someone pays. The verified market evidence rejects a USD 8–12/month generic sync product because CloudCLI and open source already anchor that category. Test:

- **Solo Safety:** USD 15/month, 2 devices, live watchdog and remote stop.
- **Team Control:** USD 39/user/month with a USD 99/month minimum, RBAC, approvals, and audit retention.
- **Enterprise:** annual contract, SSO connection and compliance/export costs passed through or included explicitly.

Do not claim unit economics from vendor list prices alone. Model at least three measured workloads: idle connector, active chat streaming, and high-frequency telemetry. Include payment fees, auth, database, storage, relay messages and compute, observability, support, refunds, taxes, and incident response.

Stage gates:

1. **Paid discovery:** clickable product narrative, security architecture, and three paid design partners. No broad build before this gate.
2. **Private alpha:** Google + Apple sign-in, Stripe test/live separation, connector pairing, device online/offline state, thread metadata, revoke device.
3. **Safety beta:** live watchdog events and typed `session.stop`, with reauthentication, local policy enforcement, audit, replay and tenant-isolation tests.
4. **Continuity:** on-demand thread content and `message.submit`; prove deterministic recovery using the existing Hermes protocol.
5. **Teams:** invitations, RBAC, approval policies, audit export, SAML/OIDC only when a paying buyer requires it.

## Corrections to the automated research output

The raw Parallel output is retained in `parallel-research/` for provenance, but these claims must not be used:

- "Category vacuum confirmed" — false; CloudCLI is a direct, funded and open-source competitor.
- Clerk free tier of 10,000 MAU — stale; the current page lists 50,000 MRU per app.
- Apple organization membership at USD 299/year — false; ordinary individual/organization enrollment is USD 99/year, while the Enterprise Program is USD 299.
- DNS association-file upload for Apple web domains — contradicted by current Apple documentation.
- Stripe has no subscription fee — incomplete; Stripe Billing pay-as-you-go is currently 0.7% of Billing volume in addition to payment processing.
- Device-key binding can wait until v2 — unsafe; bind the pairing grant and resulting device credential to the connector public key in v1.
- Server-readable transcripts should be the default — strategically misaligned with a local-first safety product.
- Fixed COGS, 78% gross margin, 5,000-subscriber break-even, and 90-day subscriber forecasts — unsupported without measured workloads and verified acquisition data.

## Primary sources

- [CloudCLI product](https://cloudcli.ai/) and [open-source repository](https://github.com/siteboon/claudecodeui)
- [WorkOS pricing](https://workos.com/pricing), [AuthKit social login](https://workos.com/docs/authkit/social-login), and [AuthKit authentication API](https://workos.com/docs/reference/authkit/authentication)
- [Clerk pricing](https://clerk.com/pricing)
- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
- [Apple web configuration](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/), [private key lifecycle](https://developer.apple.com/help/account/capabilities/create-a-sign-in-with-apple-private-key), and [program enrollment](https://developer.apple.com/help/account/membership/program-enrollment/)
- [RFC 8628 device authorization](https://www.rfc-editor.org/rfc/rfc8628.html) and [RFC 9700 OAuth security BCP](https://datatracker.ietf.org/doc/html/rfc9700)
- [Stripe Billing pricing](https://stripe.com/billing/pricing), [Customer Portal](https://docs.stripe.com/customer-management), [Entitlements](https://docs.stripe.com/billing/entitlements), and [webhook delivery/security](https://docs.stripe.com/webhooks)
- [Cloudflare Durable Objects WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) and [pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Tailscale Funnel requirements and limitations](https://tailscale.com/docs/features/tailscale-funnel)

## Final build/no-build rule

Build the public control plane only when paid design partners validate the safety-and-governance value. If they only want chat history and cross-device continuation, do not build: CloudCLI and open source already serve that demand. If they will pay for safe remote intervention, auditable approvals, and a connector that never opens their machine to the internet, this architecture is the correct starting point.
