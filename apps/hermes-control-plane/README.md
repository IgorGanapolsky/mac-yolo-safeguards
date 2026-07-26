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

## Deploy / Rollback (read this before touching production)

```bash
npm run deploy:cloudflare     # backs up D1, applies migrations, deploys to 100% of traffic
npm run rollback:cloudflare   # ⬅ THE command if something just broke prod
```

- **`deploy:cloudflare`** validates the production env, builds, then runs
  `predeploy:cloudflare` first (npm auto-runs any `pre<script>` before the
  named script) which exports a full D1 backup to
  `.wrangler/backups/pre-deploy-<UTC timestamp>.sql` via
  `wrangler d1 export DB --remote`, before `wrangler d1 migrations apply`
  touches the schema. D1 migrations in this app are drizzle-kit-generated,
  forward-only, and irreversible — the export is the only undo path for a
  bad migration. Copy the backup file off `.wrangler/backups/` (it is
  gitignored, local-machine-only) before relying on it.
- **`rollback:cloudflare`** runs `wrangler rollback --config
  dist/server/wrangler.json`. It reverts the **Worker code/bindings** to a
  previous version (Cloudflare keeps the last 100) — it does **not** touch
  D1 data. Run it with no arguments to get an interactive picker of recent
  versions; pass a version ID (`wrangler rollback <version-id> --config
  dist/server/wrangler.json`) to skip the picker. If dist/server/wrangler.json
  is missing (fresh checkout), run `npm run build:cloudflare` first — it
  regenerates the config with no production side effects.
- For a **gradual** rollout instead of instant 100%, use `wrangler versions
  deploy --config dist/server/wrangler.json <version-id>@<percentage>`
  directly (not currently wired to an npm script — `deploy:cloudflare`
  ships straight to 100%).
- A bad **deploy** (bug in the Worker code) → `npm run rollback:cloudflare`.
  A bad **migration** (D1 schema/data) → restore from the
  `.wrangler/backups/` export taken by `predeploy:cloudflare`; `wrangler
  rollback` alone will not undo it.
