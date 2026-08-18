---
name: openai-ultrafast-policy
description: Route latency-critical, high-value work to OpenAI GPT-5.6 Sol Ultrafast only when preview access, contracted pricing, exact server-tier proof, and the shared $10 monthly API ceiling are all satisfied. Use when a user mentions OpenAI Ultrafast, Cerebras-backed Sol, real-time incident response, live support or voice, urgent fraud or transaction review, checkout recovery, or interactive research where latency materially changes the outcome.
---

# OpenAI Ultrafast Policy

Use the deterministic `ultrafast-yolo` command. Treat Ultrafast as an access-controlled API preview, not a model name or a synonym for Fast/Priority.

## Workflow

1. Run `ultrafast-yolo doctor --json`.
2. If `ready` is false, keep the task on its existing subscription or local route. Do not ask for or expose a key; the command checks environment, the Hermes env file, and Keychain without printing values.
3. Run `ultrafast-yolo route --json --prompt "<task>"`. Only `latency-critical-high-value` work is eligible. Sensitive work stays local.
4. Run `ultrafast-yolo probe --json` only when the doctor shows an API key, contracted input/output rates, and available shared budget.
5. Run `ultrafast-yolo run --json --prompt "<task>" --max-output-tokens <n>` only after the same gates pass.
6. Claim Ultrafast execution only when the receipt has `exactServerTierConfirmed: true` and `serviceTier: "ultrafast"` from the server response.

## Hard rules

- Never use ChatGPT or Codex OAuth tokens as `OPENAI_API_KEY`.
- Never invent Ultrafast pricing. The preview requires `OPENAI_ULTRAFAST_INPUT_USD_PER_M` and `OPENAI_ULTRAFAST_OUTPUT_USD_PER_M` from the account's contract.
- Never set Ultrafast globally for ordinary traffic. Restrict it to urgent, high-value interactive work.
- Never bypass a failed reservation. The command aggregates tracked OpenRouter, GLM, and Ultrafast spend under one $10 monthly ceiling and fails closed on lock contention.
- Never store prompt text in receipts. Receipts contain only a SHA-256 prompt fingerprint and provider evidence.
- A successful response on `default`, `fast`, or `priority` is not Ultrafast proof.

## Exit meanings

- `0`: exact confirmed execution or a non-mutating route report.
- `2`: doctor is intentionally not ready.
- `69`: the API returned a non-Ultrafast tier; spend is recorded, but the proof claim fails.
- `78`: policy, credential, pricing, eligibility, or budget gate blocked the call before success.
