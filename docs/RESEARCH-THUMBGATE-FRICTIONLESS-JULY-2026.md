# ThumbGate frictionless onboarding — July 2026 decision brief

Deep-research run: `trun_77ebfbf4eb9449228a39c3530a1ed229`
Completed: 2026-07-20
Processor: Parallel `pro-fast`, text
Raw metadata and source trail: `parallel-research/thumbgate-frictionless-july-2026.json`

## Verdict

ThumbGate should not replace its working Cloudflare Worker, D1 database, WorkOS login, signed P-256 device pairing, or fenced Fly runner. The fastest credible path to “touch and go” is to remove the handoffs between them:

1. A user signs in with the existing hosted WorkOS flow.
2. The dashboard shows one copyable installer command.
3. The installer creates a device identity and opens `thumbgate.app/dashboard?pair=…` automatically.
4. If login is needed, ThumbGate preserves that exact return URL through AuthKit.
5. The user verifies the named Mac and clicks Approve; no pairing-code transcription is required.
6. The connector reads the already-local Hermes API credential from `~/.hermes/.env`; it never copies the secret into connector config, launchd, the browser, or logs.
7. Recent chats sync automatically and the newest thread opens as soon as it is available.
8. Local execution remains free; a trial or paid account may choose automatic fenced cloud continuation while the Mac is offline.

Target: P50 first real chat rendered within 180 seconds of the first dashboard visit, with zero inbound ports and no gateway-secret copy/paste. This is a product acceptance target, not a currently measured result.

## Evidence quality and corrections to the raw report

The raw research report is useful for pattern discovery, but several statements are recommendations or secondary-source estimates rather than verified ThumbGate facts. This brief corrects them before implementation:

- RFC 8628 and WorkOS CLI Auth support a short-lived device authorization pattern. ThumbGate already has an equivalent signed short-code flow; replacing it with Durable Objects is unnecessary until current D1 contention or replay metrics justify that cost.
- Cloudflare Tunnel is a valid zero-inbound-port option, but ThumbGate’s connector already dials the public control plane outbound over HTTPS. A customer tunnel is not required for chat snapshot sync or control-plane task polling.
- Tauri is a reasonable signed-helper option. It is a 7–30 day distribution improvement, not a reason to delay today’s one-command connector repair.
- Signal/libsignal provides strong multi-device cryptographic patterns, but the current ThumbGate snapshot storage is not end-to-end encrypted. Do not market it as E2EE. The present contract is bounded context, tenant isolation, signed device requests, and local-only device/gateway keys.
- Stripe Meters could price usage later. Current ThumbGate sells bounded cloud continuation and has no external paid customer receipt, so adding metering before activation would be premature.
- The raw report’s SaaS activation and conversion benchmarks come from secondary growth sites. Treat its 55% activation and 18% trial conversion figures as experiment hypotheses, not industry truth.
- The raw report refers to `leash.dev`; the verified production surface is `thumbgate.app` and `app.thumbgate.app`.

## Current-state evidence, 2026-07-20

| Surface | Verified state | Friction implication |
|---|---|---|
| Public routing | Apex and `app.` serve HTTPS; HTTP redirects; HSTS is live | No domain migration needed |
| Identity | WorkOS AuthKit reaches Google/Apple and a real signed-in dashboard session exists | Preserve the requested return path rather than building new auth |
| Pairing | Short code + P-256 device signature works; a real Mac was paired | Remove code transcription and installer discovery |
| Chat sync | Connector supports bounded session/message snapshots; production had threads but zero synced messages before this repair | Local gateway credential discovery is the immediate blocker |
| Failover | Trial/paid entitlement and fenced local/cloud routes exist; historical cloud completions exist | Re-run a current offline-auto E2E before claiming it works now |
| Analytics | Aggregate, content-free landing funnel and health freshness exist | Add activation timing only after the basic journey works |
| Revenue | Stripe is configured and links respond, but external revenue is $0 | Optimize activation before adding billing complexity |

## Primary-source pattern map

