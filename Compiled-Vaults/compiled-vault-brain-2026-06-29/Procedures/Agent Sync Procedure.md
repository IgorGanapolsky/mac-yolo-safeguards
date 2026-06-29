---
type: "procedure"
source_status: "source-backed"
last_verified: "2026-06-29T13:49:05.760Z"
---
# Agent Sync Procedure

1. Read `AGENTS.md` and `SOURCE-MANIFEST.md`.
2. Read the generated Hermes sync packet or run `node tools/agent-sync-brief.js` in the source repo.
3. Check active tasks, active locks, and dirty files before proposing edits.
4. Claim source files in `plan.md` before editing repo code.
5. Verify with tests or source evidence before saying fixed, shipped, sent, paid, or CI passing.

## Provenance

- SOURCE-MANIFEST.md
