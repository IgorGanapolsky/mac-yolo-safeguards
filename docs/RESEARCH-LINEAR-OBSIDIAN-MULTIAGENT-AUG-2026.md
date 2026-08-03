# Research + setup: Linear + Obsidian multi-agent coordination (August 2026)

**Priority:** CEO #1 (2026-08-03)  
**Deep research run_id:** `trun_d3be5e813aa94970a1aa9fc9306812e5`  
**Raw report:** [`parallel-research/linear-obsidian-multiagent-aug-2026.md`](../parallel-research/linear-obsidian-multiagent-aug-2026.md)  
**Interaction ID (follow-ups):** `trun_d3be5e813aa94970a1aa9fc9306812e5`  
**Implemented in-repo:** `tools/linear-agent-bridge.js`, `tools/coord-setup.js`, `tools/obsidian-linear-sync.js`

---

## Executive verdict (what we adopt)

| Research finding | Our adoption |
|------------------|--------------|
| **Two ledgers + Git truth** — Linear durable issues; Obsidian readable WIP; Git = code | Keep 3-layer model: Linear issue bus · vault file/WIP · plan.md megafiles · worktrees |
| **Leases beat permanent locks** — Linear has no atomic CAS claim | Soft locks via `agent-lock` + `agent-<name>` labels + vault claims; **must release on done**; scrub stale |
| **Stigmergy** — leave discoverable traces, not private chat | Structured Linear comments + `Handoffs/linear-claims/` + `Agent-State/## In flight` |
| **Crash recovery is normal** | `--scrub-stale` reconciler; session `--coord-status` ghosts |
| **Plugin-as-lock is an anti-pattern** | Obsidian Linear plugin + vault issue mirrors = **display only** |
| **Shared checkout fails** | One agent per git worktree (AGENTS.md already) |
| **Linear Agent surface (2026)** | Use issue activity as agent-visible ops log; human remains Linear assignee |
| **Standardize boundary not model** | Same claim / done / scrub contract for grok, claude, codex, cursor, Hermes, … |

We do **not** invent a paid claim broker in this pass. Soft locks + worktrees + scrub are the right cost for a solo-founder Mac fleet. If two agents race the same megafile, plan.md ownership still serializes.

---

## Industry sources (Aug 2026 window)

- Linear GraphQL: `issueUpdate` with `addedLabelIds` / `removedLabelIds`, comments, states — durable ledger, not fencing token.
- Linear Agent public beta (~2026-03-24): agents as app users; still use labels+comments for our multi-adapter fleet.
- Obsidian vault = folder; Sync = sync not CAS. Stigmergic / blackboard patterns (2025 papers) → structured handoffs.
- Git worktrees for parallel agents (Cursor/Claude/MindStudio guidance 2026).
- Lease analogy: SQS visibility timeout — work must become reclaimable after crash.
- Humans-on-the-loop for secrets, force-push, merges, production (NIST / 2026 HITL guides).

Full narrative + citations: raw `parallel-research/…md`.

---

## Target architecture (this repo)

```
┌─────────────────────────────────────────────────────────┐
│ Session start: agent-session-start → --coord-status     │
└───────────────┬─────────────────────────────────────────┘
                │
     ┌──────────▼──────────┐     ┌────────────────────────┐
     │ Linear (task bus)   │     │ Vault (file/WIP bus)   │
     │ agent-lock labels   │◄───►│ Agent-State/## In flight│
     │ comments + states   │     │ Handoffs/linear-claims │
     └──────────┬──────────┘     └───────────┬────────────┘
                │                            │
                └──────────┬─────────────────┘
                           ▼
              git worktree + branch + PR
              plan.md only for MEGAFILES
```

### Protocol (every multi-file session)

```bash
node tools/coord-setup.js                              # once / when vault missing templates
node tools/linear-agent-bridge.js --coord-status       # locks + vault + ghosts
node tools/linear-agent-bridge.js --claim ID --agent <you> --files a,b
# work in isolated worktree only
node tools/linear-agent-bridge.js --done ID --agent <you> --comment "merged <sha>"
# done/release STRIPS agent-lock labels (Aug 2026 fix)

# Hygiene (daemon or weekly)
node tools/linear-agent-bridge.js --scrub-stale         # dry-run
node tools/linear-agent-bridge.js --scrub-stale --apply
node tools/obsidian-linear-sync.js                      # human dashboard only
```

### Agent-State contract

```markdown
## In flight
- Linear: AGENT-N
- Title: …
- Agent: grok
- Claimed: ISO-8601
- Files:
  - path/a
```

On free: `## In flight` → `(none — free)`.

---

## Setup checklist (executed by `coord-setup.js`)

- [x] Vault dirs: `Agent-State/`, `Handoffs/linear-claims/`, `Projects/mac-yolo-safeguards/Issues/`
- [x] Per-agent `Agent-State/<agent>.md` templates with `## In flight`
- [x] Vault protocol note: `Agent-State/COORD-PROTOCOL.md`
- [x] Bridge: claim / done / release / coord-status / scrub-stale
- [x] Done/release remove `agent-lock` + `agent-*` labels
- [x] Obsidian sync writes real owners/labels (not hardcoded `antigravity`)
- [x] Session start already calls `--coord-status`
- [x] LaunchAgent `com.igor.agent-fleet-orchestrator` (15m) runs fleet loop
- [x] Unit tests for pure helpers + lock detection

### Optional later (not blocking)

- Lease TTL + heartbeat comments (research default 15m / 5m) if thrash returns
- Linear Agent native app-user assignment when all adapters support it
- Transactional claim broker if two agents still race soft locks

---

## Anti-patterns (hard)

1. Obsidian plugin or issue note as a lock  
2. Leaving `agent-lock` after Done  
3. Two agents in one working tree  
4. Skipping plan.md on megafiles  
5. One hot shared Markdown rewritten by everyone  
6. Claiming mid-session without updating vault `## In flight`  
7. Chrome/desktop hijack for “coordination” UIs  

---

## AcceptanceCheck (this ship)

1. `node tests/test-linear-agent-bridge.js` green  
2. `node tools/coord-setup.js` ensures vault + reports doctor  
3. `--done` / `--release` strip agent-lock labels (code path + help)  
4. `--scrub-stale` dry-run lists backlog locks / vault-done ghosts  
5. Docs: this file + `docs/agents/linear-obsidian-coordination.md`  
6. Research artifact committed under `parallel-research/`

---

## Coordination note

Codex claimed Linear **AGENT-28** research path  
`docs/research/august-2026-multi-agent-coordination.md` only.  
This doc + implementation use a different path and tools to avoid claim collision.
