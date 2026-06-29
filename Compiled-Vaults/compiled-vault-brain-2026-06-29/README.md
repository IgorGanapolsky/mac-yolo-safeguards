# 🧠 AI Second Brain Vault — Master Index

Welcome, Agent. This is the centralized, vendor-agnostic AI Vault that acts as a shared brain across all our tools (Claude Code, Codex, Hermes, and Cursor).

---

## 🏛️ Vault Architecture

This vault is organized into clean, markdown-based directories designed for high-context retrieval and multi-agent alignment:

### 1. `Declarative-Memory/`
- **`agents-directives.md`**: Core identity, delegation authority, and coordination protocols. Contains our behavioral guardrails and credentials exclusion rules.

### 2. `Procedural-Memory/`
- **`recursive-improvements.md`**: RAG guidelines and evaluator findings based on the Recursive automated research paradigm.
- **`simulator-rescue.md`**: Step-by-step triage guide for Mac sluggishness or runaway processes.
- **`apk-release-safety.md`**: Testing checklist for real-user readiness.

### 3. `Source-Traces/`
- Holds live coordinate boards, active lock files, and current task plans so all running agents stay in lockstep.

---

## 🔁 Git & Obsidian Layering
- **Durable Sync:** This vault is checked directly into our GitHub repository to sync automatically across dev workspaces, laptop terminals, and remote hosts.
- **Obsidian Graph View:** Open this folder directly as an Obsidian vault to visualize node connections and manage your knowledge base.

## Canonical Vault Truth — 2026-06-29

There is one live Obsidian coordination vault and one compiled brain snapshot:

- **Live vault:** `/Users/igorganapolsky/Documents/AI-Agent-Sync`
- **Live vault remote:** `https://github.com/IgorGanapolsky/AI-Agent-Sync.git`
- **Canonical compiled snapshot:** `/Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards/Compiled-Vaults/compiled-vault-brain-2026-06-29`
- **Canonical compiled remote:** `https://github.com/IgorGanapolsky/mac-yolo-safeguards.git`

Project checkouts such as `Resume`, `ThumbGate`, and `AI_Voice_Phone_Ordering` should write durable cross-agent state into the live vault and/or this compiled snapshot. They should not create competing compiled vaults.

**Live authority vs. compiled export:** The repo-root `plan.md` (and `AGENTS.md`) are the live coordination source of truth. This `Compiled-Vaults/compiled-vault-brain-*` folder is a git-synced export for Obsidian and cross-agent reading—not a second board. Refresh it manually with `cp plan.md Compiled-Vaults/compiled-vault-brain-2026-06-29/Source-Traces/plan-snapshot.md` and `node tools/agent-sync-brief.js --vault Compiled-Vaults/compiled-vault-brain-2026-06-29` whenever you need the vault to match live state.

