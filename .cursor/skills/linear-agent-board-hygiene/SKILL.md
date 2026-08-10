---
name: linear-agent-board-hygiene
description: >
  Periodic Linear board-hygiene daemon. Runs `--coord-status`, reports ghostCount and
  agentLockedCount, and scrubs stale agent-lock labels on issues that are abandoned
  (no vault activity for N hours). Never touches locks actively owned by another agent
  unless a handoff exists.
version: 1.0.0
---

# Linear Agent Board Hygiene

## When to run
- Session start (after `--coord-status`).
- Hourly via cron (autonomous, LOCAL-ONLY):
  `*/60 * * * * node tools/linear-agent-bridge.js --coord-status --json >> cron/linear-hygiene.log 2>&1`
- After any `--release` / `--done` run.

## Actions
1. `node tools/linear-agent-bridge.js --coord-status --json`
   - Parse: `ghostCount`, `agentLockedCount`, `agentLocked[]` details, `vaultAgents`.
2. Ghost scrub policy (stale lock release):
   - For each issue with an agent-lock-family label:
     - Look up vault `Handoffs/linear-claims/<ID>_*.<agent>.md` updated_at + the
       agent's `Agent-State/<agent>.md` last-write time.
     - If vault age > STALE_THRESHOLD (default 12h) AND no other agent has claimed it
       in the last 6h (per coord-status inProgress map) → it's a stale lock.
     - Action: `node tools/linear-agent-bridge.js --release ID --agent <idle-agent>`
       (strips lock labels + writes vault release note; state unchanged).
3. Ghost issue remediation:
   - `ghostCount != 0` only when a vault claim references a Linear issue that no longer
     exists / is archived. Action: delete the orphan vault handoff, file a new
     `AGENT-infra` regression ticket with the lost identifier, continue.
4. NEVER auto-release a lock whose owning agent appears in `agentLocked[]` as ACTIVE
   (i.e., that agent has a claimed file or an In-Progress Linear issue within 6h).

## Thresholds
- STALE_THRESHOLD = 12h (vault + file age before an abandoned lock may be auto-released).
- ACTIVE_WINDOW = 6h (owner considered active if claim/agent-state updated within).

## Evidence
- `--coord-status --json` snapshot written to `cron/linear-hygiene.log` each run.
- Each auto-release writes `Handoffs/linear-claims/YYYY-MM-DD_ID_<agent>.md` with
  `action: auto-release-stale`, `duration_m: 0`, prevention_note referencing this skill.

Installed: 2026-08-09T17:10:00Z
