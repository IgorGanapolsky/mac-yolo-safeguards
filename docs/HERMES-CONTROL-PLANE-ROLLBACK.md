# Hermes control plane — rollback & canary (July 2026)

**Status:** implemented tooling for the progressive-delivery gap (operator-grade rollback + canary).  
**Worker:** `hermes-control-plane`  
**Health:** `https://thumbgate.app/api/health`

## Why this exists

Task **lease recovery** (90s fence, renew, reclassify) is automated.  
**Deploy rollback** was manual history only. This runbook + CLI make rollback/canary a one-command, health-probed operation.

## Commands

```bash
# Read-only
node tools/hermes-control-plane-rollback.js status
node tools/hermes-control-plane-rollback.js list
node tools/hermes-control-plane-rollback.js prev          # dry plan → previous version

# Mutating (requires --execute -y)
node tools/hermes-control-plane-rollback.js prev --execute -y -m "bad deploy 2026-07-26"
node tools/hermes-control-plane-rollback.js to <version-id> --execute -y -m "reason"

# Canary (traffic split) then promote
node tools/hermes-control-plane-rollback.js canary <version-id> --pct 10 --execute -y
node tools/hermes-control-plane-rollback.js promote <version-id> --execute -y
```

Package scripts (from `apps/hermes-control-plane`):

```bash
npm run rollback:status
npm run rollback:list
npm run rollback:prev          # dry
npm run rollback:prev:go       # execute previous (still needs intentional use)
```

## Safety

| Guard | Behavior |
|-------|----------|
| Default dry-run | `prev` / `to` / `canary` / `promote` without `--execute` only print a plan |
| `-y` required | No production mutation without explicit yes |
| Health probe | Post-mutate `GET /api/health` must report `ok: true` or exit non-zero |
| D1 | Rollback **does not** reverse migrations — only Worker code/assets |

## Relation to task failover

| Layer | Mechanism |
|-------|-----------|
| Task mid-flight | `task-leases.ts` — reclassify, 90s lease, generation fence |
| Bad dashboard ship | This CLI — `wrangler rollback` / `versions deploy` |

## Tests

```bash
node --test tests/test-hermes-control-plane-rollback.js
```

Live read-only (`status`, `list`, `prev` dry) hits Cloudflare APIs (needs wrangler auth).

## Not yet

- Automatic rollback on SLO breach (no metrics trigger wired)
- D1 schema down-migrations
- Customer connector binary rollback
