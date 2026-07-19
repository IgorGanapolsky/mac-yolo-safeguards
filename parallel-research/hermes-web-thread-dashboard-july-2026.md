# Hermes Mobile: Secure Web Dashboard for Every Thread

A July-2026 architecture, data-model, delivery, migration, and acceptance-test plan for adding a desktop-browser surface to Hermes Mobile that continues every chat/thread with the same guarantees as the native iOS/Mac client.

---

## Executive Summary

- **Shared cloud control plane beats direct browser-to-Mac tunneling for production.** A managed WebSocket broker at the edge (Cloudflare Durable Objects) gives deterministic identity, observability, and revocation; direct LAN/WAN tunneling leaks the user's IP, breaks when the Mac sleeps, and forces per-deployment pairing UX.
- **WebSocket is the right transport; SSE is not enough for chat.** WebSockets support bidirectional framing, binary payloads, and per-message idempotency; SSE is server-to-client only and forces a parallel POST channel for sends.
- **End-to-end encryption must be MLS (RFC 9420), not ad-hoc Signal-style double ratchets per thread.** MLS gives O(log n) join/remove, audited open implementations (openmls), and clean multi-device semantics for a Mac+dashboard+iPhone world.
- **Local-first is mandatory for offline and resume.** An event-sourced log per thread (append-only, Lamport-ordered, content-addressed) is the only model that survives long offline, multi-device fan-in, and replay without conflict UI.
- **Passkeys replace passwords AND replace session-resume tokens.** WebAuthn PRF output seeds both a device-pairing secret and a session-resume secret, killing phishing, shared-device replay, and password reuse in one move.
- **A PWA is the correct v1 surface; a dedicated Next.js client is the v2 escape hatch.** PWAs pass App Store 4.2 when the native Hermes Mobile app already exists as the primary mobile surface; React Native Web reuse is the wrong hammer because chat UX is fundamentally different on web vs. mobile.
- **Operating cost is ~$25-$150/mo at 10k MAU.** Cloudflare Workers Paid ($5/mo min) plus DOs and R2 cover compute, WebSocket fanout, and attachments well under any reasonable budget.
- **Hermes gateway is the bridge, not the replacement.** Hermes Agent already speaks a streaming gateway protocol over REST/WebSocket; the web dashboard should treat it as a thin client to the same gateway rather than rebuilding orchestration.
- **Migration is fully reversible at every step.** A shadow read path, then dual-write, then cutover, then deprecation lets you roll back to the legacy Hermes Mobile/Mac gateway without data loss or app updates.
- **Acceptance tests must be falsifiable.** Every claim (handoff, offline, E2E, failover, attachment confidentiality) needs a written test that fails if the behavior regresses, so the bar for "done" is objective, not aesthetic.
- **The smallest high-ROI architecture is Cloudflare-native, MLS-secured, event-sourced, and PWA-shipped.** Anything larger (custom broker, native wrappers, dedicated React Native Web investment) is unjustified for v1 and should be deferred until usage data proves demand.

---

## 1. Hermes Mobile Today (Inferred Baseline)

Hermes Agent's gateway is a long-running process that multiplexes 20+ messaging platforms into a unified routing context. Sessions are addressable as `agent:<agent>:<platform>:<scope>:<id>` (e.g. `agent:main:telegram:private:123456789`). The gateway exposes REST for tool calls and a Web UI mode for management.

For Hermes Mobile (iOS) we infer:

- A thin native client over local network WebSocket or HTTPS to the Mac-resident gateway.
- A session store on the Mac.
- The Mac is the durable home; iOS is a viewer.

The web dashboard must extend, not replace, this architecture. See [110] and [45].

---

## 2. Shared Cloud Control Plane vs. Browser-to-Mac Direct Gateway

| Dimension | Shared Cloud Control Plane | Browser-to-Mac Direct Gateway |
|---|---|---|
| Latency (cold) | 30-80 ms (regional edge) | 5-30 ms on LAN, 100-400 ms over WAN |
| NAT traversal | None (edge terminates) | UPnP hole-punch, Tailscale Funnel, or manual port-forward |
| Identity | Single OIDC/passkey issuer | Per-device pairing ceremony; no central revocation |
| Discovery | DNS, deterministic | mDNS on LAN, Tailscale MagicDNS for WAN |
| Multi-Mac failover | Active-active via DO sharding | Manual or via Tailscale HA; see [184] |
| Cost at 10k MAU | ~$25-$150/mo Cloudflare | Free infra + user's bandwidth + electricity |
| Compliance posture | Single data-residency decision | Per-user jurisdiction; messy for GDPR |
| Mobile battery | Low (single TLS conn) | High (long-lived tunnel) |
| Revocation | One API call to revoke a device | Must propagate to every Mac; gossip needed |

**Recommendation.** Ship the shared cloud control plane as the default. Offer direct browser-to-Mac as a power-user escape hatch behind a Tailscale/SSH tunnel, not a user-facing feature.

For the cloud control plane, use Cloudflare Durable Objects with the WebSocket Hibernation API so idle connections don't burn billable time (see Cloudflare Durable Objects WebSocket guide).

---

## 3. Transport: WebSocket vs. SSE

| Property | WebSocket | Server-Sent Events |
|---|---|---|
| Direction | Bidirectional, single TCP | Server -> client only |
| Framing | Binary + text, low overhead | UTF-8 text, `data:` frames |
| Reconnect | App-managed with last-seq | Native via `Last-Event-ID` |
| Auth | Cookie + Sec-WebSocket-Protocol | Cookie + headers |
| Proxy friendliness | Good over 443 | Good over 443 |
| Multiplexing | Needs subprotocol (JSON-RPC) | One stream per route |
| Client -> server sends | Same socket | Requires parallel POST |

**Verdict.** WebSocket for thread messaging (bidirectional, low overhead). SSE only as a one-way notification channel (e.g., "thread X updated") for push fallback when a WebSocket cannot be established (corporate proxies). See Cloudflare WebSockets API.

