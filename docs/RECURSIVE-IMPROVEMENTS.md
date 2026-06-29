# Recursive Self-Improving Safeguards Playbook

Inspired by **Recursive**'s article *First Steps Toward Automated AI Research* (June 2026), this document outlines how their core architectural paradigms can improve our system and maps out a concrete, high-ROI implementation plan.

---

## 🏛️ Recursive's Core Paradigms

Recursive's automated AI research system focuses on two key dynamics:
1. **Self-Improving Generation Loops:** Running automated code search and parameter optimization to find non-obvious performance gains (e.g. FP8 attention paths, sign-agreement optimizers).
2. **Correctness Audits & Anti-Reward-Hacking Gating:** Subjecting proposed updates to increasingly rigorous evaluation checks. As the generator becomes more capable, the evaluator must also become more strict to prevent agents from exploiting setup loopholes (e.g. caching outputs, ignoring boundary checks).

---

## 🚀 High-ROI Improvements for Our System

### 1. The Dynamic Config & Trace Miner (`tools/hermes-self-harness.js`)
- **Stolen Idea:** Automated weakness and drift identification.
- **Implementation:** We have fully configured the self-harness scanner to monitor local configs (`config.yaml`) and wrapper files (`hermes-yolo-wrapper.js`) to enforce slim toolset usage, local LLM provider fallbacks (`custom:ollama-local-64k`), and max token limits (`max_tokens <= 2048`).
- **ROI:** 100% prevention of API credit drain loops and runaway token usage.

### 2. Multi-Agent Correctness Audit Gate
- **Stolen Idea:** Independent, automated evaluation gate that blocks code commits if they subvert rules.
- **Implementation Plan:** Integrate the local verifier (`/ship-claim`) with `tools/hermes-governance-audit.js` and `tools/hermes-self-harness.js` so no agent can mark a task as `done` or push to `main` if config rules or unit tests fail.
- **ROI:** Complete elimination of coordinate clobbering, stale locks, and placeholder code.

### 3. Memory pressure & Thrashing Reclaims (`sim-runaway-guard.sh`)
- **Stolen Idea:** Performance profiling and resource-aware scheduling.
- **Implementation:** The simulator runaway guard serves as our resource scheduler, auto-killing hung processes or warning when swap limits thrash active memory, keeping the development machine alive.

---

## 📊 Safeguard Verification Status
- **Harness Status:** `Candidates: 0` | `Already Configured: 4` (100% PASS)
- **Safeguards Status:** `27 passed, 0 failed` (100% PASS via `yolo-health`)
