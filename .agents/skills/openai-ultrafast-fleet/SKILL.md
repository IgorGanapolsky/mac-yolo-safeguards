---
name: openai-ultrafast-fleet
description: >
  Persist OpenAI Ultrafast (GPT-5.6 Sol + service_tier=ultrafast, Cerebras preview)
  across shells, launchd, and agent harnesses as OPT-IN only. Hard $10/mo cap.
  Never default jcode-yolo or hermes-yolo to Sol. Complementary to ultrafast-yolo
  (exact server-tier proof). Trigger: Ultrafast, GPT-5.6 Sol, Cerebras 750 TPS,
  service_tier=ultrafast, $10 OpenAI budget.
---

# OpenAI Ultrafast fleet persist

Source: https://openai.com/index/previewing-ultrafast/ (2026-08-13)

Limited preview. GPT-5.6 Sol on `service_tier=ultrafast`, Cerebras-backed,
advertised up to 750 output TPS / ~14× Standard. Not a public general default.
No published Ultrafast list price — do not invent one.

```bash
ultrafast-fleet doctor --json
ultrafast-fleet route "implement a TypeScript API"
ultrafast-fleet apply --json          # persist $10 cap; default stays OFF
ultrafast-yolo doctor --json          # Codex policy: exact tier proof before spend
```

## Hard rules

| Never | Always |
|-------|--------|
| Default jcode/hermes-yolo to `gpt-5.6-sol` | SuperGrok / GLM-5.3 / Seed stay harness defaults |
| Set `JCODE_DEFAULT_PROVIDER=openai` | `OPENAI_ULTRAFAST_DEFAULT=0` |
| Claim `OPERATIONAL_750_TPS` without a server receipt | Persist env + route + $10 ledger only |
| Spend without remaining budget | Fail closed → `zai/glm-5.3` |
| Treat Fast/Priority as Ultrafast | `service_tier=ultrafast` from the **server** |
| Fire a live probe from this skill | Use `ultrafast-yolo` only after doctor + contracted rates |

## Routes

1. Sensitive (password, key, PII, medical) → local Ollama
2. Explicit Ultrafast / Sol / Cerebras (and urgent+high-value) → Sol **if** `$10` remains
3. Everything else → `zai/glm-5.3` Coding Plan ($0 marginal)

## Persist surfaces

- `~/.zshrc` / `~/.zprofile` marked block
- LaunchAgent `com.igor.openai-ultrafast-env`
- `~/.hermes/openai-ultrafast.env` (no secrets)
- `~/.hermes/openai-ultrafast-spend.json` ($10 ledger)
- `~/.local/bin/ultrafast-fleet`

Does not edit Codex `tools/openai-ultrafast-policy.js` or `bin/ultrafast-yolo`.
