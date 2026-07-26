# System maturity — architecture, failure, measure, secure, deploy, verify

Living scorecard for the five pillars. **Automated scores:**  
`node tools/system-maturity-scorecard.js` (also `--json`, `--strict`).

| Pillar | How we raise maturity |
|--------|------------------------|
| RAG | Fixed retrieval eval (`tools/rag-retrieval-eval.js`) + lessons protocol |
| Agent + tools | SessionContract, tool policy, **task `traceId`**, leases |
| Multi-agent | Swarm harness, plan.md, Field Guide |
| MCP | `.mcp.json` + `tools/mcp-health-check.js` + [MCP-INVENTORY.md](./MCP-INVENTORY.md) |
| Production eval/obs | Observability gate, harness-eval, product deep-links, portal GET |

---

## 1. RAG system

### Why this architecture?
Layered memory: (1) ThumbGate lessons (operator 👍/👎), (2) local code semantic search (grepai / retrieval harness), (3) Field Guide stigmergy. Prefer **mistake capture** over embedding every chat.

### What can fail?
Empty capture index; wrong lessons; grepai offline; retrieval misses required paths.

### How do you measure it?
- `node tools/rag-retrieval-eval.js` → mean recall@k on `tests/fixtures/rag-eval/cases.json`
- Protocol: recall at session start; capture after incidents

### How do you secure it?
Org-scoped lessons; no secrets in lesson text; local indexes stay on the Mac.

### How do you deploy it?
Lessons API via control-plane Worker; local indexes via Mac processes.

### How do you know it works?
Retrieval eval green in CI/scorecard; MCP recall after capture (when host wired).

---

## 2. Agent with tools

### Why this architecture?
Tool-using Hermes + coding agents; fenced leases; Continuity tool policy; effort step-down.

### What can fail?
Offline machine, lease expiry, policy deny, hallucinated ship claims.

### How do you measure it?
Task completion / route; continuous E2E; `hermes-harness-eval.js`; **traceId** on task create.

### How do you secure it?
Pairing keys on device; org auth; cloud entitlement; tool policy.

### How do you deploy it?
Worker + connector install + mobile OTA gates.

### How do you know it works?
CI + E2E gate + live task receipts with traceId in audit metadata.

---

## 3. Multi-agent workflow

### Why this architecture?
Human-tempo swarm: claims, worktrees, planner/worker economics — not fake high-frequency multi-agent VCS.

### What can fail?
Claim collisions, megafile thrash, uncommitted WIP.

### How do you measure it?
Finished AC; thrash signals from `agent-swarm-harness.js`.

### How do you secure it?
Ownership protocol; no foreign claim edits; secrets out of git.

### How do you deploy it?
Process (AGENTS.md + session-start); code via PR → main.

### How do you know it works?
Harness brief; green required checks on merge.

---

## 4. MCP-based integration

### Why this architecture?
Shared tool protocol across agent hosts; remote HTTP for cloud agents; stdio for local index.

### What can fail?
Missing tokens; local-only MCP on cloud hosts; over-privileged tools.

### How do you measure it?
`node tools/mcp-health-check.js`; optional `--ping`.

### How do you secure it?
Env/keychain secrets; blast-radius column in inventory; least privilege.

### How do you deploy it?
`.mcp.json` + host config; never commit secrets.

### How do you know it works?
Structural health pass; tools succeed in agent sessions.

---

## 5. Production AI + evaluation / observability

### Why this architecture?
Ship claims require proof: continuous E2E, observability gate, receipt mining, product smokes.

### What can fail?
Stale E2E; deploy lag; broken deep links; GET on POST-only billing routes.

### How do you measure it?
`hermes-observability-gate.js`; harness-eval; maturity scorecard; control-plane tests.

### How do you secure it?
Auth APIs; private telemetry; billing portal org match.

### How do you deploy it?
`npm run deploy:cloudflare` in control-plane; store/OTA pipelines for mobile.

### How do you know it works?
Required CI green + deploy version + scorecard ≥ 3.5 all pillars.

---

## Commands (copy-paste)

```bash
node tools/rag-retrieval-eval.js
node tools/mcp-health-check.js --write-docs
node tools/system-maturity-scorecard.js
node tools/system-maturity-scorecard.js --strict
node tools/hermes-observability-gate.js --mode status --json
```
