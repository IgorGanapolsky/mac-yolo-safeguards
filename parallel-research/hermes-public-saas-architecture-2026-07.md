# Hermes Multi-Tenant SaaS Architecture Decision Report (July 2026)

## Executive Summary

- **Category Vacuum Confirmed**: As of mid-2026 no product unifies a public cloud control plane for browsing, continuing, forking, sharing, and monitoring chat threads across Claude Code, Cursor, Codex CLI, OpenCode, Hermes, grok-cli, and Ollama-based agents; every native tool keeps history local or account-bound, granting a defensible 12-18 month wedge ([70]).
- **SSO Build-vs-Buy Defaults to Buy**: Clerk free covers 10K MAU with Google + Apple at $0/mo and is the lowest-friction path; Better Auth is the only viable self-host but costs 1-2 engineer-weeks of hardening for production ([167], [158]).
- **Stripe Billing is Mandatory**: Stripe Checkout + Billing + Customer Portal + Entitlements + Stripe Tax is the only production-tested combo; pricing is 2.9% + $0.30 per transaction with no subscription fee ([154], [145]).
- **Pairing is RFC 8628 Device Authorization Grant**: A standardized, recoverable, NAT-friendly flow that needs no inbound firewall holes; the device polls HTTPS outbound while the user types a short `user_code` at a verification URL ([136]).
- **Relay is Cloudflare Workers + Durable Objects with WebSocket Hibernation**: Free tier covers 100K requests/day; the hibernation API keeps long-lived WS connections open without per-second CPU billing, ideal for the dashboard-to-agent pattern ([106], [41]).
- **Privacy MVP = Server-Readable with Tenant-Managed Keys**: AES-256-GCM with per-tenant DEKs wrapped by KMS gives GDPR-grade crypto-shred without breaking search; full E2EE with MLS or libsignal is reserved for enterprise tier.
- **Unit Economics Hold at $12/mo Pro**: COGS at 1K subscribers is ~$2.70/sub/mo, giving 78% gross margin and break-even around 5K subs.
- **Top Three Kill Risks**: (1) Anthropic/OpenAI TOS escalation against third-party history aggregators, (2) local-first backlash against forced cloud sync, (3) Stripe Tax misconfiguration triggering EU VAT back-tax.
- **Recommendation: GO** with stage-gated milestones, server-readable MVP, Clerk + Stripe + Cloudflare DO stack, and a hard 90-day kill switch if KPIs miss.

## 1. Reference Architecture

The system is a four-plane SaaS: identity, control, data, and edge. All four communicate only through the relay, which is a stateful WebSocket gateway backed by Durable Objects.

### 1.1 Component Map

```
User Browser -> Stripe Checkout (billing)
              -> Clerk/WorkOS (identity + SSO)
              -> Cloudflare Worker (edge, WAF, TLS)
              -> Durable Object per tenant (relay state)
              -> Postgres (Supabase/Neon) - threads, audit, RLS
              -> R2/S3 (encrypted transcripts, attachments)
              -> Hermes Connector (per-machine agent)
                -> Hermes Agent runtime
                -> Ollama / Claude / OpenAI (BYOK or metered)
```

### 1.2 Edge Plane (Cloudflare)

- One Worker per route: `app.hermes.ai` (dashboard SPA), `api.hermes.ai` (REST), `relay.hermes.ai` (WebSocket upgrade).
- WAF rules block known-bad ASN ranges and botnets; Turnstile on signup and pairing.
- Durable Object classes: `TenantRelay` (1 per org, holds WebSocket fan-out), `PairingSession` (short TTL), `TokenVault` (per-tenant KMS handle).

### 1.3 Identity Plane (Clerk / WorkOS / Better Auth)

- Clerk for MVP and self-serve; WorkOS AuthKit for enterprise tier (SAML/SCIM).
- Better Auth as escape hatch only; runs in-app with Postgres, requires maintenance.

### 1.4 Data Plane

- Postgres with RLS enabled; every row keyed by `org_id`; RLS predicate `current_setting('app.org_id')`.
- R2 for blobs; SSE-KMS or per-tenant DEK envelope encryption.
- Optional pgvector for semantic search over thread titles and snippets.

### 1.5 Edge (User Machine)

- `hermes-connector` daemon: macOS launchd, Linux systemd, Windows service.
- Outbound WSS to `relay.hermes.ai:443`; no inbound ports.
- Subscribes to file changes in `~/.hermes/sessions/`.
- Runs in user keychain (macOS), DPAPI vault (Windows), libsecret (Linux).

## 2. SSO Build-vs-Buy Comparison

### 2.1 Pricing Matrix (2026)

| Provider | Free Tier | Pro / Production | Enterprise | SSO Add-ons | Notable Limits |
|---|---|---|---|---|---|
| Clerk | 10K MAU free | $25/mo + $0.02/MAU after 10K | Custom | SAML, SCIM (Enterprise) | 2 dashboard seats free |
| Auth0 (Okta) | 7.5K MAU B2C Essentials | $35/mo + $0.07/MAU B2C Essentials | Custom | SAML, SCIM all paid | Vendor lock-in |
| WorkOS AuthKit | 1M MAU free until Aug 2026 | Pay-as-you-go $0.05/MAU | Custom | SAML, SCIM, Directory Sync | Enterprise SSO = $0.25/MAU add-on |
| Supabase Auth | 50K MAU on Pro ($25/mo) | $0.0035/MAU overage | Custom | SAML paid tier | Tied to Postgres/Supabase |
| Better Auth | $0 (OSS) | $0 (infra) | $0 (DIY) | Plugins | You operate it |

### 2.2 Recommendation

- **MVP**: Clerk; production-grade auth-as-a-service in under a day.
- **Scale**: WorkOS AuthKit once SAML/SCIM demand emerges.
- **Avoid**: Auth0 for new builds unless Okta enterprise deal is in play.
- **Self-host**: Only Better Auth if compliance demands no third-party identity.

## 3. Stripe Billing Stack

### 3.1 Components

- **Checkout**: hosted payment page (subscription mode).
- **Billing**: recurring billing engine with proration and trials.
- **Customer Portal**: self-service plan/invoice management.
- **Entitlements API**: feature gating.
- **Tax**: automatic VAT/sales tax calculation.
- **Webhooks**: HMAC-SHA256 signed events.

### 3.2 Webhook Events to Handle

| Event | Action |
|---|---|
| `checkout.session.completed` | Activate subscription, set initial entitlements |
| `customer.subscription.created` | Same as above |
| `customer.subscription.updated` | Reconcile plan changes, update entitlements |
| `customer.subscription.deleted` | Deactivate, schedule purge |
| `invoice.paid` | Extend access, log receipt |
| `invoice.payment_failed` | Trigger dunning, downgrade after N attempts |
| `customer.tax.updated` | Refresh tax status |
| `billing_portal.session.created` | Log access (security audit) |

### 3.3 Verification

- Use `Stripe-Signature` header with `constructEvent` and a 5-minute tolerance window.
- Reject events older than 5 minutes to defeat replay.
- Store `event.id` in an idempotency table to prevent duplicate processing.
- Reference: [142].

## 4. Sign in with Apple Web Prerequisites

### 4.1 Apple Developer Program Requirements

- Individual: $99/year.
- Organization: $299/year.
- Required for any Sign in with Apple deployment.

### 4.2 Configuration Steps

