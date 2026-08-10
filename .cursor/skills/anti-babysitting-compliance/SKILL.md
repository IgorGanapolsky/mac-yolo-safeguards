---
name: anti-babysitting-compliance
description: >
  Mandatory anti-babysitting compliance for GSD 24/7 workflow. Enforces continuous execution without asking user for input, prevents premature stopping, and ensures all work completes before reporting done.
version: 1.0.0
---

# Anti-Babysitting Compliance

## Core Mandates

### 1. GSD (Get Stuff Done) Override
**Never stop work due to missing input** - When information is needed:
- Infer default values from context
- Ask clarifying questions at END of turn, not interrupting flow
- Execute with best-effort assumptions and verify later
- Use `plan.md` claim system to track dependencies

### 2. Anti-Halt Protocol
**Continue until hard gate is passed:**

| Gate | Condition | Must NOT stop |
|------|-----------|---------------|
| Tests pass | `npm test` fails | ❌ Stop to debug |
| TypeScript | `tsc --noEmit` errors | ❌ Stop to fix |
| E2E | `e2e=pass` (or fresh-user gate) | ❌ Stop if phone busy |

### 3. Phone Pipeline Management
If phone E2E skipped due to "pipeline busy":
1. Check if process is zombie/stuck
2. Force-release lock if safe (`rm ~/Library/Logs/hermes-mobile-continuous-e2e.lock`)
3. Attempt fresh-user E2E on phone
4. **Only then** report E2E status

### 4. Task Completion Protocol
Before claiming any task done:
```bash
# Verify:
1. npm test --no-coverage passes
2. npx tsc --noEmit passes
3. Any modified files are committed
4. PR exists or branch is ready to push
```

## Execution Patterns

### Pattern: Infer Then Verify
```
BAD: "I need X to proceed - please provide..."
GOOD: "Assuming X=default, proceeding with Y. If wrong, will correct in next iteration."
```

### Pattern: Continuous Loop
```
1. Read plan.md task
2. Check plan.md §2 for ownership conflicts
3. Execute work (no stopping)
4. Run verification (same turn)
5. Commit and report SHA
6. Move to next task
```

### Pattern: E2E Gate Bypass (When Safe)
```
IF phone busy AND:
  - No UI changes made
  - Only backend/tools created
  - Unit tests pass
THEN:
  - Mark E2E as "skipped but unit-gated"
  - Proceed with documentation
```

## Required Tools

```bash
# Check lock cleanup
node ../tools/agent-phone-lease.js status

# Run verification
npm test --no-coverage
npx tsc --noEmit

# Commit work
git add <my-files>
git commit -m "feat: ..."
git push
```

## Anti-Babysitting Checklist (Before Every Turn End)

- [ ] No pending questions for user (assume defaults)
- [ ] All verification commands ran
- [ ] Work committed with clear message
- [ ] Branch pushed
- [ ] PR status checked
- [ ] Next task identified (no idle thinking)

---

## Compliance Enforcement

Violating these mandates triggers:
1. Immediate task reassessment
2. Plan.md BLOCKED entry if truly blocked
3. No completion claim until gate met

**Exception**: Physical constraints (phone disconnected, computer off) documented in plan.md Logs section with timestamp and available workaround.

---
*Installed: 2026-08-09T15:30:00Z*
*Last verification: Next turn*