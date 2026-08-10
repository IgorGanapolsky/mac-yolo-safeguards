---
name: uber-multiagent-workflow
description: Ex-Uber Developer Multi-Agent Workflow Protocol & Minimal Operating Template for autonomous coding fleets. Use when structuring subagent tasks, defining handoff artifacts, or scoping multi-agent roles.
---

# Ex-Uber Multi-Agent Workflow Operating Directive

This skill encapsulates the 10-point multi-agent architecture and minimal operating template for autonomous coding fleets.

## 10-Point Multi-Agent Operating Standard

1. **Define One Deliverable & Acceptance Tests First**:
   - Every task must state a single clear outcome and machine-verifiable acceptance criteria before code edits start.
2. **Assign Explicit Agent Roles**:
   - **Planner**: Turns request into spec, architecture, task graph, and risk assessment.
   - **Implementer**: Writes code in a scoped branch/worktree.
   - **Reviewer**: Checks correctness, security, edge cases, and scope creep.
   - **Tester**: Runs tests, reproduces bugs, and validates acceptance criteria.
   - **Release Agent**: Prepares PR description, changelog, deployment notes, and rollback steps.
3. **Artifact-Based Handoff Protocol**:
   - Subagents communicate through durable files: `SPEC.md`, `PLAN.md`, `TASKS.md`, `DECISIONS.md`, `TEST_REPORT.md`, and `HANDOFF.md`.
4. **Narrow Permissions & Bounded Scope**:
   - Limit agents to relevant file paths; keep production deploys, secret rotation, and external publishing behind human approval gates.
5. **Strict Verification Loop**:
   - `plan -> implement -> test -> review -> fix -> retest -> human approval`.
   - Never accept an implementer's self-certified completion without machine verification.
6. **Machine-Verifiable Proof**:
   - Require clean exit codes from linting, type checks, unit tests, coverage thresholds, and CI checks (`scripts/verify.sh`).
7. **Parallelize Only Independent Work**:
   - Parallel: research, API specs, test suites, documentation.
   - Sequential: database migrations, core architecture, integration, production merges.
8. **Cost, Time, and Retry Bounding**:
   - Cap maximum turns, tool calls, elapsed time, and retries per subagent task.
9. **Git Worktree / Isolated Branch Isolation**:
   - One agent per git worktree + branch off `origin/main`.
10. **Outcome Tracking & Prompt Optimization**:
    - Record outcomes, tool usage, duration, and failures into RAG (`ThumbGate` MCP).

---

## Minimal Operating Template

```text
Goal: [Single deliverable description]
Acceptance criteria: [Machine-verifiable conditions]
Constraints: [Memory/time/token limits, no desktop hijack]
Allowed files/tools: [Scoped file paths and tool list]
Forbidden actions: [Secrets, unapproved merges, destructive ops]
Required commands to validate: [e.g. bash scripts/verify.sh]
Definition of done: [Verifiable state + green CI link/commit SHA]
Escalation trigger: [Blocker condition to halt & report]
Handoff format: [HANDOFF.md / SPEC.md payload]
```