- Register Services ID in Apple Developer portal (one per web domain).
- Create and verify the domain via DNS TXT record at `apple-developer-domain-association`.
- Generate Services ID client secret: ES256 JWT signed with `.p8` private key from App Store Connect API; regenerate every 6 months (max exp 6 months from iat).
- Configure Return URLs (must be HTTPS, exact match, pre-registered).
- Reference: [134].

### 4.3 Private Email Relay

- If user opts in, Apple provides `<unique>@privaterelay.appleid.com`; mail is forwarded to real address.
- Must configure outgoing SPF/DKIM for `privaterelay.appleid.com` or rely on Apple's SMTP relay.
- Reference: Apple Private Email Relay.

## 5. Device Pairing via RFC 8628

### 5.1 Why RFC 8628

The Device Authorization Grant (RFC 8628) is purpose-built for devices without rich input (TVs, CLI tools, IoT). It is ideal for `hermes-connector` because:

- No inbound ports required; connector polls an HTTPS endpoint.
- Survives NAT, captive portals, and intermittent connectivity.
- Standardized; libraries exist in Python (`authlib`), Go, Rust.

### 5.2 Sequence

```
Connector                  Hermes Backend                User Browser
   |                              |                            |
   | POST /device_authorization   |                            |
   |----------------------------->|                            |
   |<-- device_code, user_code --|                            |
   |  verification_uri, expires   |                            |
   |                              |                            |
   | (prints user_code + QR)      |                            |
   |                              |                            |
   |                              |  GET verification_uri      |
   |                              |<---------------------------|
   |                              |  user enters user_code     |
   |                              |  approves                  |
   |                              |--------------------------->|
   |                              |                            |
   | POST /token (device_code)    |                            |
   |----------------------------->|                            |
   |  slow_down error if polled   |                            |
   |  before interval             |                            |
   |                              |                            |
   | <-- access_token + refresh --|                            |
   |                              |                            |
```

### 5.3 Security Controls

- `user_code`: 8 alphanumeric chars, base32-derived, easy to type.
- `device_code`: 32+ bytes random, single-use, 15-minute TTL.
- `interval`: 5s default; back off on `slow_down` error.
- Bind `device_code` to a registered public key (deferred to v2); for MVP, allow by IP rate-limit (3 attempts / IP / 24h).
- After approval, mint JWT with `aud`, `org_id`, `device_id` claims.

## 6. Relay Provider Comparison

### 6.1 Comparison Matrix

| Provider | WebSocket | Long-lived | Approx Pricing | Limits |
|---|---|---|---|---|
| Cloudflare Workers + DO | Yes | Hibernation keeps state without CPU billing | Free: 100K req/day, 10M DO requests/mo; Paid: $5/mo + $0.15/M req | 128MB DO memory, 30s CPU wall, 30s WS idle on standard plan |
| Fly.io Machines | Yes | Persistent VMs | ~$1.94/mo for shared-cpu-1x 256MB continuous; $0.02/GB egress | Region-based, no global anycast |
| Tailscale Funnel | Yes (via local server) | Tunnel-only, requires user to run daemon | Personal: free up to 100 devices; Pro: $6/user/mo | Public HTTPS only, not WS-friendly; per-tailnet |
| Ably | Yes | Purpose-built Pub/Sub | Free: 200 peak channels, 6M msg/mo; Standard: $49/mo + overages | Vendor lock-in |
| Pusher | Yes | Hosted WS | Free: 100 connections, 200K msg/day; Pro: $49/mo | Limited concurrency on free |
| Cloudflare Tunnel (named tunnel) | Yes | Reverse proxy | Free for personal; Teams $7/seat/mo | Outbound-only requires daemon on host |

### 6.2 Recommendation

- Primary: **Cloudflare Workers + Durable Objects** with WebSocket hibernation.
- Fallback: **Fly.io Machines** for low-latency regional users.
- Avoid: Tailscale Funnel for production (requires user to run daemon, privacy implications).
- Avoid: Pusher/Ably for cost at 10K+ users (becomes $500+/mo).

## 7. Privacy Mode Architecture

### 7.1 Three Tiers

| Mode | What cloud sees | What user keeps | Search? | Use case |
|---|---|---|---|---|
| Server-readable | Full transcript | Audit log | Yes | Default Pro tier |
| Metadata-only + client-encrypted content | Thread IDs, timestamps, model, token counts | Encrypted bodies in cloud, keys local | Limited (server-side hash only) | Privacy-conscious Pro tier |
| Full E2EE | Metadata only | Bodies + keys local | Local-only | Enterprise tier |

### 7.2 MVP Default: Server-Readable with KMS

- Each tenant gets a CMK in KMS.
- Thread bodies encrypted with AES-256-GCM using a per-thread DEK.
- DEK is wrapped with the tenant CMK and stored alongside the ciphertext.
- GDPR right-to-erasure = KMS ScheduleKeyDeletion + rotate remaining threads.
- This is "crypto-shredding": destroying the key makes all ciphertext for that tenant permanently unreadable.

### 7.3 Enterprise E2EE (v2)

- Use libsignal or MLS for group key agreement.
- Client encrypts thread before upload; server stores ciphertext only.
- Search uses deterministic encryption + blind index (HMAC of word, store HMAC and allow server to filter without knowing plaintext).
- Trade-off: search ranking quality drops; "continue thread" requires client-side decryption.

## 8. Identity & Data Model

### 8.1 Entities and Relationships

```
Organization (1) --- (N) User
Organization (1) --- (N) Device
Organization (1) --- (1..N) Subscription (mirror of Stripe state)
Device (1) --- (1..N) Instance (a logical Hermes process)
Instance (1) --- (N) Thread
Thread (1) --- (N) Message
Organization (1) --- (N) AuditEvent
Organization (1) --- (N) PairingSession (transient)
User (N) --- (N) Device (membership for RBAC)
```

### 8.2 Key Columns

- `organization.id` UUID.
- `user.id` UUID, `clerk_id` text.
- `device.id` UUID, `device_pubkey` bytea, `hardware_fingerprint_hash` bytea.
- `instance.id` UUID, `device_id` UUID, `last_seen_at` timestamptz, `status` enum.
- `thread.id` UUID, `instance_id` UUID, `org_id` UUID, `started_at`, `ended_at`, `model`, `token_count`.
- `message.id` UUID, `thread_id` UUID, `role`, `ciphertext`, `nonce`, `created_at`.
- `audit_event.id` UUID, `org_id`, `actor_user_id`, `action`, `target`, `ip`, `ua`, `ts`.

### 8.3 Row-Level Security

```sql
ALTER TABLE thread ENABLE ROW LEVEL SECURITY;
CREATE POLICY thread_org_isolation ON thread
  USING (org_id = current_setting('app.org_id')::uuid);
```

- Every API request sets `SET LOCAL app.org_id = $1` from the verified JWT claim before any query runs.
- Defense-in-depth: app code never trusts client-supplied `org_id`.

