# Hermes Web Dashboard

Desktop-first, authenticated access to the same durable Hermes threads used by phone clients.

## Security boundary

- The browser receives only a random `HttpOnly`, `SameSite=Strict` dashboard session cookie and a CSRF token.
- The relay bearer token remains server-side in the dashboard BFF.
- Mutations require same-origin requests plus the per-session CSRF token.
- CSP, frame denial, MIME sniffing denial, referrer denial, and account-scoped relay authorization are enforced.

## Run locally

Set `HERMES_RELAY_URL`, `HERMES_RELAY_TOKEN`, `HERMES_ACCOUNT_ID`, and `HERMES_DASHBOARD_ACCESS_CODE`, then run `npm start`. Production must terminate TLS in front of the dashboard so its `Secure` session cookie is usable.

## Verification

```sh
npm run test:coverage
npm run test:e2e
```

The browser E2E covers denied login, authenticated thread discovery, search, phone-to-web live sync, web-to-phone continuation, reload persistence, deletion, cookie protection, and relay-token non-disclosure.

This package is not evidence of a public deployment or mobile-store release. Those require separate runtime and release proof.
