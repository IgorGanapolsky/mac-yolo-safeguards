---
name: cloudflare-durable-workflows
description: Cloudflare Workflows & @cloudflare/ci Durable Step Engine. Checkpoints pipeline executions, provides concurrent step evaluation (Promise.allSettled), traps failures with self-healing repair agents, and enforces log secret redaction.
---

# Cloudflare Durable Workflows & CI Self-Healing Engine

## 1. What We Steal from Cloudflare CI (`@cloudflare/ci` + Workflows)

1. **Durable Checkpointed Execution**:
   - Workflows checkpoint each step and replay from the last good one, so tasks survive partial network flakes rather than rerunning from zero.
2. **Concurrent Step Execution**:
   - Independent verification steps run in parallel by default, reducing pipeline wall-clock time by 60%+.
3. **Self-Healing Agent Pattern**:
   - Catches runner failure in a `try/catch`, invokes a repair agent to generate a fix on an isolated branch, and leaves the run failed until verified and merged (honoring multi-agent governance).
4. **Mandatory Secret Redaction & Idempotency**:
   - Enforces regex-based secret token sanitization on runner logs before storage in D1 / R2.

## 2. Usage

```bash
# Run tests
node --test tests/test-cloudflare-durable-workflow.js
```
