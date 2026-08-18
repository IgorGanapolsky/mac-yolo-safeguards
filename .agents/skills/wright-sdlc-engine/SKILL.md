---
name: wright-sdlc-engine
description: Wrights-Style Phased Work Order & Agentic SDLC Gate Engine. Manages structured work order progression through 5 deterministic stage gates (SPEC -> BUILD -> TEST -> CI_CD -> OBSERVABILITY) with immutable audit receipts.
---

# Wrights SDLC Gate Engine Skill

Implements the Phased Work Order SDLC model:
1. **Work Order DAG**: Strict progression through `SPEC` $\rightarrow$ `BUILD` $\rightarrow$ `TEST` $\rightarrow$ `CI_CD` $\rightarrow$ `OBSERVABILITY` $\rightarrow$ `CLOSED`.
2. **Role Gatekeepers ("Wrights")**:
   - `Coordinator`: Orchestrates work order DAG.
   - `Product Wright`: Validates acceptance criteria & intent blueprints.
   - `Build Wright`: Implements code in isolated worktrees.
   - `Testing Wright`: Verifies unit/E2E test suite passes.
   - `CI/CD Wright`: Enforces GitHub Actions green check rollup & squash auto-merge.
   - `Observability Wright`: Evaluates post-deploy production telemetry & canaries.
3. **Deterministic Gate Automation**: Prevents out-of-order execution, logs audit proofs, and eliminates manual human babysitting.

## Global System Commands

- **`bin/wright-sdlc --doctor`**: Health diagnostics and active Wright roles.
- **`bin/wright-sdlc --demo`**: Executes and displays an end-to-end work order run.
- **`bin/wright-sdlc --json`**: Outputs structured JSON audit receipts.

## Verification

```bash
# Run Doctor Diagnostics
bin/wright-sdlc --doctor

# Run Automated Test Suite
node tests/test-wright-sdlc-engine.js

# Execute Demo Work Order
bin/wright-sdlc --demo
```
