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

**Recommended vault setup:** symlink or git-clone this repo into your Obsidian vault (or open the repo folder as a vault) so the AI Agent plugin reads the same `plan.md` Cursor agents use.
