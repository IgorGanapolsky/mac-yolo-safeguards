# Anti-Babysitting — full guideline

Canonical skill: [`.agents/skills/anti-babysitting/SKILL.md`](../../.agents/skills/anti-babysitting/SKILL.md).
This doc carries the background and worked examples; the skill carries the rules.
AGENTS.md pointer is pending (AGENTS.md is currently claimed by `cursor-no-desktop-hijack`);
whichever agent next releases that claim should add one line under "Always agent mode":
`Anti-babysitting protocol: .agents/skills/anti-babysitting/SKILL.md — never end a turn asking Igor for approval.`

## Why this exists

2026-08-10: a session ended three separate turns telling Igor a finished piece of work
was "one click away" (a lancedb PR compare link, a pending relay-session approval, a
draft-PR promotion). Igor's response, verbatim: *"you are never allowed to stop and ask
me for approvals"* + a thumbs-down. The work was real and verified — the delivery
pattern was the failure. Each "one click" outsourced the last 1% to the CEO, which is
babysitting regardless of how good the other 99% was.

## The three failure shapes (from real sessions)

1. **The parked-but-nagging deliverable.** Work is pushed and correct, but the wrap-up
   frames completion as Igor's job ("open it here!"). Fix: park silently in the log;
   the wrap-up states *what exists and where*, not what Igor should do about it.
2. **The approval-shaped status report.** "The relay session needs your approval to
   proceed" is a request wearing a status costume. Fix: state it once, factually, in
   ≤2 lines, then keep working on something else. If the same wall exists next run,
   it gets re-tested silently, not re-reported.
3. **The permission-prompt relay stall.** A spawned session blocks forever on a tool
   permission no one will ever see. Fix: >10 min stalled = wall; park (log the session
   id), do not build more machinery whose only output is another approval prompt.

## Worked example: cross-owner GitHub wall (the recurring one)

This session type cannot write to repos outside `igorganapolsky/*` (MCP scope), cannot
attach cross-owner repos (`add_repo` cross-tier refusal), and cannot spawn scoped
sessions (permission-mode never recorded in trigger-fired routine sessions). The
correct handling, per the ladder:

- Do the entire fix locally (clone via anonymous git read — always works).
- Push the branch to an `igorganapolsky/*` fork when one exists (sanctioned,
  same-owner). Fork creation for a new upstream is itself scope-blocked — then the
  patch gets committed under `coordination/patches/` with apply instructions in the
  engagement log instead.
- Park the compare URL / patch path in `coordination/oss-engagement-log.md`.
- The wrap-up mentions it in one line. No link-with-instructions paragraph, no
  bolded call to action, no notification whose text is an ask.
- The durable fix (routine sessions starting with the target repo as source) is
  recorded once in the log's "Action needed" section — which Igor reads on his own
  schedule. It does not recur in chat.

## What "no approvals" does NOT repeal

The safety floor is Igor's own standing rule-set, and it stands unchanged:
AGENTS.md Never-list (other agents' claims/WIP), spend guard (real money), secrets,
desktop hijack, social publish gates. "You have all the approvals you need" grants
autonomy over *Igor's own* repos, forks, funnels, and OSS engagement — it is not a
license to bypass platform access boundaries with found credentials, and it is not
consent to destructive/irreversible actions those gates exist to stop.
