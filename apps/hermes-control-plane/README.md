# Leash by ThumbGate

Public subscription dashboard and control API for paired Hermes machines.

## Runtime

- vinext on Cloudflare Workers, with the current OpenAI Sites deployment kept
  owner-only as a rollback until the custom-domain cutover is verified
- Cloudflare D1 through the `DB` binding
- WorkOS AuthKit authorization-code sign-in
- Stripe Checkout subscriptions and signed webhooks
- P-256 signed device pairing and request authentication
- fenced local and Fly.io cloud task leases

## Development

Node.js 22.13 or newer is required.

```bash
npm install
npm run db:generate
npm run lint
npm test
npm run test:cloudflare-config
npm run build:cloudflare
```

The default build preserves the Sites package. `build:cloudflare` creates the
direct Workers artifact without Sites metadata. Production environment variable
names are documented in `.env.example`; values belong in the hosting provider's
secret store, never in tracked files.
