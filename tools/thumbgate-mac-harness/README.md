# ThumbGate Mac / box harness

Laptop is cache, VPS is source of truth.

Copy this folder to `~/.config/thumbgate/harness` on a Mac later. It is a drop-in cache:
session HISTORY, MEMORY facts, and global insights. It does not become the hosted runner.

Public offer: hosted Hermes on a fenced VPS, $10/mo. Approvals in thumbgate.app.

```
node harness.mjs
```

Creates:

- `memory/HISTORY.md` — session log
- `memory/MEMORY.md` — upserted facts
- `global/insights.jsonl` — distilled locks

Also exposes persist-before-live ack, hash-anchored replace, and a typed tool policy
(`vscode_extension` is local-only). A deny rule always wins over allow.