## 9. API Surface

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/v1/auth/sso/google` | 302 | none | Start Google OIDC |
| `/v1/auth/sso/apple` | 302 | none | Start Apple OIDC |
| `/v1/auth/callback` | 302 | OAuth | OIDC callback |
| `/v1/devices/pair/start` | POST | JWT + step-up MFA | Issue pairing code |
| `/v1/devices/pair/poll` | POST | JWT (operator) | Poll for approval |
| `/v1/devices` | GET | JWT | List paired devices |
| `/v1/devices/{id}` | DELETE | JWT + MFA | Revoke device |
| `/v1/instances/{id}/threads` | GET | JWT + scope | List threads |
| `/v1/instances/{id}/threads/{tid}` | GET | JWT + scope | Read thread |
| `/v1/instances/{id}/threads/{tid}/continue` | POST | JWT + MFA | Continue thread |
| `/v1/instances/{id}/threads/{tid}/approve` | POST | JWT + MFA | Approve tool call |
| `/v1/instances/{id}/threads/{tid}/stop` | POST | JWT + MFA + RBAC | Remote stop |
| `/v1/billing/portal` | 302 | JWT | Stripe portal |
| `/v1/billing/webhook` | POST | Stripe-Signature | Webhook ingest |
| `/v1/ws/relay` | WS | JWT + device claim | Bidirectional stream |

### Security Requirements

- All mutating endpoints require WebAuthn step-up MFA (no exception for billing).
- All endpoints require HTTPS in prod; HSTS preload; CSP `default-src 'self'`.
- Origin/Referer checks on every state-changing endpoint.
- 60s idle timeout, 8h absolute on dashboard sessions.

## 10. Threat Model (STRIDE)

### 10.1 Primary Threats

- **Spoofing (Account Takeover)**: Mitigated by mandatory MFA + WebAuthn step-up.
- **Tampering (Replay)**: Mitigated by monotonic seq + HMAC per WS frame; nonce tracking.
- **Repudiation**: Mitigated by append-only HMAC-chained audit log; daily anchor in object storage.
- **Information Disclosure (Cross-Tenant)**: Mitigated by Postgres RLS + per-tenant KMS key envelope.
- **Denial of Service**: Mitigated by per-IP/per-account rate limit, Durable Object backpressure, WS connection limits.
- **Elevation of Privilege (Rogue Device)**: Mitigated by owner/admin approval step, device cert pinning, scoped JWT.
- **Command Injection**: Mitigated by structured RPC schema (no free-form shell), input validation at edge.

### 10.2 Specific Attack Scenarios

- **Stolen Pairing Code**: 15-min TTL, single-use, MFA required to consume, IP/ASN binding optional.
- **SSRF on Webhook**: Stripe webhook is allowlisted; outbound from webhook handlers restricted to RFC 1918 deny.
- **Replay Attack**: Nonce table + monotonic counter; reject duplicates.
- **CSRF**: SameSite=Strict cookies + double-submit token for state-changing endpoints.
- **Command Injection in Tool Calls**: Tool calls are structured JSON validated against schema; no string-eval.
- **Rogue Device Enrollment**: Owner approval gate + device cert pinning + RBAC.
- **Remote Kill Abuse**: MFA + RBAC + 60s cooldown + audit log + push notification.

## 11. Local Log Ingestion

### 11.1 Discovery

- Hermes stores sessions in `~/.hermes/sessions/` (JSONL) and `~/.hermes/state.db` (SQLite).
- Connector uses platform-native file watchers: FSEvents (macOS), inotify (Linux), ReadDirectoryChangesW (Windows).
- Poll interval: 1s; debounce: 250ms; batch flush: 2s.

### 11.2 Ingestion Modes

| Mode | Transport | Latency | Cost | Use Case |
|---|---|---|---|---|
| WebSocket push | Persistent outbound WSS | < 1s | $0.15/M msg | Paid plans |
| gRPC streaming | HTTP/2 + protobuf | < 1s | ~$0.04/M req | Low-latency enterprise |
| HTTPS batch | POST every 30s | ~30s | $0.50/M req | Free tier |
| Local SQLite replication | Litestream-style WAL | ~5s | $0 (local) | Air-gapped |

### 11.3 Privacy Guardrails

- Configurable regex deny-list for secrets before any send.
- Hash-only mode (SHA-256 of bodies) for search without disclosure.
- Local dry-run mode that logs without uploading.

## 12. Unit Economics

### 12.1 Variable Cost Per Subscriber

| Line Item | 100 subs | 1K subs | 10K subs |
|---|---|---|---|
| Stripe fees (2.9% + $0.30 on $12) | $0.65 | $0.65 | $0.65 |
| Stripe Tax | $0.50 | $0.50 | $0.50 |
| Clerk | $0.00 | $0.05 | $0.05 |
| Cloudflare DO + Workers | $0.50 | $0.30 | $0.15 |
| Postgres | $1.00 | $0.50 | $0.30 |
| Vector index | $0.50 | $0.20 | $0.10 |
| Storage (R2) | $0.20 | $0.15 | $0.10 |
| Observability | $0.50 | $0.20 | $0.10 |
| Egress/misc | $0.20 | $0.15 | $0.10 |
| **Total COGS/sub/mo** | **$4.05** | **$2.70** | **$2.05** |

### 12.2 Gross Margin

| Scale | MRR @ $12 | COGS total | Gross margin |
|---|---|---|---|
| 100 | $1,200 | $405 | 66% |
| 1,000 | $12,000 | $2,700 | 78% |
| 10,000 | $120,000 | $20,500 | 83% |

### 12.3 Break-Even

- Engineering cost (2 founders + 1 engineer @ market): ~$45K/mo all-in.
- Break-even at ~5,000 subscribers (~$60K MRR, ~$13.5K COGS).
- Requires 18-month ramp to 5K subs to reach operating breakeven without additional capital.

## 13. Vendor Lock-In Risks

### 13.1 Lock-In Matrix

| Vendor | Lock-in depth | Mitigation |
|---|---|---|
| Clerk | Medium | Mirror users to own Postgres; abstract via adapter |
| Stripe | Low | Stripe events are standard; export subscriptions via API |
| Cloudflare DO | Medium | Worker script portable; DO state requires migration |
| Apple SIWA | Low | Standard OIDC; user IDs are stable |
| Google OIDC | Low | Standard OIDC; subject is stable |

### 13.2 Mitigation Strategy

- All identity data mirrored to own Postgres nightly.
- Stripe subscription state also persisted locally; webhook events are idempotent.
- Worker scripts in TypeScript; portability to Fly.io or Vercel requires < 1 week of work.
- Cloudflare DO state exportable as JSON snapshot for migration.

## 14. Launch Checklist

### 14.1 Pre-Launch (T-30 to T-0)

- [ ] SOC 2 Type I evidence collection (Drata/Vanta)
- [ ] GDPR DPA + sub-processor list published
- [ ] Terms of Service + Privacy Policy reviewed by counsel
- [ ] Incident response runbook tested (on-call rotation, status page)
- [ ] Stripe Tax configured for EU, UK, US, CA, AU
- [ ] Webhook idempotency tested with replay tool
- [ ] Connector signed and notarized (macOS); signed with EV cert (Windows)
- [ ] Auto-update channel with rollback tested
- [ ] Penetration test completed; critical CVEs resolved
- [ ] Bug bounty program live on HackerOne or Bugcrowd
- [ ] Status page public (status.hermes.ai)
- [ ] Support docs, FAQ, troubleshooting guides published
- [ ] Onboarding video recorded and published
- [ ] Beta cohort of 50 paying users successfully onboarded
- [ ] NPS target >= 40 from beta cohort
- [ ] Churn rate target < 5% monthly from beta cohort

### 14.2 Launch Day (T-0)

- [ ] DNS cutover with low TTL in advance
- [ ] Monitoring dashboards live (Datadog/Grafana)
- [ ] On-call rotation active
- [ ] Press kit, Product Hunt submission prepared
- [ ] Customer support channels active (email, Discord, in-app)
- [ ] Stripe live mode keys configured
- [ ] Apple Services ID configured for production
- [ ] Google OAuth consent screen verified
- [ ] Connector download mirrors in 3+ regions (US, EU, APAC)
- [ ] Rollback plan documented and tested

## 15. 90-Day Staged Plan

### 15.1 Days 0-30: Foundations

- Stand up Clerk, Stripe, Cloudflare account.
- Build pairing service (Worker + DO) and connector MVP.
- Implement Stripe webhook handling and entitlement mapping.
- Internal dogfooding: 5 engineers using connector daily.
- Define schema for thread, message, audit, device.

### 15.2 Days 31-60: Closed Beta

- Recruit 50 paying beta users via waitlist.
- Implement dashboard v1: thread list, search, continue.
- Add Stripe Customer Portal integration.
- Add step-up MFA for pairing and remote stop.
- Apple SIWA + Google SSO integration tested.
- Daily incident review with beta cohort feedback.

### 15.3 Days 61-90: Public GA

- Open self-serve sign-up.
- Launch on Product Hunt, Hacker News, X/Twitter.
- Activate affiliate/referral program (10% MRR for 12 months).
- Publish security whitepaper and SOC 2 Type I report.
- Begin E2EE tier development for v2.
- Target: 200 paying subscribers by Day 90.

### 15.4 KPIs and Kill Criteria

| Metric | Day 30 | Day 60 | Day 90 | Kill Threshold |
|---|---|---|---|---|
| Paying subs | 5 | 50 | 200 | < 50 at Day 90 |
| MRR | $60 | $600 | $2,400 | < $600 at Day 90 |
| MAU/paid | 5x | 5x | 4x | < 2x at Day 90 |
| NPS | > 30 | > 40 | > 50 | < 30 at Day 60 |
| Churn (monthly) | < 5% | < 5% | < 4% | > 8% at Day 90 |
| P0 incidents | 0 | 0 | 0 | > 2 at Day 90 |

## 16. Threat Model Deep Dive

### 16.1 Account Takeover

- **Vector**: Stolen password or session cookie.
- **Detection**: Impossible-travel alert; NewDevice email confirmation; rate limit (5 attempts / 15 min / IP).
- **Mitigation**: Mandatory MFA (TOTP or WebAuthn) on every login; step-up MFA for billing and pairing.
- **Residual Risk**: Low with MFA enforcement.

### 16.2 Stolen Pairing Code Reuse

- **Vector**: Attacker intercepts user_code at verification URI.
- **Mitigation**: Single-use code, 15-min TTL, rate-limited per source IP, bind code to (org_id, device_name, user fingerprint), require confirm from existing owner/admin, log and notify on consumption.
- **Residual Risk**: Low with MFA enforcement.

### 16.3 Rogue Device Enrollment (RogueBox)

- **Vector**: Malicious insider enrolls compromised machine under their own org.
- **Mitigation**: Every device enrollment requires explicit owner/admin approval via push notification; device hardware ID attestation (TPM quote, Secure Enclave attestation, or machine fingerprint hash) stored; rotation on policy change.
- **Residual Risk**: Low with hardware attestation.

### 16.4 Cross-Tenant Data Leakage

- **Vector**: Bug in tenant resolution logic.
- **Mitigation**: Postgres RLS with org_id predicate; integration tests assert 403/empty result on cross-tenant probes; per-tenant KMS keys; fuzz testing on auth middleware.
- **Residual Risk**: Low if RLS is enforced and tested.

### 16.5 Connector Supply Chain

- **Vector**: Tampered binary or compromised update channel.
- **Mitigation**: Code signing (Apple notarization, Windows EV cert), reproducible builds, signed update manifests (Sigstore / minisign), checksum verification before install.
- **Residual Risk**: Medium; mitigate with attestations and transparency log.

### 16.6 WebSocket Replay

- **Vector**: Replay old frames.
- **Mitigation**: Monotonic sequence numbers per session; HMAC over seq + payload; server rejects non-monotonic or already-seen seqs.

### 16.7 SSRF on Webhook Receipt

- **Vector**: Webhook targets an internal IP.
- **Mitigation**: Stripe webhook egress is fixed (api.stripe.com); deny egress to RFC 1918 ranges from webhook handlers; use Stripe SDK's official IP allow-list if available.

### 16.8 Remote Kill Abuse

- **Vector**: Legitimate user kills a co-worker's agent accidentally or maliciously.
- **Mitigation**: Require MFA + role check (admin/owner) + 60s cooldown between stops; push notification confirmation; audit log with HMAC chain.
- **Residual Risk**: Low; can add "two-person rule" for enterprise.

### 16.9 Token Theft from Local Machine

- **Vector**: Malware reads keychain entries.
- **Mitigation**: Tokens scoped per instance; rotate on each reconnect; alert on new IP; support WebAuthn-bound device keys for high-value tokens.

## 17. Privacy Mode Recommendation: MVP Strategy

The MVP launches in server-readable transcripts mode with E2EE advertised as a Tier-3 / Enterprise capability:

1. The user keeps local transcripts synced to the dashboard in plaintext; this enables search, continue-thread, and cross-machine share features.
2. The MVP is positioned as a privacy-positive product via: zero-data-retention deletion, on-demand export, regional storage selection, and SOC 2 Type I.
3. A Vault Mode toggle (planned for v2) encrypts thread bodies client-side with a user-held key; the cloud sees only metadata. Search is implemented locally in the connector, and results are re-encrypted before being uploaded (Wire/Tutanota pattern).
4. Full E2EE with MLS or Signal Protocol is reserved for the enterprise tier where customers will pay a premium for it.

This staged approach gets product velocity now and defers the cost of crypto-engineering until there is evidence of demand.

## 18. Local Log Ingestion: Privacy Boundaries

Hermes logs may contain sensitive prompt content (PII, source code, secrets). The connector must apply a redaction pipeline before any outbound sync:

- **Allow-list patterns**: messages with `secret://` URL or `<!-- hermes:private -->` markers are stripped.
- **Deny-list patterns**: emails, IPs, common API key prefixes (`sk-`, `ghp_`, `xox[bp]-`), JWT, PEM blocks.
- **Quota**: maximum 5 MB per thread per sync; oldest entries trimmed first.
- **Opt-in per field**: users can opt out of syncing code blocks but keep transcripts.
- **Hash-only mode**: users can choose to upload SHA-256 hashes only and use full-text search locally.

