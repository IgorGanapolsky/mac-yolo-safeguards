# Dashboard E2E (July 2026 research → ThumbGate control plane)

**run_id:** `trun_063533a97b5041f3ad84f6312e12e171`  
**Raw report:** `parallel-research/dashboard-e2e-july-2026.md`  
**Date:** 2026-07-26

## Verdict (applied)

Layered E2E for vinext/Workers dashboards (not `next start` + Postgres):

| Layer | Tool | ThumbGate implementation |
|-------|------|---------------------------|
| Contract / source | node assert on source + frictionless tests | `tests/frictionless-onboarding.test.mjs` |
| Worker + D1 API | `wrangler dev --local` + opaque `hermes_session` seed | `tests/cloudflare-worker-smoke.mjs`, `tests/dashboard-machine-routing-e2e.mjs` |
| Client bundle contract | Fetch served `DashboardClient-*.js` | same machine-routing E2E + `tests/prod-dashboard-copy-smoke.mjs` |
| Browser DOM | Playwright + cookie seed (no WorkOS OAuth in happy path) | optional `PLAYWRIGHT_E2E=1` path in machine-routing E2E |
| Post-deploy | Public health + asset strings (no desktop hijack) | `npm run test:e2e:prod-copy` |

## Auth seeding rule (research §4b)

Prefer **D1 session row + signed cookie** over driving real WorkOS for routing tests. ThumbGate already uses opaque `hermes_session` + `sessions.id_hash` — match production auth, do not invent JWT middleware that does not exist.

## Multi-device UI rule (research §5 + CEO 2026-07-26)

Assert **connector hostnames** (`linux-build-box`, `Igors-Mac-mini`), never product labels like generic **Mac**. UI copy: **Which machine?** / real name / **My computer** fallback.

## Commands

```bash
cd apps/hermes-control-plane
npm run test:e2e              # worker smoke + machine routing
npm run test:e2e:machine      # multi-device pin + bundle contract (+ Playwright if installed)
PLAYWRIGHT_E2E=1 npm run test:e2e:machine
npm run test:e2e:prod-copy    # live thumbgate.app asset contract
```

## Anti-patterns (research)

- Telling a human to hard-refresh as “verification”
- Relying only on static source greps for ship claims
- Full OAuth in every CI test when D1 seed is enough
