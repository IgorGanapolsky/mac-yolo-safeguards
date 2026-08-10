---
name: linear-agent-lock-lifecycle
description: >
  Autonomous claim/release lifecycle for Linear issues across multi-agent vaults.
  Codifies the exact protocol that broke the board (lock-label stripping by UUID,
  not name), enforces same-day cleanup, and prevents stale agent-lock ghost issues.
version: 1.0.0
---

# Linear Agent Lock Lifecycle

## Problem this prevents
`--release` previously commented + vault-noted but **never stripped** the agent-lock
label family (`agent-lock`, `agent:lock`, `agent:<name>`, `status:agent-working`,
`lock:claimed`). Worse, the old `findIssueByIdentifier` selected only
`labels { nodes { name } }` (no `id`), so `removedLabelIds` received `"undefined"`
strings and Linear's `updateIssue` mutation silently no-opped — issues stayed
visually agent-owned while `In Progress`, reading as an abandoned lock grid.

## Root cause (verified)
- Label ID resolution must come from `issue(id: $uuid) { labels { nodes { id name } } }`,
  NOT a name-only `findIssueByIdentifier` lookup. (Linear schema: `issue(id:)` expects
  `String!`; `team(key:)` is rejected — use root `issues(filter:{team:{key:{eq:$k}}}`)
  or `team(id: $id)`.)

## Protocol (autonomous, single command each phase)
1. `node tools/linear-agent-bridge.js --coord-status --json` — sync vault at session start.
2. `node tools/linear-agent-bridge.js --claim ID --agent <you> --files a,b` — In Progress + file-lock + vault note.
3. Work. Append-only `plan.md` for megafiles.
4. `--release ID --agent <you>` (abandon/restart) OR `--done ID --agent <you> --comment sha` (close).

## Release/Done requirements
- Strip EVERY label whose name matches `agent-lock`, `agent:lock`,
  `/^agent[-:]/` (e.g. `agent:codex`, `agent:grok`), or `/^status:agent-/`.
- Resolve each label `id` via the UUID-scoped `issue(id:)` query (regressions: id must
  match `/^[0-9a-f-]{36}$/i`, never `"undefined"`).
- Write a `Handoffs/linear-claims/YYYY-MM-DD_ID_AGENT.md` with: linear_id, linear_uuid,
  action, state, duration_m, prevention_note. Same-day.
- Do NOT touch locks claimed by another agent (grok/Hermes/etc.) unless handoff-gated.

## Same-day mandate
Stale agent-lock issues must be resolved + vault-closed on the SAME day.
`ghostCount` must read 0 from `--coord-status` for the owning agent's lane.

Installed: 2026-08-09T17:00:00Z