## 19. Third-Party Vendor Terms (Critical Compliance)

- **Anthropic, OpenAI, Cursor, etc.**: No third party may consume Claude Pro/Max or ChatGPT Plus quotas. Hermes Cloud must not proxy subscription credentials; users bring their own API keys (BYOK) or pay Hermes for metered usage at cost-plus.
- **Apple**: Apps distributed via the App Store that use Sign in with Apple must also offer a privacy-preserving option (App Store Review Guideline 5.1.1(v)). Web-only SaaS is not bound.
- **Stripe**: Prohibited businesses include regulated gambling (US-only), crypto mixing, and unlicensed lending. SaaS for AI agent history is allowed.
- **Cloudflare**: Workers + DO acceptable use prohibits spam relays; rate limits must be configured.

## 20. Conclusion

Hermes-as-SaaS is technically feasible in mid-2026 with off-the-shelf building blocks (Clerk, Stripe, Cloudflare DO). The recommended path is to ship a server-readable MVP gated behind explicit consent, price at $12/mo Pro, integrate Apple SIWA and Google SSO via Clerk, run on Cloudflare DO + Workers with RLS-protected Postgres, and evolve to E2EE only when enterprise demand justifies it. Vendor lock-in is mitigated by mirroring identity state locally and abstracting the relay protocol.

