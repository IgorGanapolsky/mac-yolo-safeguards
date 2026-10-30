---
name: prompt-caching-and-judgment-calls-steal
description: "Use when optimizing LLM KV-cache hit rates via strict static-first prefix ordering and cache-buster sanitization (The Sequence Knowledge) or guarding human-in-the-loop judgment calls against the 86% blind deferral rate and 91% single-model mode collapse discovered in Anthropic's 'How AI Agents Shape Experts' Judgment Calls' (Oct 27, 2026)."
---

# Prompt Caching (`The Sequence Knowledge`) + Agent Judgment Calls (`Anthropic Research` Oct 27, 2026)

## 1. How Prompt Caching Actually Works (`The Sequence Knowledge`)
- **Strict Left-to-Right Prefix Hash Invariant**: LLM inference engines cache KV tensors in fixed blocks (`128` or `1024` tokens) from token `0` forward. A single changed token at index $k$ invalidates **100% of cached KV blocks after index $k$**.
- **5-Layer Static-First Ordering (`CANONICAL_LAYER_ORDER`)**:
  1. `system_instructions` (100% static)
  2. `sorted_tool_schemas` (MCP tools sorted deterministically by `name`)
  3. `repo_skills_context` (`AGENTS.md`, `SKILL.md`)
  4. `block_aligned_history` (snapped to `1024`-token boundaries)
  5. `dynamic_user_turn` (the ONLY place where timestamps, UUIDs, or live metrics belong)
- **Savings**: `85.3%` lower input token spend across 20-turn coding sessions (`93.4%` KV-cache hit ratio).

## 2. How AI Agents Shape Experts' Judgment Calls (`anthropic.com/research/agents-judgment-calls`, Oct 27, 2026)
- **Empirical Findings ($n = 61$ causal-inference experts using Claude Code / Opus 4.8)**:
  - **86% Blind Deferral**: Experts chose the option their agent was randomly assigned to favor **86% of the time** (shifting choices by `62–82` percentage points).
  - **60% Prior-Flip Rate**: When experts stated a preference *before* the agent weighed in, **60% abandoned their own view** when the agent disagreed.
  - **77% Uncredited Verbatim Copying & 91.1% Unsteered Mode Collapse**: 77% repeated the agent's arguments word-for-word (only 15% credited the agent), and unsteered Claude Opus 4.8 chose the exact same 5 options in `112/123` (`91.1%`) runs.
  - **6% vs. 55% Serious Error Rate**: Experts using the agent made **9x fewer serious methodological errors** (`6%` vs `55%`) and finished **28% faster** (`65m` vs `90m`).
- **Our 3 Mitigations in `tools/prompt-caching-and-judgment-calls-steal.js`**:
  1. **`evaluateJudgmentCallSteelmanGate`**: Requires equal-strength **Option A & Option B steelman arguments + quantitative `sensitivityDelta`** before recommending a default on any open-ended judgment call.
  2. **Provenance Attribution (`human_prior` | `agent_default_lean` | `dual_steelman_choice`)**: Prevents agent defaults from masquerading as independent human sign-off.
  3. **`auditJudgmentDeferralAndModeCollapse`**: Flags when human deferral exceeds `80%` without dual-steelman disclosure.

## Quick Commands

```bash
node tools/prompt-caching-and-judgment-calls-steal.js
node tests/test-prompt-caching-and-judgment-calls-steal.js
```
