# Hermes Mobile cloud relay

Minimal Fly.io rendezvous server for **Leash approvals only** (not full chat proxy).

Canonical URL: `https://hermesmobile-cloud.fly.dev`

Fly app name: `hermesmobile-cloud` (no hyphen — matches `fly apps list`).

## Mobile API (implemented in `hermes-mobile/src/services/mobileRelayClient.ts`)

| Method | Path | Auth | Body | Response |
|--------|------|------|------|----------|
| GET | `/v1/health` | — | — | `{ ok, version }` |
| POST | `/v1/pair/complete` | — | `{ code }` | `{ mobile_token }` |
| GET | `/v1/queue` | `Mobile <token>` | — | `{ events, workers, active_worker_id, ... }` |
| POST | `/v1/verdicts/:eventId` | `Mobile <token>` | `{ decision: allow\|block, reason? }` | `{ ok }` |
| POST | `/v1/test-intercept` | `Mobile <token>` | — | `{ ok, id? }` |
| POST | `/v1/entitlements/thumbgate-leash/verify` | `Mobile <token>` | `{ platform, product_id, purchase_token? transaction_id?, signed_transaction? }` | `{ ok, entitlement }` |

## Mac worker API

| Method | Path | Auth | Body | Response |
|--------|------|------|------|----------|
| POST | `/v1/worker/register` | `Worker <token>` optional | `{ hostname, project, machine_id?, label? }` | `{ worker_id, worker_token, machine_id }` |
| POST | `/v1/worker/heartbeat` | `Worker <token>` | `{ hostname?, project?, status?, gateway_ok? }` | `{ ok, worker_id }` |
| POST | `/v1/pair/start` | `Worker <token>` | — | `{ code, expires_at }` |
| POST | `/v1/events` | `Worker <token>` | `{ id?, event, reason?, source? }` | `{ id, enqueued_at }` |
| GET | `/v1/worker/verdicts` | `Worker <token>` | — | `{ verdicts: [{ event_id, decision, reason }] }` |

## Local dev

```bash
cd services/hermes-relay
npm test
PORT=8787 node server.js
curl -s http://127.0.0.1:8787/v1/health
```

## ThumbGate Leash entitlement verification

The relay owns the server-side entitlement record for `thumbgate_leash_monthly`.
Mobile clients may submit a Play/App Store receipt to:

```http
POST /v1/entitlements/thumbgate-leash/verify
Authorization: Mobile <token>
Content-Type: application/json

{
  "platform": "android",
  "product_id": "thumbgate_leash_monthly",
  "purchase_token": "<google-play-purchase-token>"
}
```

The endpoint is intentionally fail-closed. Without a configured store verifier it
returns `503 { "error": "store_verifier_not_configured" }` and does not grant
Pro. Once Play/App Store credentials are available, wire the verifier function to
Google Play Developer API / App Store Server API and return `{ ok: true,
expires_at }` only for active subscriptions. `/v1/queue` then reports `tier:
"pro"` and an active `entitlement.thumbgate_leash`.

## Deploy (Fly.io)

```bash
cd services/hermes-relay
fly volumes create hermes_mobile_data --region iad --size 1 -a hermesmobile-cloud   # once
fly deploy -a hermesmobile-cloud
curl -s https://hermesmobile-cloud.fly.dev/v1/health
```

## Mac worker

```bash
node tools/hermes-relay-worker.js
node tools/hermes-relay-worker.js --pair   # print/show pairing code
```

LaunchAgent: `com.igor.hermes-relay-worker` (installed via `scripts/install-agent-launchagents.sh`).

Credentials persist in `~/.hermes/relay-worker.env`.

## Scope

- Phase 1 (this service): rendezvous + approval queue + worker registration
- **Not** included: chat streaming proxy, gateway HTTP tunneling
