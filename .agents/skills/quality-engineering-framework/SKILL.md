---
name: quality-engineering-framework
description: Treats LLM output quality as an engineering problem (specification, schema validation, precision context curation, few-shot gold standards, multi-stage pipelines, deterministic evals, and capped repair loops) rather than vibe prompting.
---

# Quality Engineering Framework & Anti-Slop Protocol

Implements the engineering approach to LLM output quality across ThumbGate and Hermes multi-agent fleets.

## Core Pillars

1. **Structured Output Contracts**
   - Every agent deliverable must fulfill explicit headers: `Role`, `Goal`, `Requirements`, `Definition of Done`.
   - Conversational slop (e.g. "Sure, I'd be happy to help", "As an AI language model...") is programmatically detected and stripped.

2. **Precision Context Curation**
   - Curates authoritative context spans, strips noise/internal stack traces, and enforces token budget limits.

3. **Few-Shot Invariant Promotion**
   - Pulls Gold-Standard and Negative Anti-Pattern pairs from ThumbGate lessons into agent session context.

4. **Deterministic Evaluation & Targeted Repair Loop**
   - Tests and validates deliverables against deterministic test suites before any completion claim.
   - Applies targeted diff repairs capped at a maximum of 2 attempts.

## Usage & Verification

```bash
# Doctor & Readiness Check
bin/quality-gate --doctor

# Run Automated Test Suite
node tests/test-quality-engineering-harness.js

# Evaluate Text / Output String
bin/quality-gate --eval "Your text here"
```
