---
name: ai-native-sdlc
description: >
  High-ROI steal of Anthropic's AI-native SDLC playbook: committed artifact
  chain (intent.md → spec.md → plan.md → tests/diff → PR/REVIEW.md → incident
  draft), plan mode before code, fix-code-not-test, humans-only production
  gate. Maps onto AGENTS.md / plan.md / skills / worktrees. Never clone Claude
  Code evals, MDM, auto-quarantine, or Continuity. Slash: /ai-native-sdlc.
---

# AI-native SDLC (mechanics, not Claude Code)

Source: https://claude.com/blog/the-ai-native-sdlc-playbook (Louis Claxton, 2026-08-21)

```bash
node tools/ai-native-sdlc.js --health --json
node tools/ai-native-sdlc.js --catalog --json
node tools/ai-native-sdlc.js --audit --json
node tools/ai-native-sdlc.js --chain --json
node tools/ai-native-sdlc.js --gate --env production --command "wrangler deploy --env production" --json
node tools/ai-native-sdlc.js --fix-code-not-test --task bugfix --path tests/foo.js --json
node tests/test-ai-native-sdlc.js
```

| NEVER | ALWAYS |
|-------|--------|
| Clone Claude Code evals YAML / Anthropic API CI | Use existing `node tests/*.js` |
| MDM managed settings / Claude Tag | Skip those plays |
| Western Electric auto-quarantine SKU | Incident → `intent.md` **draft** only |
| Dual-edit `.intent/contract.yaml` | AGENT-407 owns Tieline contract |
| Hero Continuity / Mac-pair / RUN ON | Hosted VPS product lock |
| Claim production gate is wired | `productionGateWired: false` until a real hook exists |
| Weaken tests to make a fix pass | `--fix-code-not-test` |

Artifact chain: `intent/` → `spec/` → `plan.md` → tests/diff → `REVIEW.md` + GitHub PR → incident draft back to `intent/`.
`AGENTS.md` is the `CLAUDE.md` analog (`CLAUDE.md` is a pointer).
