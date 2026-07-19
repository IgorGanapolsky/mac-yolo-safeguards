# Hermes Web Thread Dashboard — July 2026 Decision Record

Research run: `trun_d3be5e813aa94970bd4ce09973506e4b`

Run URL: <https://platform.parallel.ai/play/deep-research/trun_d3be5e813aa94970bd4ce09973506e4b>

Decision date: 2026-07-19

## Decision

Build a web dashboard. The product benefit is real: a user should be able to open the same Hermes thread on a desktop, read the same ordered transcript, send the next message with a physical keyboard, and continue on the phone without copying context.

Do **not** start by cloning `ChatScreen.tsx` into a web project. First establish one canonical, durable thread protocol. Hermes already has visible regressions around duplicate optimistic messages, local deletion tombstones, retries, and session restoration. Adding another UI before fixing identity, ordering, idempotency, and deletion semantics would multiply those defects.

The lowest-risk path is:

1. extend the existing Hermes relay/control plane rather than migrating providers;
2. add a versioned shared protocol package and server-authoritative event contract;
3. release a read-only authenticated web viewer;
4. add sending only after retry/idempotency tests pass;
5. add attachments, approvals, offline outbox, and stronger E2EE in later gates.

This work does not require an EAS native build until the mobile client begins consuming the new protocol.

## Current Hermes truth

The existing product is not yet a multi-client chat system:

- `src/types/chat.ts` defines a session ID and optional message ID, but no per-thread sequence, revision, deletion tombstone, device ID, or mutation/idempotency ID.
- `src/services/hermesChatClient.ts` creates mobile session IDs locally from a timestamp and random suffix.
- `src/services/hermesGatewayClient.ts` reads, sends, forks, and deletes directly against `/api/sessions/...` on one Mac gateway.
- `src/screens/ChatScreen.tsx` explicitly states that chat needs direct HTTP to the Mac; a relay WebSocket connection is not sufficient. It also contains client-side retry, merge, deduplication, pending-outbox, and dismissed-session behavior.
- `services/hermes-relay/` currently persists accounts, workers, pairing, short-lived operational events, verdicts, and entitlements in a JSON-backed store. It does not persist canonical chat threads or transcripts.
- `tools/hermes-relay-worker.js` bridges worker heartbeats and approval events. It is not a full transcript-sync worker.

Therefore, a browser cannot safely become a second writer by reusing today's direct Mac API. It would have no authoritative cross-device ordering or exactly-once-visible mutation contract.

## Recommended architecture

```text
Phone app ------- HTTPS snapshot/mutation API -------+
       \                                            |
        +----- resumable WebSocket event stream -----+--> Hermes account relay
                                                     |      canonical thread log
Web PWA -------- HTTPS snapshot/mutation API --------+      device sessions
       \                                            |      cursors + tombstones
        +----- resumable WebSocket event stream -----+
                                                     |
Mac worker <---- authenticated worker stream --------+--> local Hermes execution
```

### Control plane

Use the existing account relay as the first control-plane host. Replace its single-process JSON persistence for new chat data with a transactional durable database before any public web write path. Keep pairing, worker presence, and chat data in separate tables and scopes.

Cloudflare Durable Objects are a credible later scaling option because one object can coordinate multiple WebSocket clients and the hibernation API avoids billable duration while clients are idle. That is an evaluation target, not a reason to migrate the current Fly deployment before the protocol works.

Tailscale Funnel or a direct browser-to-Mac URL may remain an internal diagnostic path. It must not be the consumer default: it exposes a per-Mac service, inherits Mac sleep/reachability failures, and does not provide account-wide revocation or authoritative phone/web sync.

### Shared client code

Build a dedicated React web UI and share only protocol/domain code with React Native:

```text
packages/hermes-protocol/
  schemas.ts       # runtime-validated versioned envelopes
  ids.ts           # thread/event/mutation ID rules
  reducer.ts       # deterministic event projection
  client.ts        # snapshots, mutations, resumable stream

apps/hermes-web/   # responsive PWA, desktop-first rendering
hermes-mobile/     # existing native app consumes hermes-protocol
```

