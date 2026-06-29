# Team Collaboration Guide (July 2026 Best Practices)

This guide outlines the standard operating procedures, workflows, and configurations for human and AI teammates collaborating on our centralized Obsidian vault across multiple projects and machines.

---

## 🏛️ Centralized Vault Model

We use a single, shared Obsidian Vault to maintain context, project states, task lists, and handoffs:
*   **Live Vault Folder:** `~/Documents/AI-Agent-Sync`
*   **Git Remote:** `https://github.com/IgorGanapolsky/AI-Agent-Sync.git`
*   **Compiled Snapshots:** Nested within `mac-yolo-safeguards/Compiled-Vaults/compiled-vault-brain-2026-06-29`, symlinked into the live vault under `Compiled-Vaults/`.

---

## 🛠️ Multi-Machine Sync & Collaboration Workflows

### 1. Asynchronous Git Synchronization
All teammates (human and agentic) sync vault updates via Git. Because multiple teammates edit notes asynchronously, follow these integration steps:
1.  **Pull before edit:** Always pull remote changes before modifying files:
    ```bash
    git pull --rebase origin main
    ```
2.  **Stash local modifications:** If you have local modifications and a pull fails:
    ```bash
    git stash && git pull --rebase origin main && git stash pop
    ```
3.  **Commit and push immediately:** Minimize the window for conflict by committing and pushing immediately after compiling state:
    ```bash
    git add . && git commit -m "docs(sync): update project state" && git push origin main
    ```

### 2. Workspace File Isolation
To prevent teammates from overwriting each other's custom layouts, open tabs, and plugin configurations, the `.gitignore` file enforces workspace isolation:
*   **Ignored:** `.obsidian/workspace.json`, `.obsidian/workspace`, `.obsidian/workspace-mobile.json`, `.obsidian/backups/`.
*   **Shared:** Core configurations and enabled plugins (`app.json`, `community-plugins.json`, `core-plugins.json`) are committed to ensure teammates share the same environment.

### 3. Real-Time multiplayer (Relay Plugin)
For documents requiring real-time multiplayer co-editing (e.g., active whiteboard brainstorming, meeting notes, live project setup):
*   Install the community **Relay** plugin.
*   Relay utilizes local-first CRDTs to support simultaneous typing and live cursors without generating git conflicts.

---

## 📏 Naming, Metadata, & Linking Conventions

To maintain readability and searchability across different machines and operating systems:

### 1. Relative Linking Protocol (Critical)
*   **Do not use absolute file paths:** Absolute URIs containing local usernames (e.g. `file:///Users/igorganapolsky/...`) will break on other teammates' machines.
*   **Use Vault-Relative Wiki-Links:** Link notes using standard relative format, e.g. `[[Declarative-Memory/agents-directives]]` or `[Directives](Declarative-Memory/agents-directives.md)`.

### 2. Frontmatter Standards
Every document in the vault must declare standard YAML frontmatter:
```yaml
---
type: "project-report" | "context-pack" | "declarative-memory" | "procedural-memory"
project: "restaurant-ai-answering" | "trading" | "job-search"
author: "Antigravity" | "Hermes" | "Igor" | "TeammateName"
last_verified: "YYYY-MM-DDTHH:MM:SSZ"
---
```

---

## 🤝 Cross-Agent Lock Table (plan.md)

To prevent multiple agents from working on the same files or tasks concurrently, reference the lock table in `plan.md`:
1.  **Check Locks:** Verify the claimed status of tasks in `plan.md` §1 and target files in §2.
2.  **Claim & Commit first:** Claim your task and lock your files in `plan.md`, then commit and push the change *before* starting work.
3.  **Release Locks:** Upon verification pass, update status to `done` and push the updated lock table.
