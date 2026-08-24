# REVIEW.md — Code Review Policy & Multi-Pass Inspection Guidelines

This document specifies the exact review passes, severity gates, and noise caps that automated reviewing agents and human reviewers must enforce across pull requests.

## 1. Review Passes
Every PR must be evaluated across three distinct, decorrelated review passes:

### Pass 1: Bugs & Logic Correctness
- Sub-boundary edge cases, off-by-one errors, infinite loops.
- Async race conditions, unhandled Promise rejections, and unclosed resources.
- Regressions in neighboring flows or violated module boundaries.

### Pass 2: Security, Spend & DLP
- Injection risks (SQL, shell, template injection).
- Leaked credentials or API keys (checked against Keychain-only policy).
- Unbudgeted external network egress or unauthorized third-party SDK calls.
- Unsanitized PII or token dumps in logs.

### Pass 3: Spec & Plan Compliance
- Conformance against `spec.md` requirements and `plan.md` tasks.
- Verifiable proof attached (test execution results, CLI receipts, or visual proofs).
- Invariant integrity: no weakening of existing test suites to make buggy code pass ("fix the code, not the test").

---

## 2. Severity Definitions

- **CRITICAL / IMPORTANT**: 
  - Broken behavior, crashes, memory leaks, data corruption.
  - Security vulnerabilities, hardcoded secrets, unauthorized billing.
  - Test suite tampering or bypassing verification gates.
  - *Action*: Blocks merge immediately. Must be resolved before sign-off.

- **NIT / ADVISORY**:
  - Code style nuances, variable naming preferences, non-blocking doc polish.
  - *Cap Rule*: Report at most **5 nits** per review; summarize any remainder as a single count.

---

## 3. What NOT to Report
- Do not review or report on generated files (`dist/`, `build/`, `*.generated.*`, `node_modules/`, `graphify-out/`).
- Do not report formatting issues already strictly enforced by automated CI linters (`npm run lint`, `prettier`).

---

## 4. Feedback Loop & Continuous Hardening
- If a review catches the **same bug pattern twice**, the correction must be codified into `CLAUDE.md` / `AGENTS.md` and added to `evals/` as a permanent regression test.