| Pattern | Primary source | ThumbGate decision |
|---|---|---|
| Device authorization | [RFC 8628](https://www.rfc-editor.org/rfc/rfc8628) | Keep short-lived device/user codes and explicit approval |
| CLI/device login | [WorkOS CLI Auth](https://workos.com/blog/cli-auth) | Preserve the pairing URL through hosted login |
| Hosted identity | [WorkOS AuthKit](https://workos.com/docs/authkit/overview) | Keep credentials out of ThumbGate UI |
| Zero inbound ports | [Cloudflare Tunnel docs](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/) | Outbound connector is sufficient now; tunnel is optional later |
| Edge database limits | [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/) | Stay on D1 and measure before adding another database |
| Usage billing | [Stripe usage-based billing](https://docs.stripe.com/billing/subscriptions/usage-based/) | Defer meters until paid usage exists |
| Accessible input | [WCAG 2.2](https://www.w3.org/TR/WCAG22/) | Keep visible labels, focus states, and manual-code fallback |

## Ranked friction backlog

Scoring uses impact (0–5), confidence (0–5), effort (1–5), and an approximate priority score `(impact × confidence) / effort`.

| Change | Impact | Confidence | Effort | Score | Decision |
|---|---:|---:|---:|---:|---|
| Read existing local gateway key securely | 5 | 5 | 1 | 25.0 | Ship now |
| Open dashboard with pairing code prefilled | 5 | 5 | 1 | 25.0 | Ship now |
| Preserve pair URL through AuthKit | 5 | 5 | 1 | 25.0 | Ship now |
| One visible installer command | 4 | 5 | 1 | 20.0 | Ship now |
| Auto-open newest synced chat | 4 | 4 | 1 | 16.0 | Ship now |
| Signed notarized macOS helper | 5 | 4 | 4 | 5.0 | 7-day lane |
| Pair/activation telemetry | 4 | 4 | 3 | 5.3 | After happy-path E2E |
| Transcript E2EE migration | 5 | 3 | 5 | 3.0 | 30-day security lane |
| Usage-based Stripe meters | 2 | 2 | 4 | 1.0 | Defer until paid demand |

## Release acceptance contract

### Fresh user

- From the signed-in dashboard, the installer is discoverable without documentation hunting.
- Running the installer opens the exact ThumbGate approval screen with a valid code already filled.
- Logged-out users return to that same approval URL after hosted sign-in.
- Approval remains explicit; a malicious local process cannot silently attach a device.
- The local Hermes gateway key is loaded from local state and never appears in connector config, plist, process arguments, browser requests, or logs.
- The newest real Hermes thread and at least one message render within three minutes on the test machine.

### Local/cloud route

- Online Mac + any eligible account routes locally.
- Offline Mac + `manual` pauses for approval.
- Offline Mac + `auto` + active trial/paid entitlement completes on the fenced cloud runner.
- Offline Mac + `auto` + expired/suspended entitlement returns 402 and does not consume cloud compute.
- Returning Mac cannot overwrite a newer cloud result because lease generation is fenced.

### Reliability and privacy

- No inbound port is opened.
- Device requests are signed; nonce replay is rejected.
- Session snapshots remain bounded by count and characters.
- Health and watchdog prove routing, schema, auth chain, anonymous session gate, analytics durability, webhook signature rejection, runner health, and freshness timestamps.
- No “E2EE,” “fully private,” or “making money” claim is allowed without separate proof.

## 24-hour / 7-day / 30-day plan

### First 24 hours

- Ship secure local credential discovery, prefilled pairing, AuthKit return preservation, one-line installer UI, and first-thread auto-open.
- Install the connector as an always-on LaunchAgent and perform a real session sync.
- Prove current offline-auto cloud completion on an eligible account and 402 on an ineligible fixture.
- Capture TTFCR manually from installer start to first message render.

### Days 2–7

- Add a signed/notarized macOS helper that wraps the same protocol and auto-update channel; retain the shell installer as a transparent fallback.
- Add content-free events for installer copied, pairing URL opened, device approved, first sync, and first chat rendered, including durations but no transcript or identity content.
- Add browser E2E covering logged-out return-to pairing and signed-in approval.
- Add connector self-update with a signed artifact digest and rollback.

### Days 8–30

- Design a versioned encrypted-transcript migration; do not retrofit cryptography in place without recovery and multi-device key tests.
- Add Windows/Linux helpers based on measured demand.
- Evaluate Cloudflare Tunnel only for interactive streaming use cases that the outbound polling connector cannot satisfy.
- Introduce Stripe usage meters only after real paid failover events justify variable pricing.
- Run activation experiments only after the baseline funnel has enough samples; do not optimize against two internal accounts.

## Go/no-go

Go for the incremental friction repair now. No-go for a platform rewrite, mandatory customer tunnel, custom auth, Durable Objects migration, usage metering, or E2EE marketing in the immediate release. The current bottleneck is a broken handoff between already-working components, not missing infrastructure.
