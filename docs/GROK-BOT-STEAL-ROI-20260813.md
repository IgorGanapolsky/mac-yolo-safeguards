# Grok Bot steal → fleet ROI (2026-08-13)

Source: [Grok Bot overview](https://docs.x.ai/grok-bot/overview) and linked pages
(skills/routines, computer, approvals, use cases).

## What we stole (and implemented)

| Pattern | Implementation |
|---------|----------------|
| Outcome-owned roles, draft-first | `.agents/skills/outcome-owned-agent-pattern/SKILL.md` |
| Skill six-field + routine trust design | `tools/outcome-routine-spec.js` |
| Fail closed on broad events / invent / stale | validator errors in same tool |
| Product-side Grok Bot autonomy | `~/.grok/skills/grok-bot-autonomy/` (global) |

## What we deliberately did **not** steal

- Rebuilding their cloud Agent Computer (we already ban hijacking Igor’s Chrome; use BrowserOS / Bot computer / APIs).
- Unlimited Auto-allow rules.
- Broad Slack/GitHub “every notification” listeners.
- Treating multi-bot roster as multi-tenant security.

## High-ROI use cases mapped to our stack

| Grok Bot use case | Our lane |
|-------------------|----------|
| Sales Outbound (draft) | Agency AHLS drafts — never auto-send |
| Bug Reproduction | Hermes QA brand-new user repro packs |
| Product Performance | Sentry + CI diagnose, no unsupervised prod change |
| Chief of Staff digest | Daily ops brief (mail drafts + PR/CI + Linear) |
| Account Health | Pipeline risk list from real TSVs — no invented CRM |

## Ladder

`live task → skill → second test → routine`  
Gate every consequential external action.

## Verify

```bash
node tests/test-outcome-routine-spec.js
node tools/outcome-routine-spec.js example
```
