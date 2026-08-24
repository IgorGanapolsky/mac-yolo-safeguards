# REVIEW.md

Review instructions stolen from the Anthropic AI-native SDLC playbook.
Findings inform humans. They do not approve or merge a PR.
Branch protection still requires a human. We stay on GitHub Actions.

`AGENTS.md` is this repo's `CLAUDE.md` analog. Do not restore Continuity, Mac-pair, or a RUN ON picker.

## Passes

Run three passes and tag each finding with its pass:

- Bugs: logic errors, broken edge cases, subtle regressions
- Security: injection risks, authentication gaps, PII or secrets in logs
- Compliance: the change matches `spec.md` / `plan.md` / `AGENTS.md` and does not dual-edit a claimed file

## What Important means here

Reserve Important for findings that would break behavior, leak data, spend money, or breach a policy. Style and naming are nits.

## Cap the nits

Report at most **5 nits** per review; summarize the rest as a count.

## Do not report

Generated files (`dist/`, `graphify-out/`, `node_modules/`) and anything CI already enforces.

## Invariants

- Fix the code, not the test.
- Production deploys need a named human (`RELEASE_APPROVAL`). `productionGateWired` is false until a real PreToolUse hook is installed; call `node tools/ai-native-sdlc.js --gate`.
- Do not edit `.intent/contract.yaml` or `scripts/intent-check.js` (AGENT-407).