JSON-RPC 2.0 over WebSocket with a `Last-Event-ID`-style cursor is the proven shape. Heartbeat: 30 s PING; client exponential backoff with full jitter, capped at 30 s.

---

## 4. Data Model: Local-First, Event-Sourced Threads

```
threads
  thread_id (ULID)
  agent_id
  visibility ('private' | 'shared')
  schema_version
  created_at, last_event_seq
  participants[user_id]

events   -- append-only, signed
  event_id (ULID)
  thread_id
  seq            -- per-thread monotonic
  lamport_ts
  author_id      -- user_id | 'agent'
  kind           -- 'user.msg' | 'agent.msg' | 'tool.call' | 'tool.result' | 'system.compaction'
  ciphertext     -- MLS ciphertext (or sealed-box fallback)
  metadata       -- length, mime, redacted_bytes
  prev_event_hash
  signature      -- ed25519

snapshots   -- projection cache
  thread_id, up_to_seq, body_json, sha256

attachments
  attachment_id, thread_id, event_id
  storage_url    -- R2 pre-signed
  sha256, size, mime
  ciphertext_size
```

Properties:

- Append-only log; compaction is just a new snapshot event that supersedes older payloads.
- Lamport clocks order concurrent edits; `prev_event_hash` makes the chain tamper-evident.
- Snapshots accelerate cold-start hydration; the log remains authoritative.
- Attachments are referenced, never inlined in events.

This pattern aligns with the Ink & Switch local-first principles: local replicas, sync engine, end-to-end ownership (see Local-first software: You own your data, in spite of the cloud).

---

## 5. Sync Protocol

1. Client opens WebSocket; sends `hello` with `last_known_seq` and content hashes.
2. Server returns events with `seq > last_known_seq`, batched per thread.
3. Client ACKs each batch.
4. Server marks ACKed in per-device inbox (metadata only, no plaintext).
5. Resumability: server retains 7 days of events; older events trigger a snapshot fetch.
6. Idempotency: every client mutation carries `Idempotency-Key: UUIDv7`; server caches the response for 24 h.
7. Heartbeat: 30 s PING; client exponential backoff with full jitter to max 30 s.
8. Outbound writes: optimistic local apply; server is source of truth on conflict.

This is the standard resilient-sync pattern used by Matrix, Slack, and Linear; we are not inventing new protocol semantics.

---

## 6. Cryptography & Identity

### Identity
- WebAuthn passkeys (discoverable credentials, UVPA preferred) are the primary credential.
- PRF extension outputs seed two distinct keys: `device_pairing_secret` and `session_resume_secret`.
- Apple/Google/1Password sync make the passkey portable across user devices without server-side password storage.

### End-to-end encryption
- Adopt MLS (RFC 9420) via openmls (Rust) compiled to WebAssembly; same key package used by the iOS Swift client and the Mac gateway.
- Cipher suites: MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519 with X25519; future-proof with hybrid post-quantum KEM when the openmls WG ships it.
- The Mac gateway is a non-human "client" in the MLS group, so the Mac, iOS, and Web dashboard form a 3-party group per thread. Adding a second Mac = `Add` op; revoking a stolen device = `Remove` op that triggers epoch advance.
- See RFC 9420 - MLS and openmls.

### Session revocation
- Maintain a `revoked_devices` table keyed by device public key; gateway rejects any connection whose auth token references a revoked device.
- Revocation propagates in <30 s via the existing WebSocket heartbeat; clients force a token refresh on next reconnect.

### TLS
- TLS 1.3 with ML-KEM-768 + X25519 hybrid key exchange; Cloudflare's post-quantum TLS rollout provides this automatically.

### Threat Model (STRIDE)

| STRIDE | Threat | Mitigation |
|---|---|---|
| Spoofing | Fake device | WebAuthn attestation + per-device public key pinning |
| Tampering | Event log mutation | Hash chain + ed25519 signatures; client rejects on seq gap |
| Repudiation | "I didn't send that" | Signed envelopes; server stores signatures, not content |
| Information Disclosure | Server breach | MLS end-to-end; server only sees ciphertext + metadata |
| Denial of Service | WS flood | Token bucket per device/IP; Cloudflare WAF + Bot Management |
| Elevation of Privilege | Stolen session cookie | Short-lived JWT (15 min) + refresh via passkey challenge |

---

## 7. Attachments

- Storage: Cloudflare R2 (S3-compatible, zero egress fees).
- Upload flow: client requests a pre-signed PUT (5 min TTL); uploads directly to R2; commits metadata via the event log.
- Encryption: client encrypts the file with the thread's MLS exporter secret (or per-file content key wrapped by MLS) before upload; server stores ciphertext + sha256 + size.
- Limits: 100 MB per file, 1 GB per thread. Enforce on commit, not upload.
- Validation: server re-validates declared vs actual MIME via magic-byte sniffing (`file-type` npm package).

R2 free tier and pricing per the R2 pricing page.

---

## 8. Multi-Mac Identity & Failover

- Each Mac runs a Hermes gateway instance; each registers with the control plane.
- Heartbeat every 30 s; 90 s TTL.
- Control plane holds a small `active_macs` set per user (round-robin or geo).
- When a Mac sleeps, heartbeat times out; traffic fails over to the next warm Mac.
- For true HA across two Macs, the Tailscale subnet router HA pattern (see [184]) is the reference design.
- Conflict resolution: per-thread MLS epoch; newer epoch wins, older writes are re-issued by the client on reconnect.

---

## 9. PWA vs. Dedicated Next.js App

**PWA advantages:**

- One codebase for desktop, mobile-web, and tablet.
- Service Worker gives offline + background sync.
- Installable on macOS (Chrome/Edge), iOS Safari "Add to Home Screen", Android Chrome.
- No App Store review for the web surface.

**PWA disadvantages:**

- iOS Web Push requires the PWA to be "installed" and has stricter rules.
- No native Share Extension, no Shortcuts app, no system handoff to Hermes Mobile.

