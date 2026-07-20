# Hermes Control

Public subscription dashboard and control API for paired Hermes machines.

## Runtime

- vinext on OpenAI Sites
- Cloudflare D1 via the Sites `DB` binding
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
```

Production environment variable names are documented in `.env.example`; values belong in Sites, never in tracked files.
