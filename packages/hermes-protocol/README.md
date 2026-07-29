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

## Buzz workflow approvals

The package includes an experimental, fail-closed adapter for Buzz workflow
approval events:

- verify kind `46010` requests with real NIP-01/BIP-340 signatures;
- require one token-hash `d` tag, one designated-approver `p` tag, and one
  NIP-40 `expiration` tag;
- cap the signed request lifetime at 15 minutes by default, before consuming
  replay-guard capacity;
- expose a Hermes-compatible `source: "relay_hook"` request without permitting
  permanent approval;
- sign kind `46030` grants or `46031` denials with
  `d = SHA-256(raw approval token)`, matching Buzz's SDK and relay;
- bind every decision to the request event (`e`) and requester (`p`);
- require caller-owned replay and decision guards, then reject tampering,
  expiry, replay, wrong signers, and duplicate local decisions.

The adapter never accepts a raw approval token when building a response and
never logs or returns a secret key. Buzz has not yet emitted kind `46010` from
its workflow engine, so this is a conformance POC rather than a claim of live
end-to-end interoperability. The upstream contract and current desktop/relay
tag mismatch are tracked in
[block/buzz#3523](https://github.com/block/buzz/issues/3523).

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