**Dedicated Next.js app advantages:**

- Full native shell, deep linking, system share targets.
- Code signing and notarization distribution outside App Store (notarization only).

**Verdict.** Ship a PWA first. The Hermes Mobile iOS app already satisfies App Store guideline 4.2 as the primary mobile surface. Add a "Get the Mac App" CTA inside the PWA only when usage data shows demand for system-level features. This is the path Slack, Linear, and Notion have all taken.

If you must avoid the PWA path for legal/brand reasons, ship a Tauri/Electron shell that loads the same PWA bundle. That preserves one codebase while giving you a real `.app` for distribution. See the Apple App Store Review Guidelines for the minimum-functionality bar.

---

## 10. React Native Web Reuse vs. Dedicated Web Client

React Native Web is a real production choice at companies like Twitter, Shopify, and Discord, but it imposes costs:

- Performance budget for large lists/charts is tight on web; Hermes Mobile uses FlashList, which has limited RNW parity.
- DOM-specific features (CSS Grid, container queries, scroll-snap) are awkward.
- Bundle weight: ~250-400 KB for RNW runtime alone.

**Verdict.** Build the web dashboard with React + Vite + TanStack Query, share TypeScript domain types and pure-logic modules (`@hermes/core`) via a workspace package. Do not share rendering layers. React Native Web is the wrong hammer for a data-dense desktop dashboard that is fundamentally a different UX (multi-column, resizable panels, keyboard-driven) from the mobile chat UI.

---

## 11. Cost and Operations

- **Workers Paid**: $5/mo minimum, includes 1M requests + 10M GB-s.
- **Durable Objects**: ~$0.02/M requests + $0.20/M GB-s; hibernation API drops idle cost ~95%.
- **R2**: 10 GB free, then $0.015/GB-mo; zero egress.
- **Workers Logs**: free tier covers dev; $0.05/M logs in production.
- **Queues**: 1M ops/mo free; useful for attachment fan-out.

Reference pricing from the Cloudflare Workers pricing page and [91].

For 10k MAU, ~200 concurrent sockets, ~50 GB attachments, expect $25-$150/mo all-in, dominated by DO compute and R2 storage.

Observability stack: Workers Logs + Sentry SDK + OpenTelemetry traces to Honeycomb or Grafana Cloud. Dashboards for p50/p95/p99 event latency, DO hibernation count, R2 ops/s.

---

## 12. App Store and Play Store Implications

- **Apple App Store, Guideline 4.2 (Minimum Functionality).** Apps that are "primarily a website wrapped in a native container" are rejected. Hermes Mobile is a native iOS app first; the web dashboard is a complementary surface, so review risk is low. Reference: App Store Review Guidelines.
- **Guideline 5.1.1 / 4.8 (Privacy).** If the app offers Sign in with Google or third-party auth, Sign in with Apple must be offered as an equivalent. Apple's docs cover the requirement.
- **Guideline 2.1 (App Completeness).** All features advertised must work; broken offline sync would be a rejection risk.
- **Google Play.** Personal/Sensitive Data policy requires clear disclosure of any data collection; E2EE claims must hold under audit. Reference: Google Play Developer Policy Center.
- **PWA distribution on iOS.** Apple deprecated "Add to Home Screen" prompts in Safari; users must manually share -> Add to Home Screen. Web Push on iOS requires installation first. Reference: WebKit Web Push announcement.

---

## 13. Migration Path from Current Hermes Mobile/Mac Gateway

1. **Week 0 - Shadow.** Add a read-only `wss://dashboard.hermes.local` endpoint that mirrors the existing REST. No client changes.
2. **Week 2 - Dual-write.** Gateway writes to both SQLite-on-Mac and the new control-plane DO. Web dashboard reads from control plane.
3. **Week 4 - Opt-in beta.** Internal users get the PWA. Telemetry: session start frequency, sync conflicts, error rates.
4. **Week 8 - Default.** All new threads sync by default; existing threads migrate on next open.
5. **Week 12 - Cutover.** Mark REST `/poll` as legacy; redirect to WebSocket.
6. **Week 16 - Cleanup.** Drop REST endpoint, reclaim the SQLite WAL path.

Each step is reversible: the Mac-resident gateway is the source of truth until cutover, and the gateway can fall back to REST if Cloudflare is unreachable.

---

## 14. Phased Delivery Plan

| Phase | Weeks | Deliverable | Validation |
|---|---|---|---|
| 0 | 1-2 | DO storage + mock WS client | Integration tests pass; p99 event < 200 ms |
| 1 | 3-4 | PWA shell, thread list, read-only view | Lighthouse PWA score 100; CLS < 0.1 |
| 2 | 5-6 | E2E: MLS handshake + ciphertext render | 10 internal dogfood users; zero plaintext leak |
| 3 | 7-8 | Write path + R2 attachment upload | Soak test 10k messages; no dup writes |
| 4 | 9-10 | Multi-Mac failover + revocation UI | Failover < 5 s; revoke kills socket < 2 s |
| 5 | 11-12 | Observability, SLOs, dashboards | Burn-rate alerts live; weekly review cadence |
| 6 | 13+ | Iterate on feedback, iOS handoff | NPS target > 40 |

---

## 15. Acceptance & E2E Tests (Falsifiable)

1. **Continuity.** Start thread on iOS, resume on web dashboard within 5 s; thread snapshot SHA-256 matches.
2. **Offline.** Kill network for 24 h, type 50 messages; restore; server assigns monotonically increasing seqs; no duplicates.
3. **Reconnect storm.** Drop/restore Wi-Fi 100 times in 5 min; no duplicate writes; CPU < 60%.
4. **Idempotency.** Send same message twice within 100 ms; second response identical; no extra event.
5. **E2E integrity.** Tamper one byte of a stored event; client refuses to render and shows "data integrity" error.
6. **Passkey revocation.** Revoke device from settings; within 30 s its WebSocket returns 401 and pending writes are rejected with explicit "device revoked".
7. **Failover.** Kill primary Mac; within 90 s secondary accepts new writes; in-flight writes return clear "rerouted" error.
8. **Attachment confidentiality.** Upload file; object on R2 is opaque ciphertext; key disclosure requires active MLS epoch.
9. **PWA install (iOS).** Share -> Add to Home Screen launches standalone; back button closes cleanly.
10. **Threat-model negatives.** MITM CA cert rejected (WebAuthn origin binding); replayed event fails hash check.
11. **Load.** 1k concurrent WS, 50 msg/s each; p95 server latency < 80 ms.
12. **Cost guardrail.** Under load test above, Cloudflare bill < $30/month.

