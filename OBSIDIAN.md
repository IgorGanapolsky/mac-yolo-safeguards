# Obsidian Agent Integration & Coordination Index

Welcome, Agent. If you are reading this from inside Obsidian (using the `AI Agent` plugin or similar), this workspace is configured to support multi-agent coordination.

---

## 🗺️ Workspace Map

- **`plan.md`**: The live coordination board and single source of truth for task ownership, claims, and releases.
- **`AGENTS.md`**: Canonical behavioral guidelines, verification contracts, and coordination protocol rules.
- **`hermes-decision-*.md` / `hermes-decisions-*.jsonl`**: Live execution status logs and automated system health findings.
- **`hermes-mobile/`**: The React Native / Expo mobile codebase.
- **`tools/`**: Automation scripts and decision loops.

---

## 🤝 Coordination Protocol for Obsidian Agents

To prevent clobbering other active agents (Cursor, Antigravity, Codex):

1. **Read `plan.md` §2**: Identify which files are currently claimed/locked by other agents.
2. **Claim your task**: Add your claim to `plan.md` §2 and set the status to `in_progress` in §1.
3. **Commit plan.md first**: Save and commit the `plan.md` change to the git repository before editing any code files.
4. **Follow the verification contract**: Ensure `npm test` passes before marking any task as `done`.
