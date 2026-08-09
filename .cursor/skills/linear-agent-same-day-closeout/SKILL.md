---
name: linear-agent-same-day-closeout
description: >
  Same-day issue closeout that enforces the Linear hygiene mandate: a closed issue
  MUST be stripped of every agent-lock-family label, moved to Done, and carry duration
  metrics + a prevention note. Replaces the ad-hoc closeout that produced AGENT-334 and
  AGENT-336 on 2026-08-09.
version: 1.0.0
---

# Linear Agent Same-Day Closeout

## Mandate
Every Linear issue closed by a codex/Hermes/grok agent MUST be cleaned up on the SAME
DAY: lock labels stripped, vault note written, Done state confirmed, duration recorded.

## Steps
1. `--done ID --agent <you> --comment <sha|evidence-link>`
   - Moves issue to `Done`, comments with evidence/reference SHA.
2. Strip agent-lock family (handled by the bridge release/closeout handler):
   `agent-lock`, `agent:lock`, `agent:<name>`, `status:agent-working`, `lock:claimed`.
   Resolution: `issue(id: $uuid) { labels { nodes { id name } } }` — UUID-scoped, id must
   match `/^[0-9a-f-]{36}$/i`.
3. Write `Handoffs/linear-claims/YYYY-MM-DD_ID_AGENT.md`:
   - frontmatter: linear_id, linear_uuid, linear_url, status=Done, agent, action, updated_at
   - duration_m: minutes spent (tracked via agent session start/stop log)
   - prevention_note: the rule that prevents recurrence of this exact issue type
4. Validate (single assertion):
   - `state.name == Done`
   - lock-family label count == 0
   - vault closeout note exists + same-day
   - exit code 0

## Verification harness (post-closeout)
```
node tools/linear-agent-bridge.js --coord-status --json
# expect: ghostCount == 0, locked agent-locks only for ACTIVE other-agent issues
```

Installed: 2026-08-09T17:05:00Z