---

## 16. Synthesis

Three axes frame the trade-offs:

1. **Sync substrate.** Event-sourced append-only logs unify continuity, resumability, and audit. Mutable row state multiplies conflict-resolution code and complicates resume; an event log is the single right primitive.
2. **Routing topology.** A shared cloud control plane is operationally cheap and uniformly secure. Direct browser-to-Mac tunnels optimize for latency at the cost of identity, observability, and revocation; they belong in an "advanced" toggle, not the default.
3. **Client strategy.** PWA is the right v1 surface: instant distribution, offline by default, installable on every desktop, and zero App Store friction. A dedicated Next.js client is unnecessary until features (handoff, share extension, Shortcuts) prove their demand.

The recommended stack:

- Cloudflare Workers + Durable Objects (per-thread WebSocket hub, hibernation API).
- Cloudflare R2 for attachments (pre-signed PUT, server-side encryption as defense in depth).
- MLS via openmls compiled to WASM; shared `@hermes/core` package for Swift/Kotlin/TS.
- Lamport-clocked, content-addressed event log per thread; CRDT (Automerge or Yjs) only inside tool-call argument trees where merge matters.
- PWA on iOS, macOS, Windows, Linux; no native wrapper required at v1.
- Hermes Agent gateway as durable backend; REST legacy path deprecated after Week 12 cutover.
- Reversible migration: Mac-resident gateway remains source of truth until cutover.

That is the smallest architecture that meets every constraint in the brief while remaining operable by a small team and fitting comfortably inside a sub-$30/month cloud envelope.

---

## References

