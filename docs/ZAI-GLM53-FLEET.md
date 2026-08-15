# GLM-5.3 fleet (Coding Plan first, $10/mo API cap)

Z.AI email 2026-08-14 + docs.z.ai/guides/llm/glm-5.3 (verified 2026-08-15):

- GLM-5.3 is live for **GLM Coding Plan** subscribers.
- `glm-5.2` / `glm-5.1` requests on the coding host **auto-route to GLM-5.3**.
- The metered `https://api.z.ai/api/paas/v4` GLM-5.3 API is **coming soon**.
- Thinking stays **enabled**. Effort is `low` | `high` | `max`.

## Default vs paid

| Route | Host | Marginal token $ | When |
|-------|------|------------------|------|
| Coding Plan (default) | `https://api.z.ai/api/coding/paas/v4` | $0 (subscription credits) | Hermes, hermes-yolo `glm-coding`, OpenCode, Cline |
| Metered Z.AI | `https://api.z.ai/api/paas/v4` | billed | only if `checkGate` allows, under $10/mo |
| OpenRouter `z-ai/glm-5.3` | openrouter.ai | ~$0.90/$2.80 per M | same $10/mo ledger |

Ledger: `~/.hermes/zai-api-monthly-spend.json` (override `ZAI_API_SPEND_FILE`).
Fail closed at **$10.00/month**. Coding Plan spend is **not** written there.

## Commands

```bash
bin/zai-glm53 doctor --json
bin/zai-glm53 install
bin/zai-glm53 system --json         # launchd + zshrc + OpenCode provider
bin/zai-glm53 cyber "security audit" --json
bin/zai-glm53 probe --json          # live Coding Plan; never prints the key
bin/zai-glm53 probe-gateway --json  # :4010 glm-coding
bin/zai-glm53 budget --json
```

## System-wide (this Mac, user domain)

| Surface | What is set |
|---------|-------------|
| `com.igor.zai-glm53-env` | `HERMES_TOKEN_BUDGET_USD=10`, `HERMES_GLM_MODEL=glm-5.3`, `HERMES_PREFER_GLM53_CYBER=1` |
| `~/.zshrc` / `~/.zprofile` | same exports (marked block, idempotent) |
| OpenCode | adds `provider.hermes` → `:4010` `glm-5.3` / `glm-coding`; does **not** change the default model |
| hermes-yolo policy | cyber/audit tasks → `glm-coding` only when `HERMES_PREFER_GLM53_CYBER=1` |

SuperGrok stays the default interactive coder. GLM-5.3 is the CyberGym / audit rail (SCMP 2026-08-14) on the already-paid Coding Plan.

## Proof

- Offline: `node tests/test-zai-glm53-fleet.js`
- Live: `LIVE_OK` from `probe` with served model containing `glm-5.3` **or** a `glm-5.2` request that auto-routes
- Dangerous alias: `zai-coding-glm53` must **not** point at `/api/paas/v4`

## LiteLLM

Isolated `hermes-eval` change adds a `glm-5.3` alias on the coding host and forces
`extra_body.thinking.type=enabled` on `glm-coding`. The live `com.igor.hermes-litellm`
tree is not edited from this PR (dirty sibling branch). Coding Plan auto-route
covers `openai/glm-5.2` until that PR lands.