## 21. Synthesis: Comparative Analysis

This section contrasts the four major architectural choices across five dimensions: time-to-MVP, lock-in depth, security posture, and operational burden.

| Dimension | Clerk + Stripe + Cloudflare DO | WorkOS AuthKit + Stripe + Fly.io | Auth0 + Stripe + Cloudflare DO | Better Auth + Stripe + Fly.io |
|---|---|---|---|---|
| Time-to-MVP | 4-6 weeks | 6-8 weeks | 6-10 weeks | 8-12 weeks |
| Lock-in depth | Medium (Clerk SDK, Cloudflare DO) | Low (WorkOS standard OIDC, Fly portable) | High (Auth0 proprietary rules) | Low (open-source, portable) |
| Security posture | Strong (managed MFA, JWT) | Strong (SSO + audit logs) | Strong (full enterprise features) | Weak-Moderate (DIY) |
| Operational burden | Low | Medium | Medium | High |
| Pricing at scale | $0.05/MAU beyond 10K + Cloudflare usage | $0.05/MAU beyond 1M + $1.94/mo/machine | $0.07/MAU + DO usage | Free + Postgres costs |
| Best for | Speed-to-market, consumer prosumer SaaS | B2B with SSO needs, regulated industries | Enterprise + custom compliance | Cost-sensitive, full-control teams |

The recommended path (Clerk + Stripe + Cloudflare DO) optimizes for the highest velocity-to-revenue while keeping an escape hatch: the connector uses portable WebSocket-over-TLS, identity state mirrors to Postgres, and the Stripe webhooks are mapped through an internal event bus so a switch to WorkOS or Better Auth is local.

The principal tension is between velocity and lock-in: Clerk and Cloudflare DO both create vendor gravity, but the underlying primitives (OIDC, WebSocket, Postgres) are open. A future migration would require ~3 engineer-weeks for identity and ~6 weeks for the relay.

## References

