# Agent repo intelligence (high-ROI local substitute for JetBrains Context)

**Product:** Hermes Mobile / multi-agent coding in this monorepo.  
**Not for end users.** For coding agents only.

## Why

JetBrains Context (`jbcontext`) is a commercial repository-intelligence layer for coding agents.
We cannot assume every agent has JetBrains AI. This repo already has **graphify** + the field guide.

`tools/agent-repo-intelligence.js` is the **high-ROI local path**:

| Step | Command |
|------|---------|
| Status | `node tools/agent-repo-intelligence.js --status` |
| Semantic-ish query | `node tools/agent-repo-intelligence.js "pair.json remint"` |
| Path | `node tools/agent-repo-intelligence.js --path A B` |
| Refresh graph | `node tools/agent-repo-intelligence.js --update` |

## JetBrains Context (optional)

If you have a JetBrains AI subscription:

1. Install `jbcontext` from [JetBrains Context](https://www.jetbrains.com/context/)
2. `jbcontext login`
3. `jbcontext setup-agent` in this repo
4. `jbcontext index` then normal agent work
5. `jbcontext analyze` for savings

Do **not** block shipping product fixes on `jbcontext` availability.

## Related

- `docs/agent-field-guide/index.md` — stigmergy surprises
- `AGENTS.md` — graphify rules
- Play free package must stay unpublished; paid is `com.iganapolsky.hermesmobile.paid`
