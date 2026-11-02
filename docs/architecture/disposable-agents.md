# Disposable Agent Lifecycle & Architecture Blueprint
*(Inspired by Navveen Balani's Episode 101: Disposable Agents — What If AI Agents Were Built to Expire?)*

## 1. Executive Summary & Core Principles
Traditional AI agent harnesses often maintain persistent, monolithic agent sessions that accumulate conversational clutter, stale state, excessive persistent permissions, and token degradation. This document defines our implementation of **Disposable, Ephemeral Agent Swarms** for Poolside & Mac-Yolo environments.

### Key Tenets:
1. **Time-Bound Least Privilege**: An agent session holds exactly the scoped file paths, tool permissions, and tokens required for its specific task, bounded by a strict TTL (e.g. 5 to 60 minutes) and auto-revoking credentials upon expiry.
2. **Stateless Working Context**: Working memory and intermediate chain-of-thought tokens are ephemeral. They are discarded immediately upon task completion.
3. **Enterprise Memory Separation & Garbage Collection**: Only distilled, validated artifacts (decisions, verified unit tests, reusable skills, metrics) are persisted into long-term stores (ThumbGate knowledge graph, SQLite memory, or git commits).
4. **Dynamic Swarm Spawning**: Complex tasks dynamically spawn short-lived specialist sub-agents (e.g. a 15-minute security auditor or a "deliberate dissent" validator) rather than relying on a single omniscient model instance.

---

## 2. The 6-Step Disposable Agent Lifecycle

```
[Create] ──► [Equip] ──► [Collaborate] ──► [Complete] ──► [Extract Intelligence] ──► [Retire]
```

### Step 1: Create
* **Trigger**: A task packet or work item is dispatched (e.g., via `agent-mesh`, Linear, or local CLI).
* **Action**: Dynamically instantiate a lightweight agent instance (e.g., using `Laguna-XS-2.1` for speed or `Laguna-S-2.1` for complex orchestration) with a unique ephemeral `session_id`.

### Step 2: Equip
* **Trigger**: Initialization of the spawned agent instance.
* **Action**: 
  - Set a time-bounded authority lease using ThumbGate (`thumbgate__set_task_scope` with `ttlMs` and explicit `allowedPaths`).
  - Inject only the required context pack (`node tools/coding-context-pack.js`) rather than entire repository dumps.
  - Assign explicit tool capabilities (e.g., read/write under `./src/` only, with high-risk tools blocked or gated).

### Step 3: Collaborate
* **Trigger**: Multi-file refactoring, security reviews, or architectural decisions.
* **Action**: 
  - Spawn temporary specialist sub-agents (`fast_test_diff`, `reviewer`, `dissent_checker`).
  - Communicate findings asynchronously via SQLite/JSON buses (`~/Documents/AI-Agent-Sync/Handoffs/`) or `agent-mesh`.
  - Enforce independent verification before any completion claim.

### Step 4: Complete
* **Trigger**: Acceptance criteria met or TTL timeout reached.
* **Action**: 
  - Evaluate output against deterministic verifiers (unit tests, type checks, lint rules).
  - If criteria are met, trigger the extraction phase; if timeout/failure occurs, capture failure signals via ThumbGate (`capture_feedback` with `signal=down`) and abort.

### Step 5: Extract Intelligence ("Garbage Collection")
* **Trigger**: Successful verification prior to tear-down.
* **Action**: 
  - Distill raw execution logs, intermediate scratchpad thoughts, and failed paths into the garbage bin.
  - Persist only high-value outputs:
    - Code changes (committed to git via isolated worktrees).
    - Durable lessons and prevention rules (promoted to ThumbGate lessons DB).
    - Architecture decision records (ADRs) in Obsidian / SQLite memory.

### Step 6: Retire
* **Trigger**: Extraction complete or TTL elapsed.
* **Action**: 
  - Revoke active file locks (`agent-mesh` surface releases).
  - Terminate background processes started by the session.
  - Purge temporary scratch files, workspace caches, and uncommitted temp states.
