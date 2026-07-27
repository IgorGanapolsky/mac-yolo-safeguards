# Hermes shared thread protocol

This package is the correctness boundary for phone/web continuity. It is dependency-free and does
not publish an app, create an EAS build, or expose a Mac/Tailscale credential to a browser.

## Guarantees

- The relay assigns a monotonic `seq` per account/thread.
- A client-generated `mutation_id` makes retry-after-timeout idempotent.
- Reusing a `mutation_id` with different content is rejected.
- Projection is deterministic under reordered delivery and duplicate events.
- Thread deletion is an event tombstone and survives relay export/import.
- Bearer authentication scopes every HTTP read/write to one account.
- Structured grants identify a `human`, `service`, `pipeline`, or `agent`, enforce least-privilege
  `threads:read`, `threads:write`, and `threads:delete` scopes, and may expire.
- Authorization decisions are bounded, secret-free receipts that can be exported to telemetry without
  leaking bearer tokens. A failing telemetry callback cannot change an authorization outcome.

Legacy `Map<bearerToken, accountId>` configuration remains supported and receives all three scopes.
New integrations should use a structured grant:

```js
const tokens = new Map([
  [process.env.HERMES_RELAY_TOKEN, {
    account_id: "acct_1",
    actor_type: "agent",
    actor_id: "research_agent",
    scopes: ["threads:read", "threads:write"],
    expires_at: "2026-08-01T00:00:00.000Z",
  }],
]);

const relay = createRelayHttpServer({ tokens });
relay.getAuthorizationDecisions(); // sanitized copies; never includes the bearer token
```

## Verification

```sh
npm ci
npm run ci
```

`npm run ci` enforces 95% line/function and 90% branch coverage, then reruns the real HTTP
two-client E2E suite separately. The randomized contract test exercises 10,000 mutations with
duplicates and reordered delivery.

This is protocol-level E2E proof. Browser UI and physical-phone E2E become valid only after those
clients are wired to this package; this package intentionally does not pretend that wiring exists.
