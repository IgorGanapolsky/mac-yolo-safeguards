# hermes-yolo agentic sprawl control

Implements [YugabyteDB AMP (Agentic Multitenant Postgres)](https://thenewstack.io/yugabytedb-agentic-postgres-scaling/)
patterns for **coding-agent fleets** — not databases.

> “The dimension of scale is shifting. It’s not just large databases;
> it’s also a **proliferation** of databases.”

For hermes-yolo: not one huge agent — **many concurrent / idle / abandoned runs**.

## Steal map

| Yugabyte AMP | hermes-yolo |
|--------------|-------------|
| **Architect** | Provision/route: model, toolsets, worktree, fail-closed capability |
| **Voyager** | Migrate/modernize: ports, refactors, schema/SDK moves |
| **Perf Advisor** | Diagnose thrash, timeouts, jetsam, identical retries |
| **Nexus** | Connect ecosystem: MCP, gateway, keychain, browser (**guarded**) |
| **Decision traces** | person said / context said / inferred / did |
| **Guarded freedom** | dry-run, ask-before by risk category, hard never-spend block |
| **Scale-to-zero** | Fleet registry + idle/dead/suspended reap |

## CLI

```bash
# Fleet assessment (proliferation view)
hermes-yolo --sprawl-status
node tools/hermes-yolo-sprawl-control.js --status --json

# Plan roles + autonomy without spawning
hermes-yolo --dry-run "migrate payments schema"
node tools/hermes-yolo-sprawl-control.js --plan --task "fix thrash freeze" --json

# Scale-to-zero dry-run (default safe)
hermes-yolo --sprawl-reap
# Actually remove dead/suspended from registry (and optionally kill idle):
hermes-yolo --sprawl-reap --execute --kill-idle
```

## Env

| Variable | Meaning |
|----------|---------|
| `HERMES_YOLO_SPRAWL=0` | Disable sprawl plan/register |
| `HERMES_YOLO_DRY_RUN=1` | Plan only; no agent spawn |
| `HERMES_YOLO_ASK_BEFORE=1` | Hard-stop on elevated risk categories |
| `HERMES_YOLO_ROLE=architect\|voyager\|perf_advisor\|nexus` | Force primary role |
| `HERMES_YOLO_FLEET_DIR` | Registry root (default `~/.hermes/fleet/hermes-yolo`) |
| `HERMES_YOLO_IDLE_MS` | Idle heartbeat threshold (default 30m) |
| `HERMES_YOLO_SPRAWL_WARN` | Concurrent live+idle warn threshold (default 4) |

## Receipts

- Route receipt `policy.sprawl` + `policy.decisionTrace`
- `~/.hermes/fleet/hermes-yolo/decision-trace-latest.json`
- `~/.hermes/fleet/hermes-yolo/registry.json`

## Decision trace shape

```json
{
  "personSaid": { "taskDigest": "…", "taskPreview": "…" },
  "contextSaid": { "orgHints": ["…"], "env": { "backend": "…", "model": "…" } },
  "inferred": { "primaryRole": "voyager", "autonomyMode": "execute", "riskCategories": [] },
  "did": { "status": "ready", "actions": ["…"] }
}
```

Matches Yugabyte/Meko: *“This is what the person said. This is what your context said.
This is what I inferred. This is what I ended up doing.”*

## Tests

```bash
node tests/test-hermes-yolo-sprawl-control.js
node tests/test-hermes-yolo.js
```
