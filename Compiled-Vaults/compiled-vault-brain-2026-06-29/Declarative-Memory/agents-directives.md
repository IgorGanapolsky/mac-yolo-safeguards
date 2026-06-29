# Multi-Agent Directives & Coordination Rules

---

## 🤝 Coordination Protocol (Lock Table)
Multiple autonomous agents (Claude Code, Cursor, Antigravity, gemini/codex) work in this repository.
1. **Isolation:** One agent per git worktree + branch; git operations must be serialized; merge sequentially onto `main` (always rebase first), gated on passing `npm test` + Maestro E2E.
2. **Board:** `plan.md` is the shared live board and the single source of truth for task status.

### 📝 Step-by-Step Task Lifecycle
1. **Inspect Plan:** Read `plan.md` first. Pick a `pending` task whose claimed files are marked `(free)`.
2. **Acquire Lock:** Claim task by setting Owner + Status in Task Board, then add claimed files in the File Ownership Map with agent ID + UTC date. Commit `plan.md` *first*, before editing any code files.
3. **Execute:** Edit only claimed files in your isolated worktree. Append any discovered scope expansion to plan.md §4 (do not silently expand scope).
4. **Verify & Release:** Run the verification contract. Set status to `done`, append release line in ownership map, and add a decisions log entry.

### 🚫 Core Forbidden Actions ("Never" list)
- **Never edit a file another agent currently owns.**
- **Never delete or overwrite another agent's claim, lock, branch, or uncommitted WIP.**
- **Never bypass a verification gate (tests/E2E) or invent workarounds.**
- **Never rewrite logs (Decisions/Discovered) in plan.md** — they are strictly append-only.

---

## 🤥 Honesty Protocol
1. Never issue canned completion statements (`"Done"`, `"Shipped"`, `"All clean"`) without verifiable evidence in the same response.
2. Prefer `"I believe this is done, verifying now..."` until verification completes.
3. Report failures, partial completions, or unknowns honestly.
4. Capture mistakes, hallucinations, or stale assumptions to RAG via `mcp__thumbgate__capture_memory_feedback` with `signal=down`.

---

## 📡 Evidence-Based Communication
Every claim of progress requires concrete evidence in the same turn:
- **Deletions:** Count before / count after / list of files.
- **Code Changes:** Git diff, test run console output, or behavioral proof.
- **Fixes:** Reproduce-then-pass verification run output.
- **Merges:** Git commit SHA and CI/webhook pipeline status link.

---

## 🙅 No Manual User Handoffs
Agents must automate all tasks:
1. **Execute** via shell, adb, scripts, or file edits.
2. **Automate** repeating setup tasks (LaunchAgents, pair tools).
3. **Report** verified evidence instead of asking the user to run scripts/verify manually.

---

## 🛡️ Operational Safety
- **Secrets:** Never write API keys, passwords, or personal tokens to tracked files. Authenticate via existing local keychain/env.
- **Destructive Actions:** Deleting files, force-pushing, merging PRs, or killing user processes require explicit confirmation.
- **Internals:** `business_os/` directory is gitignored and contains internal data — do not edit without explicit consent.
