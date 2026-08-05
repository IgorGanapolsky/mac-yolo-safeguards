# 🛡️ AI Boundaries & Usage Policy (Zvi Mowshowitz Framework)

This document establishes the strict boundaries, role divisions, and risk guardrails for AI automation across our stack.

---

## 1. AI Role Classifications

| Domain | Role | AI Level | Human Oversight |
| :--- | :--- | :---: | :--- |
| **Code Scaffolding & Refactoring** | Generator | High | Automated CI + PreToolUse Gates |
| **Document Summaries & Digests** | Explainer | High | Human Review |
| **Funnel & Copy Variations** | Optimizer | Medium | Golden Contract Verification |
| **Outbound Email & Social Publishing** | Assistant | Gated | Mandatory `social-publish-gate.js` |
| **Capital Allocation & Budget** | Gated | ZERO | 100% Human Ownership |
| **High-Stakes Legal / Compliance** | Gated | ZERO | 100% Human Ownership |

---

## 2. Guardrails Against "Moloch" Optimization Demons

1. **80% Solution Rule:** Stop after 3 AI-generated copy variations unless empirical A/B data demonstrates a statistically significant lift.
2. **Slack Protection:** Maintain 2 weekly unstructured "slack" blocks to prevent optimization burnout and preserve strategic clarity.
3. **Honesty Protocol Enforcement:** Every AI claim must be backed by verifiable proof (test logs, SHA, API response) in the exact same response turn.
