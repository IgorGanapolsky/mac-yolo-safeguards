# Linear Agent native skills (Basic, no AI credits)

Paste into Linear → Agent → Skills (personal or AGENT team-shared).
There is no GraphQL `skillCreate` on this workspace PAT.

Generate live copy:

```bash
node tools/linear-basic-full-use.js --export-agent-skills --json
```

Do **not** dual-edit `tools/linear-agent-skill-exporter.js` (Codex PR #2121).

## 1. Fleet lock — never steal

Refuse to claim or relabel an issue that already has `agent-codex` or `agent-claude-code`. Canonical new labels use dash form (`agent-grok`). Never mint `agent-codex-slug-20260826`.

## 2. AGENT cycle rollup

Weekly cycles, cooldown 0, America/New_York. Cycle 1 starts 2026-08-31. Do not start a cycle early. Telemetry lives in a comment, never `pr_merge_time:Nm`.

## 3. Triage then claim

New AGENT work lands in Triage. After a grok claim: In Progress + `agent-lock` + `agent-grok`. Templates: Fleet claim / Bug / Agency cash. No `triageResponsibilityCreate`.

## 4. Attach evidence (unlimited uploads)

`attachmentCreate` the GitHub PR URL on the issue. Do not dump the patch into the vault as the evidence surface.

## 5. Named customer only

Customers for named HVAC/plumbing shops, Jeff/Hilltown, or a verified cash buyer. Never fake personas. Pulse is the daily summary, not Insights.

## 6. Fail closed on Business

Loops, SLAs, Insights, Dashboards, Linear Asks, Code Intelligence, Triage Intelligence, private teams, SAML → `PLAN_WALL`. Coding sessions only if AI credits remain; never auto-buy.
