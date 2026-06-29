# Obsidian Agent Integration & Coordination Index

Welcome, Agent. If you are reading this from inside Obsidian (using the [AI Agent](https://community.obsidian.md/plugins/ai-agent) plugin or similar), this workspace is configured for **file-based** multi-agent coordination.

The Obsidian AI Agent plugin has **no built-in cross-agent sync** — it reads/writes vault notes locally. Sync with Cursor, Claude Code, Hermes, and Telegram agents happens through **shared git files** and **ThumbGate RAG**, not through the plugin API.

---

## 🗺️ Workspace Map

- **`plan.md`**: Live coordination board — task ownership, file locks, decisions log.
- **`AGENTS.md`**: Canonical behavioral guidelines, verification contracts, coordination protocol.
- **`tools/plan-coordination-snapshot.js`**: Machine-readable parse of active tasks/locks (also printed by `node tools/agent-session-start.js`).
- **`~/.hermes/`**: Desktop Hermes gateway + operator loop (Mac mini / laptop).
- **`hermes-mobile/`**: React Native / Expo mobile codebase.
- **`tools/`**: Automation scripts, CEO brief, decision stack, loop engine.

---

## 🤝 Coordination Protocol for Obsidian Agents

To prevent clobbering other active agents (Cursor, Antigravity, Codex):

1. **Read `plan.md` §2**: Identify which files are currently claimed/locked by other agents.
2. **Claim your task**: Add your claim to `plan.md` §2 and set the status to `in_progress` in §1.
3. **Commit plan.md first**: Save and commit the `plan.md` change to the git repository before editing any code files.
4. **Follow the verification contract**: Ensure `npm test` passes before marking any task as `done`.
5. **Cross-agent memory**: Use ThumbGate (`mcp__thumbgate__recall` / capture) for lessons that must survive across Obsidian, Cursor, and Hermes sessions — plan.md covers *who owns what*, ThumbGate covers *what we learned*.

## 🔁 Staying in sync with Cursor / Hermes

| Layer | Mechanism | What syncs |
|-------|-----------|------------|
| Task ownership | `plan.md` in git | Active tasks, file locks, decisions |
| Session probe | `node tools/plan-coordination-snapshot.js --json` | Same locks, machine-readable |
| Lessons / mistakes | ThumbGate MCP | Cross-session RAG, anti-patterns |
| Operator loop | `~/.hermes/` + gateway `:8642` | Telegram, revenue, fulfillment |
| Product health | `hermes-mobile/docs/proofs/continuous/latest.json` | E2E + unit status |

## Canonical Obsidian vault

- **Live vault (canonical):** `~/Documents/AI-Agent-Sync` — private repo `IgorGanapolsky/AI-Agent-Sync`. Clone it, open that folder in Obsidian, and run `node tools/agent-sync-brief.js --vault ~/Documents/AI-Agent-Sync` from this repo after major `plan.md` changes.
- **Archived compiled snapshot:** `Compiled-Vaults/compiled-vault-brain-2026-06-29/` in this repo — reference-only export (ThumbGate memory archive + historical brain). Not a second live vault; task ownership authority stays in repo-root `plan.md`.
- **Bootstrap on a new Mac:** `bash ~/Documents/AI-Agent-Sync/scripts/bootstrap_central_vault.sh` wires the compiled snapshot symlink and machine pointers after clone.

Do not open this repo root as your only Obsidian vault unless you are doing repo-local development; cross-agent coordination notes live in **AI-Agent-Sync**.
