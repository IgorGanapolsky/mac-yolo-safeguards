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
