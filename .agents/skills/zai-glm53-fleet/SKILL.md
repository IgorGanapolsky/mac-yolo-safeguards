---
name: zai-glm53-fleet
description: >
  Wire Z.AI GLM-5.3 across Hermes, hermes-yolo, LiteLLM :4010, Claude Code / Cline /
  OpenCode. Default is the GLM Coding Plan ($0 tokens; 5.2 auto-routes to 5.3).
  Metered /api/paas/v4 and OpenRouter z-ai/glm-5.3 are fail-closed at $10/mo.
  Trigger: GLM-5.3, z.ai, coding plan, glm-coding, $10 token budget, thinking mode.
---

# GLM-5.3 fleet

Official (2026-08-15): GLM-5.3 is live on the **Coding Plan**. The metered API is
still “coming soon.” Requests for `glm-5.2` / `glm-5.1` on the coding host auto-route
to 5.3.

```bash
bin/zai-glm53 doctor --json
bin/zai-glm53 install
bin/zai-glm53 probe --json
bin/zai-glm53 budget --json
```

## Hard rules

| Never | Always |
|-------|--------|
| Default to `https://api.z.ai/api/paas/v4` | `https://api.z.ai/api/coding/paas/v4` |
| Count Coding Plan tokens against the $10 cap | Cap only metered API + OpenRouter `z-ai/glm-5.3` |
| Send `thinking.type=disabled` to 5.3 | `thinking.type=enabled` + `reasoning_effort` low\|high\|max |
| Print `Z_AI_API_KEY` | Key stays in `~/.hermes/.env` / Keychain |
| Hijack Claude Code off Anthropic | Write `~/.hermes/glm53-claude.env`; mutate settings only if already on z.ai |

## Smart effort

- **low** — summaries, routing, routine
- **high** — code / fix / implement / debug (default for agent work)
- **max** — architecture, security, audit, cyber

## Harnesses

- Hermes `zai-coding-glm` / `zai-coding-glm53` → coding URL, model `glm-5.3`
- `hermes-yolo` → `HERMES_YOLO_MODEL=glm-coding` via LiteLLM `:4010` (5.2 id auto-routes)
- Metered alias `zai-glm53-metered` is budget-gated, never default
- Claude / Cline / OpenCode: source `~/.hermes/glm53-claude.env` (`glm-5.3[1m]`)

Docs: `docs/ZAI-GLM53-FLEET.md`
