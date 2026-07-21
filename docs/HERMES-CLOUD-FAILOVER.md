# Hermes public control plane and cloud failover

## Deployment topology

- **Public dashboard and control API:** OpenAI Sites at `https://hermes-agent-control.iganapolsky.chatgpt.site`. The Sites project ID is stored in `apps/hermes-control-plane/.openai/hosting.json`.
- **Identity:** WorkOS AuthKit hosted sign-in with Google and Apple enabled in the WorkOS project. Provider credentials stay in WorkOS; the app receives an authorization code and creates an opaque, HttpOnly D1-backed session.
- **State:** a Sites-managed Cloudflare D1 database stores tenants, memberships, paired devices, threads, task routing state, leases, subscription state, and audit events.
- **Primary executor:** `tools/hermes-cloud-connector.js` dials out from the user's Hermes machine. No inbound port, Tailscale dependency, or gateway API key is uploaded.
- **Failover executor:** `services/hermes-cloud-runner` runs on Fly.io and calls an OpenAI-compatible provider only after it wins a cloud lease.

## Pairing and device authentication

The connector generates a P-256 keypair and writes it to `~/.hermes/cloud-connector.json` with mode `0600`. It sends only the public JWK, device label, and a single-use pairing request. The signed-in user approves the displayed eight-character code and key fingerprint. Every later request signs:

`METHOD + pathname + timestamp + nonce + SHA-256(body)`

The control plane rejects expired timestamps, reused nonces, revoked devices, and invalid signatures. There is no copy-pasted long-lived device API token.

## Offline routing state machine

1. A heartbeat seen within 60 seconds routes new tasks to the local Hermes connector.
2. If the device is offline, `disabled` pauses, `manual` waits for dashboard approval, and `auto` queues the task for cloud execution.
3. A worker claims a 90-second lease with an incrementing generation and an opaque fencing token.
4. While execution is active, the local connector or cloud runner renews that same lease every 30 seconds. Renewal succeeds only while the current owner, token, generation, and original lease remain valid; an expired lease cannot be revived.
5. Completion succeeds only for the current owner and token while the lease is still unexpired. Completion clears all lease authority. A stale local or cloud worker therefore cannot overwrite a newer run or complete after its deadline.
6. When a local heartbeat returns, unclaimed cloud tasks are moved back to local. A cloud task already running retains its renewable lease; this prevents duplicate execution.

The connector also reads the authenticated Hermes session API on `127.0.0.1:8642`, the
same contract used by Hermes Mobile. It syncs metadata for recent sessions and bounded
recent-message snapshots for continuity. Existing-session work is sent back through
`/api/sessions/:id/chat`. A web-created thread is assigned a deterministic source-session
ID by the control plane; the connector creates that session in Hermes when necessary,
pins the active `terminal.cwd` from the local Hermes configuration, and then uses the same
session-chat endpoint for every turn. There is no bare model-completion fallback. Gateway
credentials, the configured workspace path, and device private keys stay local.

This is continuity of a queued Hermes prompt and thread, not transparent migration of live process memory. Tool access available only on the Mac cannot be reproduced by the cloud runner unless an equivalent cloud integration is separately configured.

## Required production configuration

Sites server environment:

- `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, `WORKOS_REDIRECT_URI`
- `HERMES_CLOUD_RUNNER_TOKEN`
- `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`

Fly.io secrets:

- `HERMES_CONTROL_PLANE_URL`, `HERMES_CLOUD_RUNNER_TOKEN`
- `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`

The Stripe webhook endpoint is `/api/billing/webhook`; it promotes a workspace to `pro` for an active subscription and suspends new task creation after deletion. WorkOS must list the deployed `/api/auth/callback` URL and have Google and Apple social connections enabled.

## Operational verification

- Control plane: `npm test` in `apps/hermes-control-plane`
- Connector signature/config: `node --test tests/test-hermes-cloud-connector.js`
- Cloud runner: `npm test` in `services/hermes-cloud-runner`
- Fly health: `GET /health` reports the latest poll and task timestamps without secrets
- Anonymous security boundary: `/dashboard` redirects to hosted sign-in before its private client shell renders; workspace APIs return `401`
- ARD capability catalog: `GET /.well-known/ai-catalog.json` validates as ARD 1.0 and contains only public documentation/discovery URLs
