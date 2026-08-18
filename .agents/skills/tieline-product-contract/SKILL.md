---
name: tieline-product-contract
description: Tieline-Style Reviewed Source of Truth for Product Behavior & Product-Level Blast Radius Engine. Maps features and acceptance criteria to code and test contracts, preventing silent business regressions.
---

# Tieline Product Contract & Blast Radius Skill

> **CORE PRINCIPLE**: Never modify code without understanding its **Product Contract** and computing its **Product-Level Blast Radius**.

## When to Use This Skill
- Before editing critical business files (`lib/`, `apps/hermes-control-plane/`, `tools/`).
- When investigating what user-facing capabilities will be affected by a refactor or PR.
- To verify that every acceptance criterion has a corresponding regression test.

## Key CLI Commands

### 1. Compute Blast Radius for Changed Files
```bash
node tools/tieline-product-contract.js --blast-radius <file1> <file2>
```

### 2. Verify Contract Integrity on Disk
```bash
node tools/tieline-product-contract.js --verify
```

### 3. List All Active Feature Contracts
```bash
node tools/tieline-product-contract.js --list-contracts
```

## Execution Protocol
1. **Preflight**: Run `computeBlastRadius` on your target files to identify the governed `featureId` and its `acceptanceCriteria`.
2. **Implement**: Make surgical edits while preserving the contract's business invariants.
3. **Verify**: Execute the required test files listed in the blast radius output.
