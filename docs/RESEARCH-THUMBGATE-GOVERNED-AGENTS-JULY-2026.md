# ThumbGate governed-agent controls — July 2026

Source: [LangChain, “Building Governed Agents: A Framework for Cost, Control, and Compliance” (July 20, 2026)](https://www.langchain.com/blog/building-governed-agents-a-framework-for-cost-control-and-compliance)

## Decision

Adopt the framework, not the LangChain/LangSmith dependency. ThumbGate already is the runtime control plane for Hermes: it authenticates users and devices, isolates organizations, chooses local versus cloud execution, fences work with renewable leases, and records audit events. A second gateway would add cost and a new critical dependency without closing the current gap.

The immediate high-ROI gap is consistent enforcement. The task-create route had active, daily, and 30-day cloud limits, but manual failover and automatic cloud claims did not apply the same versioned policy. That meant a valid task could cross a later boundary without preserving which policy allowed or denied the transition.

## Implement now

1. One pure, versioned policy for workspace access, active tasks, daily tasks, cloud entitlement, and 30-day cloud continuations.
2. Apply it at task admission, explicit user-approved failover, and automatic cloud-runner claim.
3. Emit secret-free allow/deny audit metadata containing policy version, stage, scope, route, code, limit, and observed count.
4. Fail denied automatic claims into the existing recoverable `offline_blocked` state rather than letting an ineligible runner execute.
5. Return machine-readable denial codes to clients while retaining current user-facing messages.

## Defer

- LangSmith or another paid LLM gateway: no evidence it improves the current single-runner economics enough to fit the strict $10/month ceiling.
- Model-based PII filtering on every request: probabilistic, adds latency and spend, and does not replace deterministic tool and tenant boundaries.
- SCIM, regional trace storage, or enterprise compliance packages: add only with a buyer and a concrete requirement.
- Dollar-level token accounting: add when the cloud provider exposes stable usage and price inputs. The current enforceable commercial envelope is the plan’s fixed 30-day continuation count.

## Proof gates

- Pure policy tests cover the exact threshold and projected next cloud task.
- Lease tests prove an automatic cloud claim rechecks entitlement/budget and records the policy version.
- Route contracts prove admission and manual failover call the same policy and emit deny receipts.
- Existing Worker+D1 lifecycle E2E remains green.