Do not share React Native views through React Native Web for v1. The desktop experience needs keyboard navigation, multi-column layout, resizable panes, browser history, accessible focus handling, and desktop attachment behavior. Sharing schemas, reducers, and API clients yields the valuable reuse without forcing one rendering model onto two different form factors.

Expo's PWA guidance supports an installable web surface through a manifest and service worker, but HTTPS deployment is mandatory for service workers. The dashboard should remain fully usable in an ordinary browser; installation is optional.

### Canonical data contract

Minimum entities:

```text
Thread
  thread_id: UUIDv7 or ULID
  account_id
  title
  created_at
  last_seq
  deleted_at?: timestamp
  schema_version

ThreadEvent
  event_id: UUIDv7 or ULID
  thread_id
  seq: monotonically increasing per thread
  mutation_id: client-generated UUIDv7, unique per account/device
  author_device_id
  kind: user_message | assistant_message | status | attachment | title | tombstone
  payload
  created_at

DeviceCursor
  device_id
  thread_id
  last_acked_seq
  updated_at
```

Server laws:

- The server atomically assigns `seq` and stores the event before acknowledging a mutation.
- Repeating the same `mutation_id` returns the original result and never creates another visible message.
- A client resumes with `after_seq`; a gap returns a snapshot plus subsequent events.
- A message is rendered once by `event_id`, never by normalized text or timestamp heuristics.
- Delete/clear appends a server tombstone. It cannot exist only in one client's local storage.
- Agent output is a separate event linked to the triggering user event; partial streams are projections, not extra transcript messages.
- Every envelope has `schema_version`; unsupported versions fail closed with an upgrade response.

Transport should use normal HTTPS for snapshots, history, mutations, attachments, and recovery, plus a resumable WebSocket for live events. WebSocket is appropriate because clients both send and receive; SSE is a reasonable read-only fallback but still needs POST for mutations.

### Authentication and security

For v1:

- account-authenticated browser session with `HttpOnly`, `Secure`, `SameSite=Lax/Strict` cookies;
- short-lived access session, explicit device list, logout-all/revoke-device;
- WebAuthn/passkeys as the preferred browser sign-in and re-authentication method;
- CSRF protection, strict origin allowlist, Content Security Policy, rate limits, and audit events;
- never expose a Mac gateway API key, worker token, Tailscale address, or pairing secret to browser JavaScript;
- encrypt transport with TLS and durable data at rest; redact transcript content from logs/analytics.

WebAuthn Level 3 is the current standards basis for strong public-key authentication. MLS (RFC 9420) is relevant to future multi-device end-to-end encryption, but implementing MLS in the first dashboard release would combine a protocol migration with a cryptographic migration. Do it only after a written threat model, key-recovery decision, independent review, and test vectors. Do not market E2EE before that proof exists.

## Delivery gates

### Gate 0 — protocol correctness

No dashboard UI yet.

- Specify versioned schemas and server laws.
- Add transactional persistence and migrations.
- Add property/integration tests for retry, replay, ordering, reconnect, tombstones, and two writers.
- Add per-account authorization tests preventing cross-account thread access.
- Instrument mutation latency, reconnects, cursor gaps, duplicate mutation attempts, and projection failures without chat content.

Exit criteria:

- 10,000 repeated/reordered mutation simulations yield zero duplicate visible events.
- reconnect from every saved cursor yields the same ordered event projection.
- clear/delete remains deleted after phone, web, relay, and Mac restart.
- an account/device cannot read or mutate another account's thread.

### Gate 1 — read-only web beta

- Passkey/account login.
- Thread list, search, transcript, model/usage metadata when actually supplied, attachment metadata, and live updates.
- Desktop keyboard and accessibility baseline.
- No composer and no approval actions.

Exit criteria:

- a phone-created thread appears on web within 5 seconds at p95;
- identical IDs and ordering on phone and web;
- refresh/offline reopen shows the last committed projection without inventing connectivity;
- revoking the browser device terminates its stream and blocks subsequent reads.

### Gate 2 — web composer

- durable local outbox;
- `mutation_id` on every send;
- optimistic bubble reconciled by authoritative `event_id`/`seq`;
- explicit queued, sent, failed, retrying states;
- no automatic resubmit after ambiguous acknowledgment without the same mutation ID.

