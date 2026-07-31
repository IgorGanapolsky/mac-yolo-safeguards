# Failover for Stateful Coding Agents Is a Lease Problem, Not a UI Problem

Every developer-facing AI agent tool now provides permission dialogs or human-in-the-loop approval. But when your laptop closes, your network drops, or your Mac goes to sleep mid-execution, an unattended agent presents a much harder distributed systems problem: **How do you hand off execution without double-executing side effects?**

---

## 1. Why Approval Gates Are Not Enough

An approval gate answers *what* the agent can run. It does not answer *who* runs it when the execution environment changes.

If an autonomous coding agent is running a 5-minute migration script, editing files, or running test suites:
- **Scenario A (No Failover)**: Your Mac sleeps. The run stalls half-finished.
- **Scenario B (Naïve Polling / Multi-Executor)**: A cloud relay attempts to resume the run while your Mac wakes up. Two executors run on the same thread, causing conflicting git commits, double database migrations, or duplicate API calls.

Two active executors on one agent thread is strictly worse than zero executors.

---

## 2. The 90-Second Resource Lease Invariant

To solve stateful agent failover safely, Hermes Mobile implements a strict **90-Second Renewable Resource Lease**:

```
 [ Local Mac Executor ] --(Holds 90s Lock)--> [ State Store ]
         |
    (Mac Sleeps)
         |
 [ Lease Expires ] --(Atomic Transfer)--> [ Cloud VPS Continuity ]
```

### Key Invariants:
1. **Single-Executor Guarantee**: At any millisecond `t`, exactly **one machine** holds the execution lease token for a given `session_id`.
2. **Atomic Heartbeat Renewal**: The active executor must renew its lease heartbeat every 30 seconds.
3. **Fail-Closed Gate**: If the lease expires without heartbeat renewal, execution on the primary node is force-paused before the secondary node takes over.

---

## 3. Human-in-the-Loop Governance from Your Phone

By combining the **90-second resource lease** with **mobile push approvals**, developers keep complete control over autonomous background runs:

- **Pre-Exec Permission**: High-risk shell commands (`rm -rf`, production deployments, force pushes) require explicit single-tap approval from the Hermes Mobile app.
- **Offline Policy**: If the local Mac goes offline, your pre-configured offline policy dictates whether work pauses safely or fails over under strict isolation.
- **Audit Trail**: Every execution state change and human verdict is recorded immutably in the local session ledger.

---

## 4. Try Hermes Mobile & Governance

Hermes Mobile keeps coding agents under human control without requiring you to sit bound to your laptop.

- **Website**: [thumbgate.app](https://thumbgate.app?utm_source=devto&utm_medium=article&utm_campaign=double_execution_lease)
- **Google Play Store**: [Hermes Agent: Mobile AI Leash](https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile.paid&utm_source=devto&utm_medium=article&utm_campaign=double_execution_lease)
- **GitHub Repository**: [IgorGanapolsky/mac-yolo-safeguards](https://github.com/IgorGanapolsky/mac-yolo-safeguards)