1. *Clerk vs Auth0 (2026) - Honest Comparison*. https://www.appaca.ai/compare/clerk-vs-auth0
2. *Clerk Pricing 2026: Plans, Costs & Cost Calculator - CheckThat.ai*. https://checkthat.ai/brands/clerk/pricing
3. *Auth0 vs. WorkOS Comparison 2026*. https://www.g2.com/compare/auth0-vs-workos
4. *Clerk Pricing Update - 50k Free MAU*. https://saasprices.net/blog/clerk-free-plan-changes
5. *Auth0 vs Clerk Pricing & Capability Comparison (2026) comparetier.com https://www.comparetier.com › vs › auth0-vs-clerk*. https://www.comparetier.com/vs/auth0-vs-clerk
6. *Clerk pricing: How it works and compares to WorkOS*. https://workos.com/blog/clerk-pricing
7. *WorkOS vs Auth0 vs Clerk Enterprise SSO 2026 - APIScout*. https://apiscout.dev/guides/workos-vs-auth0-vs-clerk-enterprise-sso-2026
8. *WorkOS vs. Auth0 vs. Clerk: Which should you choose?*. https://workos.com/blog/workos-vs-auth0-vs-clerk
9. *WorkOS vs. Auth0 vs. Clerk: The best auth platform for B2B ...*. https://workos.com/blog/workos-vs-auth0-vs-clerk-the-best-auth-platform-for-b2b-saas-in-2026
10. *Pricing*. http://workos.com/pricing
11. *Stripe Subscription Billing Best Practices for SaaS in 2026*. https://retryhero.com/blog/stripe-subscription-billing-best-practices
12. *Stripe Subscription Billing for SaaS: Full Production Setup ...*. https://www.duskolicanin.com/blog/stripe-subscription-billing-saas-setup-2026
13. *Stripe Billing implementation guide (2026 edition, official-compliant)*. https://tomodahinata.com/en/blog/stripe-billing-subscriptions-usage-based-customer-portal-guide
14. *stripe-developer-docs/docs/billing/entitlements.md at main ...*. https://github.com/QiMana/stripe-developer-docs/blob/main/docs/billing/entitlements.md
15. *Entitlements | Stripe Documentation*. https://docs.stripe.com/billing/entitlements?dashboard-or-api=api
16. *Auth0 Pricing Guide (2026): Choosing the Best Plans for ...*. http://saasworthy.com/blog/auth0-pricing-plans-guide
17. *Auth0 Pricing and Integration Costs - A Complete Guide*. http://metacto.com/blogs/auth0-pricing-and-integration-costs-a-complete-guide
18. *Auth0 Pricing: Free Tier to Enterprise Plans (2026)*. https://www.modern-datatools.com/tools/auth0/pricing
19. *Auth0 Pricing Explained (And Why Startups Call It a Growth ...*. https://ssojet.com/blog/auth0-pricing-growth-penalty
20. *Auth0 Pricing 2026: 6 Plans from Free–$240/month*. https://costbench.com/software/identity-access-management/auth0
21. *Sign in with Apple | Apple Developer Documentation*. https://developers.apple.com/documentation/signinwithapple
22. *Sign in to your developer account - Access - Account - Help ...*. https://developer.apple.com/help/account/access/sign-in-to-your-developer-account
23. *Apple Developer*. https://developer.apple.com/
24. *Apple Developer*. https://developer-mdn.apple.com/
25. *Apple Developer Program - Apple Developer*. https://developer.apple.com/programs
26. *Supabase Auth Pricing 2026: Plans, Costs & Free Options ...*. https://aisotools.com/pricing/supabase-auth
27. *Supabase Pricing Calculator (2026)*. https://makerkit.dev/pricing-calculator/supabase
28. *Better Auth vs NextAuth vs Clerk (2026) - apiscout.dev*. https://apiscout.dev/guides/better-auth-vs-nextauth-vs-clerk-2026
29. *Auth | Supabase Docs*. https://supabase.com/docs/guides/auth
30. *Supabase Auth Auth & Identity Pricing | API Price Tracker*. https://pricingapis.com/auth/supabase-auth
31. *Stripe vs Lemon Squeezy vs Paddle 2026: Complete Payment ...*. https://appstackbuilder.com/blog/stripe-vs-lemon-squeezy-vs-paddle
32. *Stripe vs Paddle vs Lemon Squeezy: Best Payment Platform ...*. https://f3fundit.com/stripe-vs-paddle-vs-lemon-squeezy-micro-saas-2026
33. *Stripe vs Lemon Squeezy vs Paddle for Your SaaS Payments*. https://blog.vibecoder.me/stripe-vs-lemon-squeezy-vs-paddle
34. *Stripe vs Paddle vs Lemon Squeezy vs Gumroad: Fees Compared ...*. https://www.globalsolo.global/blog/stripe-vs-paddle-vs-lemon-squeezy-2026
35. *Subscriptions | Stripe Documentation*. http://docs.stripe.com/subscriptions
36. *OIDC ID Token Validator — signature, iss, aud, exp, nonce, at ...*. https://httpstatus.com/oidc/id-token-validator
37. *Using OAuth 2.0 for Web Server Applications | Authorization ...*. https://developers.google.com/identity/protocols/oauth2/web-server
38. *Integrating Google Sign-In into your web app  |  Web guides  |  Google for Developers*. http://developers.google.com/identity/sign-in/web/sign-in
39. *Add OIDC for customer sign-in - Microsoft Entra External ID | Microsoft Learn*. http://learn.microsoft.com/en-us/entra/external-id/customers/how-to-custom-oidc-federation-customers
40. *Validating Google sign in ID token in Go - Stack Overflow*. https://stackoverflow.com/questions/36716117/validating-google-sign-in-id-token-in-go
41. *Use WebSockets · Cloudflare Durable Objects docs*. https://developers.cloudflare.com/durable-objects/best-practices/websockets
42. *Build a WebSocket server with WebSocket Hibernation*. https://developers.cloudflare.com/durable-objects/examples/websocket-hibernation-server
43. *title: Durable Object State description: API reference for DurableObjectState, which controls concurrency, WebSocket attachment, and storage access. image: https://developers.cloudflare.com/dev-products-preview.png*. http://developers.cloudflare.com/durable-objects/api/state
44. *Cloudflare Durable Objects - Stateful Serverless Functions*. https://www.cloudflare.com/products/durable-objects
45. *WebSockets · Cloudflare Workers docs*. https://developers.cloudflare.com/workers/runtime-apis/websockets
46. *Tailscale pricing*. https://tailscale.com/pricing
47. *Tailscale Pricing 2026: Personal & Starter Plans from $6/mo*. https://comparedge.com/tools/tailscale/pricing
48. *Tailscale pricing update: clearer plans, more value*. https://tailscale.com/blog/pricing-v4
49. *Tailscale Pricing 2026*. https://www.g2.com/products/tailscale/pricing
50. *Tailscale Pricing 2026: Total Cost & Competitors*. https://checkthat.ai/brands/tailscale/pricing
51. *Ably Pricing 2026 - TrustRadius*. https://www.trustradius.com/products/ably/pricing
52. *Ably Pricing Calculator (2026)*. https://www.buildmvpfast.com/tools/api-pricing-estimator/ably
53. *Ably Pricing Context*. https://devtune.ai/verticals/messaging-event-streaming/ably/pricing
54. *Ably Realtime Pricing 2026*. https://www.g2.com/products/ably-realtime/pricing
55. *Ably Realtime Software Pricing, Alternatives & More 2026*. https://www.capterra.com/p/175474/Ably-Realtime
56. *Fly.io Resource Pricing*. https://fly.io/docs/about/pricing
57. *Fly.io Machines API Review, Pricing & Docs | FindAPI*. https://www.findapi.dev/api/fly-io-machines-api
58. *Fly Machines*. https://fly.io/machines
59. *Fly.io pricing: Plans and cost breakdown for 2025 - Orb*. https://www.withorb.com/blog/flyio-pricing
60. *Fly Io Plans Pricing - APIs.io*. https://apis.io/plans/fly-io/fly-io-plans-pricing
61. *Cloudflare Tunnel Pricing 2026: Plans, Hidden Costs & Cheaper ...*. https://toolradar.com/tools/cloudflare-tunnel/pricing
62. *Cloudflare Tunnel Review 2026: Pricing, Alternatives & Lock ...*. https://tool.news/tools/cloudflare-tunnel
63. *What is the pricing structure for Cloudflare Tunnel? - Ask ...*. https://askai.glarity.app/search/What-is-the-pricing-structure-for-Cloudflare-Tunnel
64. *Cloudflare Tunnel Review (2026) - MakerStack*. https://makerstack.co/reviews/cloudflare-tunnel-review
65. *Pricing*. https://www.cloudflare.com/plans
66. *Trying to use Websocket Hibernation Api*. https://stackoverflow.com/questions/79336461/trying-to-use-websocket-hibernation-api
67. *Durable Object State*. https://developers.cloudflare.com/durable-objects/api/state
68. *Debugging WebSocket Hibernation with Cloudflare Durable ...*. https://thomasgauvin.com/writing/how-cloudflare-durable-objects-websocket-hibernation-works
69. *Creating a Websocket server in Hono with Durable Objects*. https://vuink.com/post/svorecynar-d-dpbz/blog/creating-websocket-server-hono-durable-objects
70. *CLI Interface | Hermes Agent*. https://hermes-agent.nousresearch.com/docs/user-guide/cli
71. *hermes-agent/website/docs/user-guide/cli.md at main ... - GitHub*. https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/cli.md
72. *CLI | NousResearch/hermes-agent | DeepWiki*. https://deepwiki.com/NousResearch/hermes-agent/3-cli
73. *Releases · NousResearch/hermes-agent - GitHub*. https://github.com/NousResearch/hermes-agent/releases
74. *Hermes Agent vs Codex CLI: Which Coding Agent to Use (2026)*. https://haimaker.ai/blog/hermes-vs-codex
75. *Gateway Internals | Hermes Agent*. https://hermes-agent.nousresearch.com/docs/developer-guide/gateway-internals
76. *Hermes Agent | Nous Research*. http://hermes-agent.nousresearch.com/
77. *GitHub - NousResearch/hermes-agent: The agent that grows with ...*. https://github.com/nousresearch/hermes-agent
78. *GitHub - haonange1314/hermes-agent-20260429: The agent that grows with you · GitHub*. http://github.com/haonange1314/hermes-agent-20260429
79. *RFC8628: OAuth 2.0 Device Authorization Grant*. https://docs.authlib.org/en/stable/oauth2/specs/rfc8628.html
80. *RFC 8628: OAuth 2.0 Device Authorization Grant | RFC Editor*. https://www.rfc-editor.org/info/rfc8628
81. *RFC 8628: OAuth 2.0 Device Authorization Grant - Ian Duncan ...*. https://www.iankduncan.com/projects/rfc-browser/8628
82. *Device Authorization Grant (RFC 8628) | LumoAuth Documentation*. https://docs.lumoauth.dev/oauth/device
83. *OAuth2 Device Grant: IoT & CLI Auth (RFC 8628)*. https://ashishsrivastav.com/blog/oauth2-device-authorization-grant-iot-cli
84. *Fetch Apple’s public key to verify token signatures*. https://developer.apple.com/documentation/signinwithapplerestapi/fetch-apple%27s-public-key-for-verifying-token-signature
85. *http://support.apple.com/en-us/105078*. http://support.apple.com/en-us/105078
86. *Private Key JWT Client Authentication for OIDC WSO2 https://is.docs.wso2.com › learn › private-key-jwt-client-...*. https://is.docs.wso2.com/en/5.10.0/learn/private-key-jwt-client-authentication-for-oidc
87. *Verify a domain in Apple Business*. https://support.apple.com/en-az/guide/business/axm48c3280c0/web
88. *Private Key JWT vs Client Secret: Choosing the right OAuth ... WorkOS https://workos.com › blog › private-key-jwt-vs-client-se...*. https://workos.com/blog/private-key-jwt-vs-client-secret
89. *Stripe Webhook Best Practices: Reliability, Security, and ...*. https://stackbe.io/blog/stripe-webhook-best-practices
90. *10 Stripe Webhook Best Practices for Production | Hookbase*. https://www.hookbase.app/blog/stripe-webhook-best-practices
91. *Best practices I wish we knew when integrating Stripe webhooks*. https://www.stigg.io/blog-posts/best-practices-i-wish-we-knew-when-integrating-stripe-webhooks
92. *Designing robust and predictable APIs with idempotency - Stripe*. https://stripe.com/blog/idempotency
93. *Webhook Best Practices: Retry Logic, Idempotency, and Error ...*. https://hookcap.dev/blog/webhook-best-practices-retry-idempotency-error-handling
94. *Stripe Customer Portal*. https://docs.memberstack.com/hc/en-us/articles/7782712032539-Stripe-Customer-Portal
95. *Provide a customer portal to your customers - Stripe*. https://docs.stripe.com/customer-management
96. *Stripe Customer Portal – Softr Help Docs*. https://docs.softr.io/integrations/stripe-customer-portal
97. *Stripe Customer Portal Limitations: What B2B Businesses Are ...*. https://payrequest.io/blog/stripe-customer-portal-limitations-b2b-2026
98. *Configure the customer portal Stripe Documentation https://docs.stripe.com › configu...*. https://docs.stripe.com/customer-management/configure-portal
99. *Stripe Subscription Lifecycle in Next.js — The Complete ...*. https://dev.to/thekarlesi/stripe-subscription-lifecycle-in-nextjs-the-complete-developer-guide-2026-4l9d
100. *Stripe Integration Patterns: Subscriptions, Webhooks, and the ...*. https://wolf-tech.io/blog/stripe-integration-patterns-subscriptions-webhooks-hardening
101. *Stripe Subscriptions Lifecycle And Entitlements | agent-skills*. https://andrewsrigom.github.io/agent-skills/packs/stripe/stripe-subscriptions-lifecycle-and-entitlements
102. *Stripe Guide: manage Stripe billing lifecycle and reporting*. https://www.flycode.com/blog/stripe-guide-manage-stripe-billing-lifecycle-and-reporting
103. *Subscription invoices - Stripe Documentation*. http://docs.stripe.com/billing/invoices/subscription
104. *Pricing · Cloudflare Workers docs*. https://developers.cloudflare.com/workers/platform/pricing
105. *Workers & Pages Pricing*. https://www.cloudflare.com/plans/developer-platform
106. *Pricing · Cloudflare Durable Objects docs*. https://developers.cloudflare.com/durable-objects/platform/pricing
107. *Cloudflare workers: $0.15 per 1M requests per month ...*. https://news.ycombinator.com/item?id=31492770
108. *Pricing · Cloudflare Pages docs*. https://developers.cloudflare.com/pages/functions/pricing
109. *Tailscale Funnel · Tailscale Docs*. https://tailscale.com/docs/features/tailscale-funnel
110. *Funnel works only within tailnet · Issue #11849 · tailscale ...*. https://github.com/tailscale/tailscale/issues/11849?timeline_page=1
111. *FR: Enable ACL support for funnel. · Issue #13109*. https://github.com/tailscale/tailscale/issues/13109
112. *Tailscale Funnel examples*. https://tailscale.com/docs/reference/examples/funnel
113. *tailscale funnel command*. https://tailscale.com/docs/reference/tailscale-cli/funnel
114. *Websocket Duration Limits - Cloudflare Workers - Cloudflare ...*. https://community.cloudflare.com/t/websocket-duration-limits/813611
115. *Cloudflare WebSockets: CDN, Workers & Durable Objects*. https://websocket.org/guides/infrastructure/cloudflare
116. *cloudflare-docs/src/content/docs/durable-objects/best ...*. https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/durable-objects/best-practices/websockets.mdx
117. *GitHub - guerrerocarlos/cloudflare-websockets: websocket ...*. https://github.com/guerrerocarlos/cloudflare-websockets
118. *Server-Side Request Forgery Prevention Cheat Sheet*. https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
119. *OWASP Top 10 Deep Dive: Defending Against Server-Side ...*. https://www.rapid7.com/blog/post/2021/11/23/owasp-top-10-deep-dive-defending-against-server-side-request-forgery
120. *Injection_Prevention_Cheat_Sheet.md - GitHub*. https://github.com/OWASP/CheatSheetSeries/blob/master/cheatsheets/Injection_Prevention_Cheat_Sheet.md
121. *Hands-On Understanding of OWASP Top 10: Server-Side ...*. https://medium.com/%40yoshiyuki.watanabe/hands-on-understanding-of-owasp-top-10-server-side-request-forgery-ssrf-ebd091c48fa1
122. *Injection Attack Prevention | OWASP/CheatSheetSeries | DeepWiki*. https://deepwiki.com/OWASP/CheatSheetSeries/4-injection-attack-prevention
123. *Apple Adds PQ3 post-quantum Encryption for iMessage*. https://cybersecuritynews.com/apple-pq3-post-quantum-imessage
124. *Apple opens its post-Quantum encryption vault Computerworld https://www.computerworld.com › ...*. https://www.computerworld.com/article/4177108/apple-opens-its-post-quantum-encryption-vault.html
125. *Apple Unveils Post-Quantum Secure Messaging With iMessage*. https://thequantuminsider.com/2024/02/21/apple-unveils-post-quantum-secure-messaging-with-imessage
126. *Apple's New iMessage, Signal, and Post-Quantum Cryptography*. https://cloudsecurityalliance.org/blog/2024/05/17/apple-s-new-imessage-signal-and-post-quantum-cryptography
127. *Microsoft and Apple Advance Post-Quantum Cryptography Support ...*. https://www.encryptionconsulting.com/microsoft-and-apple-advance-post-quantum-cryptography-support-in-upcoming-os-releases
128. *Page not found · GitHub Pages*. https://hermes-agent.nousresearch.com/docs/getting-started
129. *hermes-agent/README.md at main · NousResearch/hermes-agent · GitHub*. https://github.com/NousResearch/hermes-agent/blob/main/README.md
130. *Page not found · GitHub Pages*. https://hermes-agent.nousresearch.com/docs/architecture
131. *Page not found · GitHub Pages*. https://hermes-agent.nousresearch.com/docs/security
132. *Entitlements | Stripe Documentation*. https://docs.stripe.com/billing/entitlements
133. *An introduction to Fly Machines · Fly Docs*. https://fly.io/docs/machines/overview
134. *Sign in with Apple | Apple Developer Documentation*. https://developer.apple.com/documentation/signinwithapple
135. *Fetched web page*. https://ably.com/pricing
136. [
            
                RFC 8628 - OAuth 2.0 Device Authorization Grant
            
        ](https://datatracker.ietf.org/doc/html/rfc8628)
137. *Fetched web page*. https://www.rfc-editor.org/rfc/rfc8628.html
138. *What is Messaging Layer Security (MLS)? | Messaging Layer Security (MLS)*. https://messaginglayersecurity.rocks/
139. *RFC 9420: The Messaging Layer Security (MLS) Protocol*. https://www.rfc-editor.org/rfc/rfc9420.html
140. *Fetched web page*. https://docs.stripe.com/billing/subscriptions/webhooks
141. *Fetched web page*. https://docs.stripe.com/webhooks
142. *Fetched web page*. https://docs.stripe.com/webhooks/signature
143. *Fetched web page*. https://docs.stripe.com/billing/subscriptions/cancel
144. *Fetched web page*. https://docs.stripe.com/billing/subscriptions/payment
145. *Fetched web page*. https://docs.stripe.com/tax
146. *Page not found · GitHub Pages*. https://hermes-agent.nousresearch.com/docs/user-guide/installation
147. *Installation | Hermes Agent*. https://hermes-agent.nousresearch.com/docs/getting-started/installation
148. *Page not found · GitHub Pages*. https://hermes-agent.nousresearch.com/docs/user-guide/portal
149. *OpenID Connect  |  Sign in with Google  |  Google for Developers*. https://developers.google.com/identity/openid-connect/openid-connect
150. *Use the token model  |  Web guides  |  Google for Developers*. https://developers.google.com/identity/oauth2/web/guides/use-token-model
151. [
            
                RFC 7636 - Proof Key for Code Exchange by OAuth Public Clients
            
        ](https://datatracker.ietf.org/doc/html/rfc7636)
152. *RFC 7636: Proof Key for Code Exchange by OAuth Public Clients | RFC Editor*. https://www.rfc-editor.org/rfc/rfc7636
153. *Fetched web page*. https://docs.stripe.com/payments/checkout
154. *Pricing & Fees*. https://stripe.com/pricing
155. *Page not found · GitHub Pages*. https://hermes-agent.nousresearch.com/docs/developer-guide/security
156. *Page not found · GitHub Pages*. https://hermes-agent.nousresearch.com/docs/concepts/architecture
157. *Page not found · GitHub Pages*. https://hermes-agent.nousresearch.com/docs/concepts/local-first
158. *Introduction | Better Auth*. https://www.better-auth.com/docs/introduction
159. *Better Auth*. https://www.better-auth.com/
160. *Supabase Pricing*. https://supabase.com/pricing
161. *Tailscale Funnel*. https://tailscale.com/kb/1223/funnel
162. *WorkOS Pricing*. https://workos.com/pricing
163. *Plans and Pricing | Okta*. https://okta.com/pricing
164. *Auth0 Pricing*. https://auth0.com/pricing
165. *Page not found · GitHub Pages*. https://hermes-agent.nousresearch.com/docs/concepts/overview
166. *Sign in | Clerk.com*. https://dashboard.clerk.com/pricing
167. *Pricing — Free Up to 50K Users | Plans from $0/mo*. https://clerk.com/pricing
168. *Limits · Cloudflare Workers docs*. https://developers.cloudflare.com/workers/platform/limits
169. *Architecture | Hermes Agent*. https://hermes-agent.nousresearch.com/docs/developer-guide/architecture
170. *Organization | Better Auth*. https://www.better-auth.com/docs/plugins/organization
171. *Single Sign-On (SSO) | Better Auth*. https://www.better-auth.com/docs/plugins/sso
172. *Fetched web page*. https://docs.stripe.com/billing/subscriptions/overview
173. *Fetched web page*. https://docs.stripe.com/billing
174. *Creating a client secret | Apple Developer Documentation*. https://developer.apple.com/documentation/accountorganizationaldatasharing/creating-a-client-secret
175. *Page not found · GitHub Pages*. https://hermes-agent.nousresearch.com/docs/getting-started/portal
176. *Page not found · GitHub Pages*. https://hermes-agent.nousresearch.com/docs/concepts/sessions
177. *Sessions | Hermes Agent*. https://hermes-agent.nousresearch.com/docs/user-guide/sessions
178. *Page not found · GitHub Pages*. https://hermes-agent.nousresearch.com/docs/concepts/providers
179. *Page not found · GitHub Pages*. https://hermes-agent.nousresearch.com/docs/user-guide/providers
180. *Cloudflare Tunnel Reviews, Pricing & Alternatives (2026)*. https://toolradar.com/tools/cloudflare-tunnel
181. *Cloudflare Tunnel in 2026: Expose localhost Without Opening ...*. https://recca0120.github.io/en/2026/04/14/cloudflare-tunnel-2026
182. *Hermes Agent | Nous Research*. https://hermes-agent.nousresearch.com/
183. *Nous Portal*. https://portal.nousresearch.com/manage-subscription
184. *Nous Portal*. https://portal.nousresearch.com/info
185. *Nous Tool Gateway - Hermes Agent*. https://hermes-agent.nousresearch.com/docs/user-guide/features/tool-gateway
186. *Hermes Agent: The Full Setup Guide - by Umang Chauhan*. https://thisumang.substack.com/p/hermes-agent-the-full-setup-guide
187. *How to Validate an OpenID Connect ID Token*. https://curity.io/resources/learn/validating-an-id-token
188. *Google OpenID Connect API Reference | Authentication*. http://developers.google.com/identity/openid-connect/reference
189. *OpenID Connect Discovery 1.0 incorporating errata set 2*. https://openid.net/specs/openid-connect-discovery-1_0.html
190. *Add OpenID Connect as an external identity provider*. https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-custom-oidc-federation-customers
191. *Fetched web page*. http://docs.stripe.com/api/events
192. *Receive Stripe events in your webhook endpoint | Stripe Documentation*. http://docs.stripe.com/webhooks
193. *Create a webhook endpoint | Stripe API Reference*. https://docs.stripe.com/api/webhook_endpoints/create?lang=create_subscription
194. *messaging-gateway-architecture.md*. https://github.com/cclank/Hermes-Wiki/blob/master/concepts/messaging-gateway-architecture.md
195. *hermes-agent-source-wiki/concepts/messaging-gateway ... - GitHub*. https://github.com/FrankFilippi/hermes-agent-source-wiki/blob/main/concepts/messaging-gateway-architecture.md
196. *Building a Multi-Platform Agentic Gateway: A Deep Dive into ...*. https://akjamie.github.io/post/2026-05-19-gateway-deep-dive
197. *Messaging Gateway and Platforms | NousResearch/hermes-agent ...*. https://zread.ai/NousResearch/hermes-agent/17-messaging-gateway-and-platforms
198. *Hide My Email is not forwarding any emails. : r/applehelp*. https://www.reddit.com/r/applehelp/comments/qrr58d/hide_my_email_is_not_forwarding_any_emails
199. *Apple Private Email Relay · Airship Docs*. https://www.airship.com/docs/developer/api-integrations/email/apple-private-email-relay
200. *Hide My Email not forwarding emails*. https://discussions.apple.com/thread/255031683
201. *Hide My Email does not forward emails to …*. https://discussions.apple.com/thread/254553187
202. *Emails from Apple's “Sign in with Apple” / “Hide My Email” ...*. https://support.google.com/mail/thread/406398686/emails-from-apple%E2%80%99s-%E2%80%9Csign-in-with-apple%E2%80%9D-%E2%80%9Chide-my-email%E2%80%9D-aren%E2%80%99t-being-received-in-my-gmail-inbox?hl=en
203. *How to Install Hermes Agent (2026 Setup Guide)*. https://hermesatlas.com/guide/install
204. *How to set up Hermes Agent (step-by-step guide) - Hostinger*. https://www.hostinger.com/tutorials/how-to-set-up-hermes-agent
205. *CLI Commands Reference | Hermes Agent - nous research*. https://hermes-agent.nousresearch.com/docs/reference/cli-commands
