---
name: ship-claim
version: 1.0.0
description: >
  Local verifier for cloud-agent completion claims. Mirrors AGENTS.md change protocol:
  recall prior lessons, run scoped proof commands, check protected components, emit
  PASS/FAIL with evidence only — never accept "done" without tool output.
tags:
  - verify
  - anti-hallucination
  - thumbgate
trigger: both
trigger-patterns:
  - "verify ship *"
  - "verify claim *"
  - "ship-claim *"
  - "did it really *"
user-invocable: true
argument-hint: "--claim <text> [--scope repo-root|hermes-mobile|docs-only] [--task <context>]"
parameters:
  claim:
    type: String
    required: true
    hint: "What the cloud agent claimed (e.g. 'CI passed', 'tests green', 'Firebase shipped')"
  scope:
    type: String
    required: false
    default: repo-root
    enum: [repo-root, hermes-mobile, docs-only]
  task:
    type: String
    required: false
    default: ""
    hint: "Extra context for ThumbGate recall (file paths, workflow name, symptom)"
constraints:
  inline:
    - "Never emit Done, Shipped, or All clean unless a proof script exited 0 in this run."
    - "If evidence contradicts the claim, verdict is FAIL — do not hedge."
    - "If you were wrong earlier, call mcp__thumbgate__capture_memory_feedback with signal=down."
    - "Never write secrets to tracked files; refuse pasted credentials."
    - "Hard-to-reverse actions (force push, mass delete) require explicit human approval."
steps:
  - id: recall-lessons
    file: steps/01-recall-lessons.md
    gate: None

  - id: pre-flight
    requires: [recall-lessons]
    inline-prompt: >
      Restate the claim in one sentence, then list what observable proof would falsify it.
      Do not verify yet — only define the falsification criteria.
    script: scripts/pre-flight.sh
    gate: None
    output: falsification_criteria

  - id: run-proof
    requires: [pre-flight]
    file: steps/02-verify-claim.md
    script: scripts/run-scope-verify.sh
    gate: None
    output: proof_output

  - id: protected-components
    requires: [run-proof]
    script: scripts/verify-protected.sh
    gate: None
    output: protected_status

  - id: verdict
    requires: [protected-components]
    file: steps/03-verdict.md
    gate: Review
    output: verdict

  - id: capture-lesson
    requires: [verdict]
    inline-prompt: >
      If verdict is FAIL, or recall returned a capture-gap for this task, call
      mcp__thumbgate__capture_memory_feedback with signal=down. Include: date,
      claim, actual proof output, root cause, and heuristic update. If PASS with
      nothing new learned, say "no capture needed" and stop.
    gate: Confirm
---

# Ship-claim verifier

You are the **local fact-checker**, not the implementer. Cloud agents (Cursor, Claude Code)
propose patches and often over-claim. Your job is to **prove or disprove** the claim using
shell output, git state, and ThumbGate recall — not reasoning from memory.

Repo: `mac-yolo-safeguards`. Canonical rules: `AGENTS.md`.

When proof scripts fail, verdict is **FAIL** even if the claim sounds plausible.
