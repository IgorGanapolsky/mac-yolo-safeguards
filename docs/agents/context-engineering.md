# Context Engineering Architecture & Strategy

This document outlines the **Context Engineering** principles and architecture used across our AI agent coding environment, drawing directly from the **Hugging Face Context Course (Units 0–6)** framework.

---

## What is Context Engineering?

An AI coding agent (Claude Code, Codex, Antigravity, Gemini, OpenCode, Pi) is **stateless**. Every turn, the model reads the context window, produces tokens, and terminates.

**Context Engineering** is the systems engineering discipline of managing:
1. **Selection:** What enters the context window (JIT tool calls, semantic search, memory recall).
2. **Structure & Form:** Concise JSON, compact markdown, clear YAML schemas.
3. **Position & Ordering:** Immutable prompt heads (for KV-cache speedup) vs dynamic workspaces (tail).
4. **Exclusion:** Keeping out secrets, irrelevant tool logs, and prompt injections.
5. **Persistence:** External memory (SQLite, `plan.md`, Obsidian vaults) to retain state across sessions.
6. **Safety & Gating:** `PreToolUse` lifecycle hooks to block risky actions before execution.

---

## The 6 Units of Context Engineering (Repository Mapping)

| Unit | Hugging Face Topic | Our Repository Implementation | Best Practice / Directive |
|------|-------------------|--------------------------------|---------------------------|
| **Unit 0** | **Onboarding** | `bin/agent-loop` entry point, `tests/test-session-context.js` | Every session starts by validating the context layer before acting. |
| **Unit 1** | **Agent Skills** | `.agents/skills/`, `SKILL.md` packages, **`SKILLS.md`** registry | Keep `SKILL.md` under 500 lines. Use YAML frontmatter. Put detailed references in `references/` or `scripts/`. |
| **Unit 2** | **Model Context Protocol (MCP)** | `graphify`, `thumbgate`, `context`, `playwright` | Fetch state JIT via tools rather than pasting raw documents into prompts. |
| **Unit 3** | **Plugins** | Domain plugins (`callstack-agent-skills`, `firebase`, `android-cli-plugin`), **`bin/verify-social-post`** plugin (wraps `social-publish-gate.js` + `verify-public-post.js`) | Modularize tools, rules, and scripts per feature domain. |
| **Unit 4** | **Sub-agents & Coordination** | Multi-agent protocol, `plan.md` leases, isolated git worktrees, **`scripts/handoff.sh`** for session continuity | Work on separate branches in isolated worktrees (`git worktree add`). Claim files before editing. |
| **Unit 5** | **Hooks & Guardrails** | `PreToolUse` hooks, ThumbGate pre-action gates, **`tests/test-session-context.js`** validates `~/.claude/settings.json` hook chains | Block risky actions deterministically before execution. Auto-promote mistakes into block gates. |
| **Unit 6** | **Nano Harness & Auditing** | `tools/context-engineering-harness.js`, `tools/agent-decision-stack.js`, **`bin/agent-loop`** (minimal loop: Recollect→Plan→Observe→Act→Evaluate→Learn with metrics) | Audit prompt token footprints, verify KV-cache friendliness, and benchmark agent execution loops. |

---

## Daily Entry Points (Executable Context)

```bash
# 1. Start a session — run the full context-engineering loop
bin/agent-loop

# 2. Quick health check (machine-readable for scripting)
bin/agent-loop --health --json

# 3. Validate the context layer (hooks, MCP, skills, RAG)
node tests/test-session-context.js
CI=true node tests/test-session-context.js   # CI mode (skips Mac-only checks)

# 4. Before any social Post/Publish — hard gate
bin/verify-social-post --platform linkedin --campaign <id> --body-file ./draft.md

# 5. Before editing shared files — check plan.md for claims
echo "src/file.ts" | node tools/plan-coordination-snapshot.js check-ownership --stdin

# 6. Hand off session state to another agent
scripts/handoff.sh write --json '{"lastGoal":"...","openTodos":["..."]}'
scripts/handoff.sh read
```

---

## 5 Essential Rules for Context Engineering

### 1. KV-Cache Prefix Optimization (Immutable Heads)
Keep static context (`AGENTS.md`, system prompts, immutable tool definitions) at the very top of the prompt. Dynamic workspace data and current user requests go at the bottom.
* **Why:** Prefix caching yields **10x faster inference** and **up to 90% lower token costs**.

### 2. Data / Control Separation
Never trust untrusted text (external files, user search queries, third-party PRs) as control instructions.
* **Why:** Authorization, billing rules, and safety gates must stay in deterministic code outside the LLM.

### 3. Attention Economics & Distractor Removal
Transformers suffer from the "Lost in the Middle" effect. Large, irrelevant blobs of text thin out attention across critical instructions.
* **Why:** Compact state summaries and precise JIT tool calls maintain high attention accuracy.

### 4. Machine-Readable Structured Errors
When a tool call fails, return compact machine-readable JSON (e.g. `{"error": "FILE_LOCKED", "owner": "agent-1", "next_action": "wait_or_claim_other"}`).
* **Why:** Saves hundreds of tokens per turn compared to verbose natural language error strings.

### 5. Automated Failure Memory (Immune System)
When an agent makes a mistake, capture it with `mcp__thumbgate__capture_memory_feedback` and promote it to a `PreToolUse` rule via `thumbgate-guard`.
* **Why:** Converts single errors into permanent runtime guardrails across all agents in the fleet.

---

## Verification & Diagnostics

To audit the context engineering posture of this repository at any time, run:

```bash
node tools/context-engineering-harness.js
```

This harness checks:
- System prompt token budgets
- Skill YAML frontmatter & line count limits
- KV-cache head/tail ordering
- PreToolUse hook responsiveness
