# Multi-Agent Coordination: Linear + Obsidian + Herdr Harness Integration 🚀

**Goal**: Transform our multi-agent harness into a real-time, conflict-free coordination architecture using **Linear API**, **Obsidian Linear Plugin**, and **Herdr Multiplexer**.

---

## 1. Why Linear + Obsidian Elevates Our Workflow

Currently, our agents coordinate via `plan.md`. While local markdown is fast, high concurrency (3+ agents) introduces git rebase thrash when multiple agents update `plan.md` simultaneously.

### The Hybrid Architecture
```
                  ┌─────────────────────────────────────────┐
                  │          Linear App (Cloud SSOT)        │
                  │     https://linear.app/igorganapolsky   │
                  └────────────────────┬────────────────────┘
                                       │
                      ┌────────────────┴────────────────┐
                      ▼                                 ▼
         ┌─────────────────────────┐       ┌─────────────────────────┐
         │ Obsidian Linear Plugin  │       │  Linear MCP / Node API  │
         │  (Local Markdown Sync)  │       │ (Agent State Interceptor)│
         └────────────┬────────────┘       └────────────┬────────────┘
                      │                                 │
                      ▼                                 ▼
         ┌───────────────────────────────────────────────────────────┐
         │              Local Developer Environment                  │
         │     Herdr Multiplexer · Antigravity · Claude · Codex      │
         └─────────────────────────────────────────────────────────┘
```

### Key Benefits
1. **Zero Git Conflict Lock Management**: Linear API handles issue state transitions (`Backlog` → `In Progress` → `In Review` → `Done`) atomically, eliminating `plan.md` git merge conflicts.
2. **Obsidian Local-First RAG**: The Obsidian Linear plugin keeps local markdown notes byte-synced with Linear issues, giving agents instantaneous semantic search over project context.
3. **Herdr Pane State Alignment**: Herdr detects agent pane states (`working`, `blocked`, `done`, `idle`) and mirrors them directly into Linear issue statuses.

---

## 2. Technical Component Design

### A. Linear API Connector (`tools/linear-agent-bridge.js`)
- Queries active team issues under `https://linear.app/igorganapolsky/agent`.
- Maps Linear IDs (`AGENT-12`, `AGENT-15`) to local worktree branches (`feat/AGENT-12-auth`).
- Auto-assigns issues to active agent IDs (`antigravity`, `claude`, `codex`, `grok`).

### B. Obsidian Linear Plugin Configuration
- **Plugin Repository**: `community.obsidian.md/plugins/linear`
- **Vault Location**: `~/workspace/git/igor/mac-yolo-safeguards/docs/`
- **Format**: Each Linear issue renders as a clean Obsidian markdown document with YAML frontmatter:
  ```yaml
  ---
  linear_id: AGENT-12
  status: In Progress
  assignee: antigravity
  claimed_files:
    - hermes-mobile/src/services/herdrStatus.ts
  ---
  ```

### C. Agent Workflow Rules
1. **Read Linear State**: Before picking up a task, the agent queries `node tools/linear-agent-bridge.js --list` or reads local Obsidian sync notes.
2. **Claim Issue**: Transition Linear issue state to `In Progress` and assign to self.
3. **Execute & Verify**: Run tests locally; update Linear issue with SHA and test proof upon completion.

---

## 3. Immediate Implementation Steps

1. **Obtain Linear API Key**: Generate a personal access token at `https://linear.app/igorganapolsky/settings/api` and save to macOS Keychain (`LINEAR_API_KEY`).
2. **Deploy `tools/linear-agent-bridge.js`**: Lightweight Node.js CLI script interfacing with Linear’s GraphQL API (`https://api.linear.app/graphql`).
3. **Wire into `agent-session-start.js`**: Automatically fetch assigned Linear issues on session start.
