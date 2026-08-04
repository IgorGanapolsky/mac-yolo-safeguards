# Herdr parity: agent-facing task coordination verbs

> Ship `hermes task {list,status,wait,read,spawn,wait-output}` so a Hermes agent can orchestrate sibling tasks the way Herdr's `agent wait` / `pane read` / `pane run` control the mux — **but every verb routes through ThumbGate's safety moat** (per-tool-call phone leash + signed 90s lease + stale-receipt rejection). Not a raw shell pane.

Source of truth: `lib/task-leases.ts`, `apps/hermes-control-plane/app/dashboard/DashboardClient.tsx`, `FailoverPathDemo.tsx:257`, `globals.css:40` status enum. Filed as **issue #1349**.

## 1. Herdr verbs (verbatim, from `herdrdev/herdr` SKILL.md)

```
herdr workspace list | tab list | pane list | agent list
herdr pane split | pane run | pane read | pane move | agent start | agent wait
states: idle | working | blocked | done | unknown
ids: w1 | w1:t1 | w1:p1 , --current to target the caller pane
guard: test "${HERED_ENV:-}" = 1  (refuse if unset)
```

## 2. Mapping → real ThumbGate infra (what already exists)

| Herdr concept | ThumbGate (this repo) |
|---|---|
| `agent list` / `pane list` | dashboard thread list; `createTask` thread id |
| `agent wait` | `lib/task-leases.ts` `reclassifyStaleLocalTasks()` (auto→cloud, manual→needs_failover, blocked→offline_blocked) |
| `pane read` | `DashboardClient` thread snapshot (`conversation-history`) |
| `agent start` / `pane run` | `createTask(routePreference: "auto"\|"cloud"\|"local", selectedDeviceId, devices.length, org.cloudAccess)` |
| lifecycle states | `globals.css:40` status enum: `running / cloud_pending / failed / offline_blocked / needs_failover / completed` |
| `--current` target | `selectedThread` / `selectedDeviceId` in `DashboardClient` |
| `HERED_ENV=1` guard | the leash gate (`leash-control`) + `mac-freeze-rescue` skill guard |
| persistence past laptop-close | `FailoverPathDemo` phases `pending→running→offline_choice→(paused\|ask\|cloud)`; "Cloud continuity · fenced lease"; **stale Mac receipts rejected** (L257) |

```mermaid
flowchart LR
  A[Hermes agent calls\nhermes-task CLI] --> B{leash gate\nphone approve?}
  B -->|denied| X[Nope]
  B -->|approved| C[lib/task-leases.ts\nclaimTask route=local|cloud\nsigned 90s lease]
  C --> D[route=local → Mac pane]
  C --> E[route=cloud → fenced Fly VPS\nFailoverPathDemo L257: stale rejected]
  E -.->|Mac heartbeat lost| C
```

## 3. Proposed `hermes task` spec (minimal surface)

```
hermes task list                       # active tasks + route + lease gen + status
hermes task status   <id>              # -> idle|working|blocked|done
hermes task wait     <id>              # block until terminal (Herdr agent wait)
hermes task read     <id>              # thread snapshot messages (Herdr pane read)
hermes task spawn    "<prompt>" [--route continuity]
                                       # createTask, FENCED 90s lease + leash
hermes task wait-output <id>           # block until completed/failed
hermes task --current ...              # target caller's thread/device
```

**Status map** (Herdr → ThumbGate):
`idle`↔running; `working`↔running/cloud_pending; `blocked`↔needs_failover/offline_blocked; `done`↔completed; `unknown`↔failed. Route enum `local|cloud|blocked` (`task-leases.ts:25` `currentRoute`).

## 4. Safety non-negotiables (do NOT copy Herdr's raw `pane run`)
- `spawn` must call `createTask` with the leash gate (`org.cloudAccess` for cloud) — **no direct shell**.
- Cloud spawn asserts a **paired Mac** exists as the source thread (the `DashboardClient:737` gate). If unpaired → `needs_failover`/`offline_blocked`, not "My computer."
- `TASK_LEASE_MS = 90_000` (`task-leases.ts:17`); every lease is signed; the lease-generation check rejects stale Mac receipts (FramedPathDemo contract).
- `spawn --route continuity` requires `organization.cloudAccess === true` (Pro $10/mo, per `THUMBGATE_EXPERT_CARD.txt`) — otherwise fail with the #1344 dead-end branch ("Pair a Mac or upgrade").

## 5. Endpoints / wiring needed (blocked on ownership)
- `GET  /api/tasks?status=running` → list (reuse `reclassifyStaleLocalTasks` view).
- `GET  /api/tasks/<id>` → status + snapshot.
- `POST /api/tasks` body `{prompt, route:"local"|"cloud", deviceId?}` → `createTask(rfp, device, ...)` via `claimTask`.
- `GET  /api/tasks/<id>/stream` → wait/wait-output (SSE on `cloud_pending`/`running`).

These all live in `apps/hermes-control-plane/app/api/` + `lib/task-leases.ts` — **claimed by blocked `T-HERMES-PUBLIC-CONTROL-PLAN` (broad `apps/hermes-control-plane/**`). Do NOT implement until that claim clears.**

## 6. One safe borrow that needs no ownership gate
Herdr has no `test "${HERED_ENV:-}" = 1` equivalent as a *skill* guard. `mac-freeze-rescue/SKILL.md` (`~/.claude/skills/...`, canonical per AGENTS.md) can prepend: refuse the skill unless `HERED_SESSION=1` (a leashed Hermes session is established). Tiny, contained — flag if you want it.
