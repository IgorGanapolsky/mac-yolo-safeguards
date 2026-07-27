# Hermes Control Plane: direct Cloudflare migration

Status: public `workers.dev` preview exists; branded production cutover is not
yet claimed.

Public brand: **Leash by ThumbGate**

Production hostname: **`leash.dev`**

## Why this target

The control plane already executes as a Cloudflare Worker and stores state in
D1. The direct target removes the borrowed Sites hostname and gives the business
an owner-controlled deployment, custom domain, environment, logs, and rollback
policy. It is a Workers deployment, not a static Pages deployment: the API
routes, signed pairing, WorkOS callback, Stripe webhook, and lease coordinator
all need server execution and D1.

## Reversible deployment sequence

1. Keep the existing Sites deployment owner-only. It is the rollback surface,
   not a public business URL.
2. Create an owner-controlled Cloudflare zone for `leash.dev`. Reuse the
   existing Worker and D1 database, both named `hermes-control-plane`; do not
   provision duplicate resources.
3. Build with `HERMES_DEPLOY_TARGET=cloudflare` and the existing D1 database
   UUID. Apply
   every SQL migration under `apps/hermes-control-plane/drizzle/` to that D1
   database before routing production traffic.
4. Update the existing `hermes-control-plane` Worker at its `workers.dev`
   hostname. Verify landing page,
   WorkOS callback, signed device pairing, thread sync, Stripe Checkout/webhook,
   and one fenced local-to-cloud continuation.
5. Attach `leash.dev` as a Worker custom domain. Only then change the
   WorkOS redirect URI to `https://leash.dev/api/auth/callback` and the Stripe
   webhook endpoint to the corresponding `leash.dev` API route.
6. Retain the owner-only Sites deployment until the custom-domain checks pass;
   then it may remain private as an emergency rollback artifact.

The `cloudflare:validate-production` script deliberately refuses a placeholder
D1 UUID or any hostname other than `leash.dev`.

`npm run deploy:cloudflare` is the single production path: it validates the
target, builds the Worker, applies pending D1 migrations remotely, and only then
deploys the Worker. It cannot pass its first gate without the owned hostname and
a real D1 UUID in the process environment.

## Credential boundary

No production secret belongs in Git, `.env.example`, build logs, a migration
document, or PR text. The Worker requires these secret names:

- `WORKOS_API_KEY`
- `HERMES_CLOUD_RUNNER_TOKEN`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

`WORKOS_CLIENT_ID`, `WORKOS_REDIRECT_URI`, and `STRIPE_PRICE_ID` are configuration
values but should still be managed in the Cloudflare environment, not committed
as deployment-specific values.

Credentials previously exposed in a chat or screenshot are compromised even if
they were later copied into Keychain. They must be rotated at their providers;
the exposed values are not valid migration inputs.

The current Fly runner token is intentionally not retrieved. At cutover, create
a new random token, write it independently to the Worker secret store and the
Fly runner secret store, verify a signed claim/complete cycle, then retire the
old token. This avoids moving reusable plaintext between systems.

## Go-live proof gate

The service is not revenue-ready until evidence exists for all of the following:

- Cloudflare account ownership and authenticated direct deployment
- migrated production D1 database
- `leash.dev` TLS and custom-domain routing
- rotated WorkOS and Stripe credentials
- Google and Apple sign-in callback success
- paid Checkout plus a verified signed webhook event
- local connector pairing and session/thread visibility
- one real fenced failover completed by the cloud runner with the local machine
  unavailable
- mobile control path verified against the same account and thread state

Until those checks exist, the truthful status is **public preview plus tested
deployment artifact**, not a live subscription business.
