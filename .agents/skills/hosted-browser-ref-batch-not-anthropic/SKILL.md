---
name: hosted-browser-ref-batch-not-anthropic
description: >
  Anthropic Browser Use process steal for thumbgate.app: executor hosts the
  browser, accessibility refs replace x,y pixels, ordered batch fail-stop
  including mid-batch approval. Never clone browser_toolset_20260801.
  Complementary to PR #2037. Slash: /hosted-browser-ref-batch-not-anthropic.
---

# Hosted browser ref-batch — not Anthropic Browser Use

Source: https://thenewstack.io/anthropic-browser-use-tool/

Anthropic’s tool does **not** run a browser. The application does.
Hosted Hermes is **$10/mo fenced VPS chat**, not Computer Use.

Hybrid routing / SSRF / 31-member guard are **other PRs**. Do not dual-edit
`apps/hermes-control-plane/lib/browser-guard/**` (PR #2037) or
`hosted-tool-approvals.ts` / `ssrf-guard.ts` (PR #2020).

```bash
node tools/hosted-browser-ref-batch.js --honesty --json
node tools/hosted-browser-ref-batch.js --act '{"op":"left_click","x":640,"y":320}' --json
node tests/test-hosted-browser-ref-batch.js
```

## Steal

1. Refs (`ref_3`) replace screenshot coordinates (`x:640,y:320`).
2. Stale refs after navigate → deny + `requireReadPage`.
3. Batch is ordered fail-stop; confirm/deny skips the rest.

## NEVER / ALWAYS

| NEVER | ALWAYS |
| --- | --- |
| Clone 27-op toolset (~6600 tokens) | Subset: read_page / click / type / navigate |
| Pixel clicks | `coords_not_refs` |
| Keep executing after a failed click | `skippedCount` |
| Anthropic hosts our browser | `weHostTheBrowser: true` |
| Dual-edit PR #2037 / #2020 | Complement |
| Hero Continuity / $499 | Hosted VPS $10; ECI pause |
