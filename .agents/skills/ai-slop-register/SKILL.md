---
name: ai-slop-register
description: AI Slop Register & Engineering Taste Engine. Categorizes review feedback into 3 buckets (45% deterministic, 30% execution-testable, 25% taste/judgment), codifies patterns into institutional memory, and blocks regressions before review.
---

# AI Slop Register & Engineering Taste Engine Skill

Implements the core breakthroughs from The New Stack (*"Code review is a taste problem"* - Aviator / GitHub):
1. **Closing the Review Loop**: Automatically transforms human review comments into codified, automated PreToolUse prevention gates.
2. **3-Way Feedback Split**:
   - `45% Deterministic`: Codified into AST / Regex pattern gates.
   - `30% Execution-Testable`: Codified into automated unit/E2E test assertions.
   - `25% Genuine Taste & Judgment`: Evaluated via Output Contracts and human Guardian review.
3. **Intent-First Review**: Reviews 8 lines of acceptance criteria rather than 600-line diffs.

## Global System Commands

- **`bin/slop-register --doctor`**: Probes register health and codified rule counts.
- **`bin/slop-register --classify "<comment>"`**: Classifies a review comment into its proper bucket and codifies it.

## Verification

```bash
# Doctor Status Check
bin/slop-register --doctor

# Run Automated Test Suite
node tests/test-taste-and-slop-register.js
```
