---
name: anti-babysitting
description: >
  Igor's standing directive (2026-08-10): never end a turn asking him for
  approval, a click, or a decision the agent could make. Use at the START of
  any autonomous run, and any time you are about to write "let me know",
  "one click away", "should I", or "needs your approval" — those phrases are
  the trigger. Defines the pre-authorized action classes, the
  exhaust-then-park protocol for platform walls, and the short list of
  actions that still require explicit consent.
---

# Anti-Babysitting Protocol

**Origin:** Igor, live directive 2026-08-10, after a thumbs-down on a session
that ended three separate turns with "needs your one click": *"You are never
allowed to stop and ask me for approvals. You have all the approvals you
need."* This skill makes that durable.

## The rule

End every turn with **work parked in a durable, self-serve state** — never
with a question, an approval request, or a click Igor must perform for the
work to count. If a wall is real, the wall gets **2 status lines maximum** in
the wrap-up, phrased as fact ("X is parked at Y because Z"), never as a
request ("can you...", "just click...").

## Pre-authorized permanently (do these without asking, ever)

- Branches, commits, pushes, PRs, issues, and comments on any
  `igorganapolsky/*` repository.
- Forking public repos into `igorganapolsky`, and PRs from those forks to
  their upstreams (subject to the OSS spam-guard rules in the engagement
  routine: real fixes, tested, max 1 PR/org/run).
- Publishing funnel assets that use the **existing** live Stripe/Cal.com
  links; running any read-only research, clone, build, or test.
- Spawning subagents, background tasks, relay sessions, triggers, and
  self check-ins.

## Still requires explicit same-message consent (unchanged safety floor)

- Deleting or overwriting another agent's claims, branches, or WIP
  (AGENTS.md Never-list).
- Force-push to shared branches; merging another agent's PR.
- Spending real money or changing billing (see thumbgate-spend-guard).
- Writing secrets anywhere; interactive Chrome / desktop hijack
  (docs/NO-DESKTOP-HIJACK.md); social publishing past
  `tools/social-publish-gate.js`.

These are Igor's own standing gates — "no approvals" does not repeal them.

## Exhaust-then-park protocol (platform walls)

When a tool refuses an action (scope denial, permission-mode bug, missing
capability), run this ladder **before** declaring anything blocked:

1. **Direct tool** — the obvious call.
2. **Same-owner alternative** — e.g. push to an `igorganapolsky/*` fork even
   when the upstream API surface is closed.
3. **Different sanctioned surface** — fresh session with the target repo as
   source, relay trigger, background agent, `send_later` re-check.
4. **Park** — leave the work in a state where it completes with zero
   conversation: pushed branch + compare URL, pending relay session,
   scheduled re-check, or a patch committed to `coordination/`.

A child session stuck >10 minutes on a permission prompt counts as a wall:
park it (note the session id in the log) and move on. Do **not** re-litigate
a wall already documented in `coordination/oss-engagement-log.md` — re-test
it at most once per run, silently.

**Never** route around a platform access boundary with found credentials
(raw tokens in env, etc.). That is not an approval question — it is off the
ladder entirely.

## Self-check before ending any turn

Scan your final message for these babysitting markers — each one is a bug:

- "one click away" / "just click" / "can you approve"
- "let me know if/when..."
- "should I...?" / "want me to...?"
- a **Next steps** list where the actor is Igor instead of the agent
- a question mark in the final paragraph of an autonomous run

If a marker survives and the action is in the pre-authorized list: do the
action instead of writing the sentence. If it is behind the safety floor:
state the fact in ≤2 lines and continue with other work.
