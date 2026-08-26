---
name: cli-ide-verify
description: >
  The New Stack CLI/IDE verification FORMAT: treat agent output as a proposal,
  grade four review questions locally, keep CI as a backstop. Not SonarQube.
  Complementary to Codex #2126 receipts (those need Linear + SHA). Slash: /cli-ide-verify.
---
# CLI/IDE local proposal verify

Produce a same-environment grade for whom: Grok/Codex/Claude agents about to
open a PR — not a Sonar SKU and not a post-merge CI wait.

## Goal

Answer four questions on a **local proposal** (no SHA required) so a polished
diff cannot move forward without tests.

## Constraints

NEVER clone SonarQube / Sonar CLI / Sonar MCP / agent plugins.
NEVER dual-edit `tools/coding-context-pack.js` or `tools/context-vault.js` (Codex #2126 / AGENT-544).
ALWAYS treat agent output as a proposal. HARD fail closed on CI-as-first-line and curl-as-LIVE.
REFUSE `agent-verification-receipt/v1` here — that schema belongs to #2126.

## Reference

- https://thenewstack.io/cli-ide-ai-verification/
- Codex receipts: PR #2126 `tools/coding-context-pack.js` (read-only)
- `tools/codeql-pattern-gate.js` · `tools/ci-first-fail.js` · AGENTS.md · CHIEF.md
- [[coding-context-pack]] · [[context-six-block]]

## Examples (show, don't tell)

Weak: The agent showed a clean diff, so ship it.

Gold:

```bash
$ node tools/cli-ide-verify.js --demo --json
$ node tests/test-cli-ide-verify.js
```

A passing unit run on ubuntu-latest does not prove the local proposal layer ran first.

## Procedures

1. Grade the proposal before `git commit` / PR
2. Keep CI as backstop (`ciAsFirstLine` must be false)
3. Hand SHA+Linear receipts to #2126 `--verify-receipt` after the commit exists

```bash
node tests/test-cli-ide-verify.js
node tools/cli-ide-verify.js --demo --json
```

## Rubric

- demo proposal → ok=true, surfaces cli+ide, liveClaim=false
- empty tests + hasDiff → polished_diff_not_proof
- ciAsFirstLine true → ci_is_backstop
- curl liveClaim → curl_is_not_live
- `agent-verification-receipt/v1` input → dual_edit_codex_receipt
- doctor_exit=0
- evidence: test-cli-ide-verify PASS; dualEditCodexContextContract2126=false