Exit criteria:

- send, cut the network before acknowledgment, reconnect, and retry: exactly one user message and one run;
- simultaneous phone/web sends produce one stable order on every client;
- a slept Mac queues work without losing or duplicating the user's message;
- switching devices never switches the active Mac without an explicit user action or an announced failover policy.

### Gate 3 — attachments, approvals, and offline

- pre-signed object upload with checksum, size, MIME, and expiry validation;
- attachment commit is a thread event and cannot disappear from the prompt;
- approval actions have mutation IDs, expiration, signed target details, and fail closed;
- service-worker cache contains only explicitly permitted encrypted/local data.

Exit criteria:

- attachment bytes and checksum match on phone, web, and Mac;
- failed upload preserves the draft and attachments for retry;
- the same approval cannot execute twice;
- offline messages survive browser restart and reconcile once.

### Gate 4 — scale and stronger confidentiality

- evaluate Durable Objects against the measured existing-relay load;
- introduce snapshots/compaction only with replay equivalence tests;
- consider MLS only after threat model and independent security review;
- add multi-Mac execution/failover only after machine identity and user-choice laws are proven.

## Observability and product metrics

Operational telemetry:

- event commit and phone/web propagation latency p50/p95/p99;
- active WebSockets, reconnect rate, cursor gaps, outbox age;
- mutation retries and idempotency hits;
- worker queue age, Mac online/offline transitions, execution latency;
- projection/checksum mismatch count;
- attachment upload/commit failures;
- auth failures, revocations, cross-account denials.

Product telemetry (no transcript content):

- percentage of active threads opened on both phone and web;
- web continuation rate within 24 hours of a mobile message;
- successful-send rate and median time to next message by surface;
- draft recovery rate after disconnect;
- weekly retained users who use both surfaces.

Do not claim the dashboard improves retention or revenue until these metrics show it. The first falsifiable target is continuity: at least 25% of beta users who begin a thread on mobile successfully continue it on web within seven days, with no regression in send success.

## Rejected shortcuts

| Shortcut | Why rejected |
|---|---|
| Browser connects directly to the saved Mac/Tailscale URL | Repeats reachability and secret-distribution failures; no canonical multi-device ordering or revocation. |
| Copy `ChatScreen.tsx` and its AsyncStorage heuristics | Duplicates current retry, tombstone, and optimistic-message failure modes on a second client. |
| React Native Web for maximum UI reuse | Optimizes shared rendering instead of desktop usability; share protocol and reducers instead. |
| MLS/E2EE in the first beta | Too many simultaneous migrations; requires recovery and independent security design first. |
| Cloudflare migration before protocol tests | Provider choice cannot fix missing event identity or idempotency. Keep the current relay until measured data justifies a move. |
| Web page as a remote terminal iframe | Poor accessibility/security and no durable thread semantics. |

## Immediate next engineering task

Create `packages/hermes-protocol` plus an executable contract test harness, without shipping a dashboard screen. The first PR should contain schemas, deterministic projection, mutation-id behavior, tombstone behavior, and a fake two-client relay integration test. It must not alter production chat routing until those tests pass.

## Primary sources

- Cloudflare Durable Objects WebSockets and hibernation: <https://developers.cloudflare.com/durable-objects/best-practices/websockets/>
- Cloudflare hibernating WebSocket server example: <https://developers.cloudflare.com/durable-objects/examples/websocket-hibernation-server/>
- W3C Web Authentication Level 3: <https://www.w3.org/TR/webauthn-3/>
- IETF Messaging Layer Security, RFC 9420: <https://www.rfc-editor.org/rfc/rfc9420.html>
- Expo progressive web app guidance: <https://docs.expo.dev/guides/progressive-web-apps/>
- Tailscale Funnel documentation: <https://tailscale.com/docs/features/tailscale-funnel>

## Research caveats

The Parallel report recommended a Cloudflare-native control plane and MLS immediately. This decision record narrows those conclusions using the actual Hermes codebase: Hermes already has a deployed relay, its current store is not a durable chat database, its browser protocol does not exist, and mobile has client-side reconciliation workarounds. Provider migration and MLS are therefore gated later. Cost projections from the raw report are directional only and are not used as a ship criterion.