1. *Local-First Software Architecture: CRDTs, Sync Engines, and ...*. https://letsbuildsolutions.com/blog/web-engineering/local-first-software-architecture-crdts-sync-engines-and-offline-capable-web-apps
2. *Local-first Software - Ink & Switch*. https://www.inkandswitch.com/local-first-software
3. *Ink and Switch - Local-first software - /s (strangemonad's notes)*. https://notes.strangemonad.com/Ink%2Band%2BSwitch%2B-%2BLocal-first%2Bsoftware
4. *Local-First Software Principles | Fernando Hermida*. https://www.fernandohermida.com/notes/architecture/local-first-software-principles
5. *Ink & Switch*. https://www.inkandswitch.com/
6. *Server-Sent Events vs WebSockets: 2026 Developer Guide*. https://www.alexcloudstar.com/blog/server-sent-events-vs-websockets-2026
7. *Server-Sent Events vs WebSockets in 2026: When SSE Is the ...*. https://souvenirlist.com/blog/server-sent-events-vs-websockets-2026
8. *Implementing Real-Time Chat with SSE vs WebSockets (and Why I ...*. https://dev.to/divyanshulohani/implementing-real-time-chat-with-sse-vs-websockets-and-why-i-chose-one-2mn2
9. *Server-Sent Events vs WebSockets vs Long Polling: A 2026 ...*. https://alldevtoolshub.com/blog/server-sent-events-vs-websockets-vs-long-polling
10. *WebSocket vs SSE Performance: 10,000 User Chat Room – Loop vs ...*. https://www.w3tutorials.net/blog/performance-difference-between-websocket-and-server-sent-events-sse-for-chat-room-for-10-000-users
11. *Passkey*. https://better-auth.com/docs/plugins/passkey
12. *What Is a Passkey? Modern Authentication Fundamentals*. https://www.sentinelone.com/cybersecurity-101/identity-security/what-is-a-passkey
13. *Passkey Authentication: Production-Ready Patterns in 2026*. https://imperialis.tech/en/blog/passkey-authentication-production-ready-patterns-2026
14. *The Passwordless Authentication with Passkey Technology from an ...*. https://ieeexplore.ieee.org/document/11253472
15. *Passkey Proof of Concept with the WebAuthn API for a Ed25519 Key ...*. https://github.com/orgs/NillionNetwork/discussions/110
16. *Hermes Agent Mobile | Uzair Ansar*. https://www.uzairansar.com/hermes-mobile
17. *Evolution of Hermes V3: Building a Conversational AI Data ...*. http://zenml.io/llmops-database/evolution-of-hermes-v3-building-a-conversational-ai-data-analyst
18. *GitHub - amirghm/hermes-agent-mobile: Hermes AI assistant for ...*. https://github.com/amirghm/hermes-agent-mobile
19. *zoro-jiro-san/hermes-agent-architecture - GitHub*. https://github.com/zoro-jiro-san/hermes-agent-architecture
20. *Hermes Frangoudis - Helping developers build the future of Voice ...*. https://www.linkedin.com/in/hermesfrangoudis
21. *End-to-End Encryption System for Web Messaging with Diffie ...*. https://www.ai-futureschool.com/en/example-programs/end-to-end-encryption-system-for-web-messaging-with-diffie-hellman-key-management-and-ratcheting-in-pure-javascript.php
22. *Understanding End-to-End Encryption with a Chat App | Medium*. https://medium.com/%40shivamraj1109.23/understanding-end-to-end-encryption-build-a-secure-chat-app-with-next-js-websocket-and-web-crypto-ad66679d887c
23. *Messaging Layer Security (MLS) - Wire – Support*. https://support.wire.com/hc/en-us/articles/12434725011485-Messaging-Layer-Security-MLS
24. *What is Messaging Layer Security (MLS)?*. https://messaginglayersecurity.rocks/
25. *The Double Ratchet Algorithm*. https://signal.org/docs/specifications/doubleratchet
26. *PWA on iOS: Install Guide & Limits for Advertisers 2026*. https://deepclick.com/resources/blog/progressive-web-apps-on-ios
27. [PWA on iOS - Current Status & Limitations for Users [2025]](https://brainhub.eu/library/pwa-on-ios)
28. *Current Progressive Web App Limitations To iOS Users - Tigren*. https://www.tigren.com/blog/progressive-web-app-limitations
29. *Navigating Safari/iOS PWA Limitations and Bugs: Essential ...*. https://vinova.sg/navigating-safari-ios-pwa-limitations
30. *Progressive Web Apps vs React Native: Which One Should You ...*. https://mediusware.com/blog/progressive-webapp-vs-react-native-app
31. *How to Build Robust Offline-First Apps: A Technical Guide ...*. http://ditto.com/blog/how-to-build-robust-offline-first-apps-a-technical-guide-to-conflict-resolution-with-crdts-and-ditto
32. *CRDT: Offline-First App*. https://grove.xraph.com/docs/guides/crdt-offline-first
33. [CRDTs for Offline-First Apps: Practical Guide [2026]](https://techbytes.app/posts/crdts-for-offline-first-apps-practical-guide-2026)
34. *crdt_sync | Dart package - Pub*. https://pub.dev/packages/crdt_sync
35. *Implementing idempotency*. http://shopify.dev/docs/api/usage/implementing-idempotency
36. *Google Play Policy Updates July: New Standards for App ...*. https://asoworld.com/blog/google-play-policy-updates-july-new-standards-for-app-developers
37. *Developer Policy Center - play.google*. https://play.google/developer-content-policy
38. *Google Play Policies | Android Developers*. https://developer.android.com/distribute/play-policies
39. *Google announces Play Store policy changes to counter ...*. https://www.xda-developers.com/google-play-store-policy-changes-july-2022
40. *Google Play Developer Program Policy Update - 16-07-2026*. https://www.reddit.com/r/android_devs/comments/1uy8z64/google_play_developer_program_policy_update
41. *CLI Commands Reference | Hermes Agent*. https://hermes-agent.nousresearch.com/docs/reference/cli-commands
42. *Hermes Agent / Open WebUI*. https://docs.openwebui.com/getting-started/quick-start/connect-an-agent/hermes-agent
43. *Hermes Agent Installation & Discord Configuration Tutorial*. https://devtuts.net/en/ai-agents/hermes-installation.html
44. *Hermes Agent Messaging Gateway: Telegram, Discord, Slack ...*. https://lushbinary.com/blog/hermes-agent-telegram-discord-slack-whatsapp-messaging-guide
45. *How to Use the Hermes Agent Dashboard & Web UI*. https://hermes-agent.ai/how-to/use-hermes-web-ui
46. *React Native for Web in 2025: One Codebase, All Platforms*. https://medium.com/react-native-journal/react-native-for-web-in-2025-one-codebase-all-platforms-b985d8f7db28
47. *Share 60-80% Code Across Mobile, Web & Desktop Apps*. https://nexisltd.com/blog/cross-platform-development-sharing-code-mobile-web-desktop
48. *Expo for E-commerce applications*. https://expo.dev/solutions/ecom
49. *Expo (@expo) / Posts / X*. https://x.com/expo?lang=en
50. *expo*. https://www.npmjs.com/package/expo
51. *title: Durable Object State description: API reference for DurableObjectState, which controls concurrency, WebSocket attachment, and storage access. image: https://developers.cloudflare.com/dev-products-preview.png*. http://developers.cloudflare.com/durable-objects/api/state
52. *Cloudflare WebSockets: CDN, Workers & Durable Objects*. https://websocket.org/guides/infrastructure/cloudflare
53. *How to Implement Cloudflare Durable Objects*. https://oneuptime.com/blog/post/2026-01-27-cloudflare-durable-objects/view
54. *WebSockets · Cloudflare Workers docs*. https://developers.cloudflare.com/workers/runtime-apis/websockets
55. *Building Stateful AI Agents at the Edge with Cloudflare ...*. https://multiwaresolutions.com/blog/cloudflare-agents-durable-objects-2026
56. *Cross Device Passkey Sync Explained: iCloud Keychain, ... MojoAuth https://mojoauth.com › blog › cross-device-passkey-sync...*. https://mojoauth.com/blog/cross-device-passkey-sync-icloud-google-1password
57. *Passkeys in iCloud Keychain*. https://developer.apple.com/forums/tags/passkeys-in-icloud-keychain?sortBy=oldest&sortOrder=DESC
58. *Passkeys in iCloud Keychain | Apple Developer Forums*. https://developer.apple.com/forums/tags/passkeys-in-icloud-keychain
59. *Passkeys in iCloud Keychain | Apple Developer Forums*. https://developer.apple.com/forums/tags/passkeys-in-icloud-keychain?page=2
60. *Passkeys in iCloud Keychain*. https://developer.apple.com/forums/tags/passkeys-in-icloud-keychain?page=3&sortBy=activity&sortOrder=ASC
61. *OWASP Threat Model Library*. https://owasp.org/www-project-threat-model-library
62. *Top threat modeling frameworks: STRIDE, OWASP Top 10, MITRE ...*. https://www.infosecinstitute.com/resources/management-compliance-auditing/top-threat-modeling-frameworks-stride-owasp-top-10-mitre-attck-framework
63. *Medium*. https://medium.com/%40syedjawad07/a-complete-guide-to-threat-modeling-with-stride-using-owasp-threat-dragon-59052de39dbe
64. *Threat Modeling in OWASP Security Culture*. https://owasp.org/www-project-security-culture/v10/6-Threat_Modelling
65. *Threat Modeling - OWASP SAMM*. https://owaspsamm.org/model/design/threat-assessment/stream-b
66. *Tailscale vs Cloudflare Tunnel vs ngrok in 2026 - Insights*. https://insights.nomadlab.cc/blog/2026/04/tailscale-vs-cloudflare-tunnel-vs-ngrok-2026
67. *ngrok vs Cloudflare Tunnel vs fxTunnel — Comparison 2026*. https://fxtun.dev/blog/ngrok-vs-cloudflare-vs-fxtunnel
68. *Cloudflare Tunnel vs ngrok vs Tailscale: Which Secure Tunnel ...*. https://devopsboys.com/blog/cloudflare-tunnel-vs-ngrok-vs-tailscale-2026
69. *Cloudflare Tunnel vs. Tailscale vs. ngrok Comparison Chart*. https://sourceforge.net/software/compare/Cloudflare-Tunnel-vs-Tailscale-vs-ngrok
70. *Cloudflare Tunnel vs. ngrok vs. Tailscale: Choosing the Right ...*. https://dev.to/mechcloud_academy/cloudflare-tunnel-vs-ngrok-vs-tailscale-choosing-the-right-secure-tunneling-solution-4inm
71. *Browser Storage APIs: OPFS, IndexedDB, and SQLite-over-WASM ...*. https://lucioduran.com/blog/browser-storage-apis-opfs-indexeddb-sqlite-wasm
72. *Offline-first frontend apps in 2025: IndexedDB and SQLite in ...*. https://blog.logrocket.com/offline-first-frontend-apps-2025-indexeddb-sqlite
73. *Browser Storage Comparison: sql.js vs IndexedDB vs localStorage*. https://recca0120.github.io/en/2026/03/06/browser-storage-comparison
74. *GitHub - micrometre/opfs-sqlite: SQLite WASM with Origin ...*. https://github.com/micrometre/opfs-sqlite
75. *IndexedDB vs SQLite WASM (A Real World Example) | Usman Haroon*. https://haroonwaves.com/blog/building-email-client
76. *Web Push API and Service Worker 2 | by Leon Feng Medium · Leon Feng 1 gosto · há 6 anos*. https://medium.com/swlh/web-push-api-and-service-worker-2-20db00a4f96f
77. *Richer offline experiences with the Periodic Background Sync API*. https://developer.chrome.com/docs/capabilities/periodic-background-sync
78. *Web Push API Example including Service Worker and ...*. https://github.com/pirminrehm/service-worker-web-push-example
79. *Synchronize and update a PWA in the background*. https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/background-syncs
80. *Make PWAs re-engageable using Notifications and Push APIs*. http://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Tutorials/js13kGames/Re-engageable_Notifications_Push
81. [App Store Guideline 4.2 Minimum Functionality [Fixed]](https://www.technetexperts.com/guideline-4-2-minimum-functionality)
82. *App Store, app rejected Guideline 4.2 - Design - Minimum ...*. https://stackoverflow.com/questions/79814952/app-store-app-rejected-guideline-4-2-design-minimum-functionality
83. *Minimum Functionality (Web Wrapper) - Guideline 4.2.2 | Appraysal*. https://appraysal.com/rules/4.2.2_minimum_functionality
84. *Apple 4.2 Rejection: Why WebView Apps Get Rejected (And How ...*. https://blog.webvify.app/blogs/apple-4-2-minimum-functionality-rejection
85. *How do I fix a Guideline 4.2 'minimum functionality ...*. https://ptkd.com/journal/guideline-4-0-design-minimum-functionality-ai-wrapper-fix
86. *Key Derivation Functions (PBKDF2, HKDF) | DevToolbox*. https://www.dev-toolbox.tech/tools/encryption-playground/examples/key-derivation-functions
87. *Web Crypto API example - GitHub Pages*. https://mdn.github.io/dom-examples/web-crypto/derive-key/index.html
88. *ECDH Encryption/Decryption with Web Cryptography and JavaScript*. https://asecuritysite.com/webcrypto/crypt_ecdh_enc2
89. *JavaScript Encryption Tool – Secure Client-Side AES-256-GCM ...*. https://www.getzenquery.com/tools/javascript-encryption
90. *SubtleCrypto: encrypt() method - Web APIs | MDN*. http://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt
91. *Pricing · Cloudflare Durable Objects docs Cloudflare Developer Docs https://developers.cloudflare.com › ...*. https://developers.cloudflare.com/durable-objects/platform/pricing
92. *Cloudflare Workers Pricing 2026: Plans, Hidden Costs ...*. https://toolradar.com/tools/cloudflare-workers/pricing
93. *cloudflare-docs/src/content/docs/durable-objects/platform ...*. https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/durable-objects/platform/pricing.mdx
94. *Pricing · Cloudflare Workers docs*. https://developers.cloudflare.com/workers/platform/pricing
95. *Cloudflare Durable Objects Pricing Calculator (2026) | FlareCalc*. https://flarecalc.com/calculators/durable-objects
96. [PWA iOS Limitations and Safari Support [2026]](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
97. *Web Push Support for Mobile Safari - academy.insiderone.com*. https://academy.insiderone.com/docs/web-push-support-for-mobile-safari
98. *8 PWA Integration Mistakes in 2026 — How to Avoid and Fix*. https://webscraft.org/blog/8-kritichnih-pomilok-pri-integratsiyi-pwa-stsenariyi-prichini-ta-rishennya-z-kodom?lang=en
99. *Service workers and iOS / Safari*. https://stackoverflow.com/questions/29895387/service-workers-and-ios-safari
100. *R2 pricing*. https://developers.cloudflare.com/r2/pricing
101. *Uploading Files to Cloudflare R2 with Pre-Signed URLs*. https://ruanmartinelli.com/posts/cloudflare-r2-pre-signed-urls
102. *Cloudflare R2 Pricing for WordPress: Save on Storage & ...*. https://next3offload.com/blog/cloudflare-r2-pricing-wordpress
103. *Cloudflare R2 free tier in 2026: what you get and when to ...*. https://nubbo.app/blog/cloudflare-r2-free-tier
104. *Cloudflare R2 Pricing 2026: Which Plan is Best for You?*. https://themedev.net/blog/cloudflare-r2-pricing
105. *iOS Universal Links*. https://docs.expo.dev/linking/ios-universal-links
106. *How to Get 'Handoff' Working in OS X Yosemite and iOS 8 MacRumors https://www.macrumors.com › 2014/10/24 › how-to-ha...*. https://www.macrumors.com/2014/10/24/how-to-handoff-not-working
107. *Configuring an associated domain | Apple Developer Documentation*. http://developer.apple.com/documentation/xcode/configuring-an-associated-domain
108. *iOS - Universal Links - aka deep linking*. https://support.discord.com/hc/en-us/community/posts/4410106472983-iOS-Universal-Links-aka-deep-linking
109. *What are Universal Links and how to implement them*. https://www.appsflyer.com/glossary/universal-links
110. *Gateway Internals | Hermes Agent*. https://hermes-agent.nousresearch.com/docs/developer-guide/gateway-internals
111. *Hermes Workspace Mobile: Agent Orchestration Goes Mobile*. https://www.halmob.com/blog/hermes-workspace-mobile-agent-orchestration
112. *hermes-agent-source-wiki/concepts/messaging-gateway ... - GitHub*. https://github.com/FrankFilippi/hermes-agent-source-wiki/blob/main/concepts/messaging-gateway-architecture.md
113. *hermes-agent/website/docs/developer-guide/architecture.md at ...*. https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/architecture.md
114. *Building a Multi-Platform Agentic Gateway: A Deep Dive into ...*. https://akjamie.github.io/post/2026-05-19-gateway-deep-dive
115. *Messaging Layer Security*. https://en.wikipedia.org/wiki/Messaging_Layer_Security
116. *Signal and Messaging Layer Security – Rolf Oppliger*. https://rolf.esecurity.ch/?page_id=1284
117. *E2EE Integration Guide*. https://developer.incode.com/docs/user-guide-e2ee
118. *E2EE Messaging using the Messaging Layer Security (MLS ...*. https://nips.nostr.com/ee
119. *Secure Communication Architecture: E2EE, MLS Explained*. https://wire.com/en/blog/secure-communication-architecture-e2ee-mls-identity
120. *automerge vs yjs - compare differences and reviews? | LibHunt*. https://www.libhunt.com/compare-automerge-vs-yjs
121. *JS/WASM Benchmarks*. https://loro.dev/docs/performance
122. *CRDTs and Real-Time Collaboration: Building Conflict-Free ...*. https://zylos.ai/research/2026-01-29-crdt-real-time-collaboration
123. *Benchmarks – Nextra*. https://www.secsync.com/docs/benchmarks
124. *Syncing files between browser and disk using Yjs and the ...*. https://news.ycombinator.com/item?id=31315717
125. *FAQs - SingleKey ID*. http://singlekey-id.com/frequently-asked-questions
126. *Does Bitwarden need to do User Verification anew for each ...*. https://community.bitwarden.com/t/does-bitwarden-need-to-do-user-verification-anew-for-each-authentication-ceremony/68682
127. *On-device WebAuthn and what makes it hard to do well*. https://news.ycombinator.com/item?id=33939871
128. *WebAuthn and Passkeys*. https://www.webauthn.me/passkeys
129. *App Store Rejection 4.2: How to Get Your WebView ...*. https://code2native.com/blog/fix-app-store-rejection-42-webview
130. *App Store Rejection Reasons and How to Prevent Them*. https://adapty.io/blog/app-store-rejection
131. *App Store Rejection 4.2 - Design: Minimum Functionality*. https://forum.ionicframework.com/t/app-store-rejection-4-2-design-minimum-functionality-my-first-after-2-years-of-ionic/200908
132. *Apple App Store Review Guidelines: Developer Reference 2026*. https://www.apptester.co/blog/app-store-guidelines
133. *Can OpenTelemetry Save Observability in 2026? - The New Stack*. https://thenewstack.io/can-opentelemetry-save-observability-in-2026
134. *Observability - Agents*. https://developers.cloudflare.com/agents/runtime/operations/observability
135. *Observability in 2026: How OpenTelemetry Became the Standard*. https://www.devx.com/uncategorized/observability-opentelemetry-industry-standard-2026
136. *Observability trends for 2026 (Part 2): GenAI and OpenTelemetry ...*. https://www.elastic.co/blog/2026-observability-trends-generative-ai-opentelemetry
137. *OpenTelemetry (OTel) | HPE AI Essentials Software 1.11.x Air ...*. https://support.hpe.com/hpesc/public/docDisplay?docId=a00aie111dhen_us&docLocale=en_US&page=Observability%2Fotel.html
138. *Hermes Agent: The Open-Source Self-Improving AI Agent That's ...*. https://www.opc.community/blog/hermes-agent-open-source-ai-agent-2026
139. *Hermes Agent — Open-Source AI Agent with Memory, Skills, and Cron*. https://hermes-agent.ai/
140. *GitHub - ndizazzo/hermes-agent: Forked Hermes Agent with ...*. https://github.com/ndizazzo/hermes-agent
141. *Hermes Agent — Open-Source AI Agent with Persistent Memory*. https://hermes-agent.org/
142. *GitHub - NousResearch/hermes-agent: The agent that grows with ...*. https://github.com/nousresearch/hermes-agent
143. *expo/docs/pages/build-reference/limitations.mdx at main ...*. https://github.com/expo/expo/blob/main/docs/pages/build-reference/limitations.mdx
144. *Expo Router Deep Dive: File-Based Navigation for React Native ...*. https://calmops.com/web/expo-router-deep-dive
145. *React Native Web for Production*. https://medium.com/%40_benmoses/react-native-web-for-production-556feccfd0cb
146. *Expo Router*. https://expo.dev/router
147. *Expo Router - a complete guide for React Native and the Web*. https://uniquedevs.com/en/blog/how-to-master-expo-router-basics-best-practices-examples-and-comparisons
148. *Sign in with Apple – Guidelines and Requirements*. https://apptekz.com/sign-in-with-apple-guidelines-and-requirements
149. *Sign in with Apple Required - Guideline 4.8 | Appraysal*. https://appraysal.com/rules/4.8_sign_in_with_apple
150. *App Store Upload rejection about guideline 4.8, third party ...*. https://stackoverflow.com/questions/78126978/app-store-upload-rejection-about-guideline-4-8-third-party-logins
151. *Is "Sign In with Apple" is require… | Apple Developer Forums*. https://developer.apple.com/forums/thread/131245
152. *Sign in with Apple | Apple Developer Documentation*. https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple
153. *Cloudflare to Implement Post-Quantum Cryptography to Defend ...*. https://cybersecuritynews.com/cloudflare-to-implement-post-quantum-cryptography
154. *Cloudflare Enhances Security with Post-Quantum Cryptography ...*. https://cyberpress.org/cloudflare-enhances-security
155. *ML-KEM Post-Quantum Key Agreement for TLS 1.3*. https://www.ietf.org/archive/id/draft-ietf-tls-mlkem-04.html
156. *Post-quantum cryptography (PQC) · Cloudflare SSL/TLS docs*. https://developers.cloudflare.com/ssl/post-quantum-cryptography
157. *ML-KEM Post-Quantum Key Agreement for TLS 1.3*. https://www.ietf.org/archive/id/draft-ietf-tls-mlkem-05.html
158. *PWA Push Notifications on iOS in 2026: What Really Works*. https://webscraft.org/blog/pwa-pushspovischennya-na-ios-u-2026-scho-realno-pratsyuye?lang=en
159. *FAQ about Web Push Support for Mobile Safari*. https://academy.insiderone.com/docs/faq-about-web-push-support-for-mobile-safari
160. *Mobile Web Push Is Now Supported on Safari Braze https://www.braze.com › Resources › Blog*. https://www.braze.com/resources/articles/mobile-web-push-is-now-supported-on-safari
161. *iOS Safari only allows push notifications for web apps ... Hacker News https://news.ycombinator.com › item*. https://news.ycombinator.com/item?id=43574153
162. *iOS push notifications: APNs setup, types & best practices*. https://www.pushwoosh.com/blog/ios-push-notifications
163. *LINDDUN privacy threat modeling framework | NIST*. https://www.nist.gov/privacy-framework/linddun-privacy-threat-modeling-framework
164. *LINDDUN privacy threat modeling*. https://cif-seminars.github.io/slides/20200929-kwuyts-linddun-go.pdf
165. *Privacy Threat Modelling using LINDDUN*. https://privacydiaries.substack.com/p/privacy-threat-modelling-using-linddun
166. *STRIDE Threat Model Explained: Framework, Examples & ...*. https://www.softwaresecured.com/post/stride-threat-modelling
167. *OWASP Application Security Verification Standard (ASVS)*. https://owasp.org/www-project-application-security-verification-standard
168. *Why I Use a Postgres Append-Only Log for Agent Chat (Not ...*. https://tanayshah.dev/blog/postgres-append-only-chat-events
169. *Google Chat not syncing on the computer but is up to date on the ...*. https://support.google.com/chat/thread/324659923/google-chat-not-syncing-on-the-computer-but-is-up-to-date-on-the-phone?hl=en
170. *Ai Chat Sync · Issue #1059 · rcourtman/Pulse*. https://github.com/rcourtman/pulse/issues/1059
171. *Module 1: Chat Sync | Mio Academy for Google and Microsoft*. https://www.m.io/academy/chat-sync
172. *Threading dynamics in chat applications: exploring the effect ...*. https://kth.diva-portal.org/smash/get/diva2%3A1936742/FULLTEXT02.pdf
173. *GitHub - makalin/Secure-Chat: A modern end-to-end encrypted ...*. https://github.com/makalin/Secure-Chat
174. *Chat Application Architecture, Explained - GetStream.io*. https://getstream.io/blog/chat-application-architecture
175. *Load Testing WebSockets: Playwright MCP's Message Burst ...*. https://markaicode.com/websocket-load-testing-playwright-mcp
176. *How to Get Started with Playwright for E2E Testing*. https://oneuptime.com/blog/post/2026-01-26-playwright-e2e-testing/view
177. *Playwright E2E Testing Framework*. https://github.com/ovcharski/playwright-e2e
178. *Manifest: Daily Journal - App Store - Apple*. https://apps.apple.com/in/app/manifest-daily-journal/id6463312362
179. *Guidelines - App Store - Apple Developer*. https://developer.apple.com/app-store/guidelines
180. *Latest News - Apple Developer*. https://developer.apple.com/news
181. *Manifest: Daily Journal - App Store - Apple*. https://apps.apple.com/us/app/manifest-daily-journal/id6463312362
182. *Privacy manifest files | Apple Developer Documentation*. https://developer.apple.com/documentation/bundleresources/privacy-manifest-files
183. *Troubleshoot overlapping subnet route failover*. https://tailscale.com/docs/reference/troubleshooting/network-configuration/overlapping-subnet-route-failover
184. *Set up high availability*. https://tailscale.com/docs/how-to/set-up-high-availability
185. *Tailscale subnet routers high availability and failover question*. https://www.reddit.com/r/Tailscale/comments/1j5n7pk/tailscale_subnet_routers_high_availability_and
186. *Failover subnet routers same subnet. : r/Tailscale*. https://www.reddit.com/r/Tailscale/comments/1d31ovb/failover_subnet_routers_same_subnet
187. *Set up an SSH-tunnel on Windows, Linux, or Mac*. https://www.candelatech.com/cookbook/misc/Instructions_to_Set_Up_an_SSH_Tunnel
188. *Pricing · Cloudflare Workers docs*. http://developers.cloudflare.com/workers/platform/pricing
189. *Limits · Cloudflare Workers docs*. https://developers.cloudflare.com/workers/platform/limits
