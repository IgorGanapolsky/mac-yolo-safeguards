# Obsidian Agent Integration & Coordination Index

Welcome, Agent. If you are reading this from inside Obsidian (using the [AI Agent](https://community.obsidian.md/plugins/ai-agent) plugin or similar), this workspace is configured for **file-based** multi-agent coordination.

The Obsidian AI Agent plugin has **no built-in cross-agent sync** — it reads/writes vault notes locally. Sync with Cursor, Claude Code, Hermes, and Telegram agents happens through **shared git files** and **ThumbGate RAG**, not through the plugin API.

---

## Multi-project teammate collaboration

**User directive:** All teammates from multiple projects collaborate on **one shared Obsidian vault**.

| What | Where | Who writes |
|------|-------|------------|
| **Shared vault (all projects, all teammates)** | `~/Documents/AI-Agent-Sync` — repo `IgorGanapolsky/AI-Agent-Sync` | Everyone with GitHub access |
| **Per-repo task ownership** | `<project>/plan.md` in each git repo | Agents working that repo |
| **Cross-project index** | `Projects/README.md` in the vault | Any teammate; PR-style via git |
| **People, decisions, context packs** | `Agent-State/`, `Handoffs/`, `Project-Reports/`, `Context-Packs/` in vault | Teammates + agents |
| **Lessons / mistakes** | ThumbGate MCP (`mcp__thumbgate__recall`) | All agent types |

### Teammate onboarding (git, not Obsidian Sync)

1. **Invite:** Add teammate as collaborator on `IgorGanapolsky/AI-Agent-Sync` (and project repos they need).
2. **Clone vault:** `git clone https://github.com/IgorGanapolsky/AI-Agent-Sync.git ~/Documents/AI-Agent-Sync`
3. **Bootstrap:** `bash ~/Documents/AI-Agent-Sync/scripts/bootstrap_central_vault.sh`
4. **Open in Obsidian:** Open `~/Documents/AI-Agent-Sync` as the vault folder.
5. **Daily sync:** `git pull` before work, `git commit` + `git push` after durable notes (handoffs, project reports, decisions).

Do **not** use Obsidian Sync for this — git is the cross-machine, cross-teammate contract.

### What each agent type reads

| Agent | Primary reads | Repo-local reads | Writes back to vault |
|-------|---------------|------------------|----------------------|
| **Obsidian AI Agent** | `ORGANIZATIONAL_MEMORY.md`, `Projects/README.md`, `Agent-State/latest.json`, newest `Handoffs/` | — | `Handoffs/`, `Project-Reports/`, `Agent-State/` |
| **Cursor** | Same vault paths via `~/.ai-agent-vault`; `.cursor/rules/obsidian-teammate-collaboration.mdc` | `plan.md`, `AGENTS.md`, `OBSIDIAN.md` in active repo | `node tools/agent-sync-brief.js --vault ~/Documents/AI-Agent-Sync` after major `plan.md` changes |
| **Hermes** | `AI Agents/Hermes Agent Sync.md`, `Agent-State/`, `Health/` | `~/.hermes/ai-vault/` runtime packs | `Handoffs/Hermes_handoff.md`, `Health/Hermes.md` |
| **Claude Code / Codex / Antigravity** | Vault `AGENTS.md` + `Declarative-Memory/agents-directives.md` | Per-repo `AGENTS.md`, `plan.md` | Same as Cursor — durable state to vault, tasks stay in repo `plan.md` |
| **Replit Agent (phone)** | `Agent-State/replit-mobile.md`, `Handoffs/2026-07-08-hermes-mobile-replit-coordination.md`, `Projects/Hermes-Mobile-Replit-Agent.md` | `plan.md`, `hermes-mobile/docs/REPLIT_AGENT_COORDINATION.md` | `Agent-State/replit-mobile.md` + own Handoffs only |

**Rule:** Task locks and file ownership live in each repo's `plan.md`. Cross-project status, people, and durable decisions live in **AI-Agent-Sync**.

### Singleton resources: leases, not locks

`plan.md` §2 locks **files** and never expires. That is correct for source code — a half-finished
edit *should* block others until a human looks.

It is wrong for **shared singletons**: the Chrome profile, the operator's social sessions, the
Gmail session, a production deploy, an attached simulator. Only one agent can hold these at a
time, and an append-only lock means one crashed agent blocks the browser forever.

Those use **expiring leases**:

```bash
node tools/resource-lease.js status                    # what's held right now
node tools/resource-lease.js acquire chrome --holder <agent-id> --ttl 900 --task <task-id>
node tools/resource-lease.js renew   chrome --holder <agent-id>
node tools/resource-lease.js release chrome --holder <agent-id>
```

| Resource | Covers |
|---|---|
| `chrome` | The Chrome profile driven by claude-in-chrome / browser MCP |
| `social-publish` | Posting to LinkedIn / X / Bluesky / Threads as the operator |
| `gmail` | The iganapolsky@gmail.com session (read or send) |
| `cloudflare-deploy` | `wrangler deploy` / D1 migrations against production |
| `simulator` | iOS / Android simulator or attached device |

**Contract**

- **Exit code 2 means denied — do not touch the resource.** Not a warning.
- Acquisition is atomic (`O_EXCL`); two agents racing cannot both win.
- Leases expire (default 15 min) so a dead holder self-heals. Takeovers are recorded.
- `release` expires the lease in place rather than deleting it, so it works on filesystems that
  refuse `unlink`, and leaves an audit trail of who held what.
- Long jobs should `renew` rather than acquire a huge TTL — a lease you can't outlive is a lock.

**Why:** on 2026-07-29 two agents drove the same Chrome profile at once. One was mid-publish on
LinkedIn; the other navigated the tab to Gmail. The post survived; the follow-up comment was lost.
Blind retries in that state risk double-posting, which the content-engine guardrails forbid.

If the tab you are driving navigates somewhere you did not send it, that is **contention, not a
platform block**. Re-read actual state before retrying, and check the lease table.

### Replit Agent vault sync

Replit runs in a separate clone (phone preview). It participates in the fleet via git-synced vault files:

1. **Bootstrap:** `git clone https://github.com/IgorGanapolsky/AI-Agent-Sync.git ~/Documents/AI-Agent-Sync`
2. **Before edit:** `git pull` → read `plan.md` §2 + `Handoffs/` + `Agent-State/replit-mobile.md`
3. **After edit:** update `replit-mobile.md`, add Handoffs note if needed, commit + push vault
4. **Code ship path:** PR to mac-yolo-safeguards `main` — Mac agents run `node tools/agent-sync-brief.js --vault ~/Documents/AI-Agent-Sync`

Detail: [hermes-mobile/docs/AGENT-COORDINATION.md](./hermes-mobile/docs/AGENT-COORDINATION.md), [hermes-mobile/docs/REPLIT_AGENT_COORDINATION.md](./hermes-mobile/docs/REPLIT_AGENT_COORDINATION.md).

---

## Workspace Map (this repo)

- **`plan.md`**: Live coordination board — task ownership, file locks, decisions log (**mac-yolo-safeguards only**).
- **`AGENTS.md`**: Canonical behavioral guidelines, verification contracts, coordination protocol.
- **`tools/plan-coordination-snapshot.js`**: Machine-readable parse of active tasks/locks (also printed by `node tools/agent-session-start.js`).
- **`~/.hermes/`**: Desktop Hermes gateway + operator loop (Mac mini / laptop).
- **`hermes-mobile/`**: React Native / Expo mobile codebase.
- **`tools/`**: Automation scripts, CEO brief, decision stack, loop engine.

---

## Coordination Protocol for Obsidian Agents

To prevent clobbering other active agents (Cursor, Antigravity, Codex):

1. **Read vault `Projects/README.md`** — know which repos exist and where their `plan.md` lives.
2. **Read target repo `plan.md` §2** — identify which files are currently claimed/locked.
3. **Claim your task** in that repo's `plan.md` §2 and set status to `in_progress` in §1.
4. **Commit plan.md first** in the project repo before editing code.
5. **Follow the verification contract** — ensure `npm test` passes before marking any task `done`.
6. **Cross-agent memory** — ThumbGate for lessons; vault `Handoffs/` and `Project-Reports/` for durable cross-project context.

## Staying in sync with Cursor / Hermes

| Layer | Mechanism | What syncs |
|-------|-----------|------------|
| Cross-project index | `~/Documents/AI-Agent-Sync/Projects/README.md` | All projects, repo paths, plan.md links |
| Task ownership | `<repo>/plan.md` in git | Active tasks, file locks, decisions |
| Session probe | `node tools/plan-coordination-snapshot.js --json` | Same locks, machine-readable |
| Vault packet | `node tools/agent-sync-brief.js --vault ~/Documents/AI-Agent-Sync` | Hermes Agent Sync + plan snapshot |
| Lessons / mistakes | ThumbGate MCP | Cross-session RAG, anti-patterns |
| Operator loop | `~/.hermes/` + gateway `:8642` | Telegram, revenue, fulfillment |
| Product health | `hermes-mobile/docs/proofs/continuous/latest.json` | E2E + unit status |

## Canonical Obsidian vault

- **Live vault (canonical):** `~/Documents/AI-Agent-Sync` — private repo `IgorGanapolsky/AI-Agent-Sync`. Clone it, open that folder in Obsidian, and run `node tools/agent-sync-brief.js --vault ~/Documents/AI-Agent-Sync` from this repo after major `plan.md` changes.
- **Archived compiled snapshot:** `Compiled-Vaults/compiled-vault-brain-2026-06-29/` in this repo — reference-only export (ThumbGate memory archive + historical brain). Not a second live vault; task ownership authority stays in repo-root `plan.md`.
- **Bootstrap on a new Mac:** `bash ~/Documents/AI-Agent-Sync/scripts/bootstrap_central_vault.sh` wires the compiled snapshot symlink and machine pointers after clone.

Do not open this repo root as your only Obsidian vault unless you are doing repo-local development; cross-agent coordination notes live in **AI-Agent-Sync**.
