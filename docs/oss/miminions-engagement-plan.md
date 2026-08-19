# Open-Source Engagement Plan: MiMinions-ai/MiMinions

**Repository**: [MiMinions-ai/MiMinions](https://github.com/MiMinions-ai/MiMinions)  
**Target Issue**: [#88: Improvements](https://github.com/MiMinions-ai/MiMinions/issues/88) & [#97: Use Cases & Architecture Guide](https://github.com/MiMinions-ai/MiMinions/issues/97)  
**Status**: Ready for Discussion & PR Dispatch

---

## 1. High-Value Ideas Adopted & Implemented in Our Fleet

1. **Three-Tier Distilled Memory Architecture**:
   - Tier 1: Ephemeral Chronological Session Log (`HISTORY.md` / JSONL)
   - Tier 2: Curated Workspace Invariants & Facts (`MEMORY.md`)
   - Tier 3: Cross-Workspace Knowledge Index (`knowledge-index.json` / SQLite Vector Store)
   - **Automated Distiller** ([`tools/hermes-three-tier-memory.js`](file:///Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards/tools/hermes-three-tier-memory.js)): Background distillation engine promoting tagged high-signal session invariants to `MEMORY.md`.
2. **Local Content-Addressable Storage (CAS)**:
   - SHA-256 integrity verification across workspace facts.

---

## 2. High-Impact Contributions We Can Offer Upstream to MiMinions

Based on our production battle-testing of multi-agent fleets on macOS:

1. **Runtime Resilience & Exponential Backoff** (Addresses Issue #88 §7):
   - Model call retry with jitter and backoff to protect against provider rate limits and transient 429/503 errors.
2. **Deterministic Context Pruning & Bounded History** (Addresses Issue #88 §7):
   - Sliding-window context compaction preventing prompt bloat and token exhaustion on long-running multi-turn agent sessions.
3. **MCP Stdio Lifecycle & Connection Health Heartbeat** (Addresses Issue #88 §7):
   - Graceful cleanup, timeout guards, and process isolation for spawned MCP servers.
4. **Pytest CLI Test Harness with Click `CliRunner`** (Addresses Issue #88 §2):
   - Automated unit test coverage for `cli/agent.py`, `cli/workspace.py`, and `cli/task.py`.

---

## 3. Draft Engagement Comment for Issue #88

```markdown
Hey @MiMinions-ai team! 👋

Love what you've built with the Three-Tier Memory architecture (`HISTORY.md` -> `MEMORY.md` -> SQLite vector store) and pydantic-ai integration. We've actually been using and battle-testing a similar 3-tier memory distillation loop in our autonomous fleet.

Looking at the roadmap in #88, we'd love to contribute PRs for:
1. **Packaging & Pyproject Consolidation** (cleaning up `setup.py` / `setup.cfg` drift into `pyproject.toml` with ruff).
2. **Model Call Retry & Exponential Backoff** (`Minion.run()` retry wrapper with jitter to prevent transient provider drops).
3. **CLI Test Coverage** using `CliRunner` for `cli/workspace.py` and `cli/agent.py`.

Let us know if you'd like us to open a PR on `development` targeting the packaging + retry resilience first!
```
