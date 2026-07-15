# Nemotron fleet setup (both Macs)

**Status (2026-07-15):** Live on **MacBook Pro** and **Mac mini** (`100.94.135.78`).

Private receipt (mode `0600`, not in git):

```text
~/.hermes/receipts/nemotron-fleet-setup-latest.json
```

Source narrative: [NVIDIA — open models for trust, control, customize](https://blogs.nvidia.com/blog/nemotron-open-models-ai-trust-control-customize/).

## What is wired

| LiteLLM model name | Backend | Cost | Role |
|---|---|---|---|
| `nemotron3-free` | OpenRouter `nvidia/nemotron-3-ultra-550b-a55b:free` | **$0** free tier | Auto-fallback after `glm-coding` (fails hard vs degraded local) |
| `nemotron` | NVIDIA NIM `nvidia/llama-3.3-nemotron-super-49b-v1.5` | **Per-token** | Opt-in only (`model: "nemotron"`) — **not** in auto-fallback |

Config lives in `hermes-eval/litellm/config.yaml` (per Mac checkout). Proxy: LaunchAgent `com.igor.hermes-litellm` → `:4010`.

### Safe auto-fallback chain (both Macs)

```text
glm-coding → nemotron3-free → hermes-local
```

Paid routes (`cloud-fallback`, metered `nemotron` NIM) stay **manual / opt-in**. This avoids the OpenRouter + NIM silent-spend class of failures.

## Keys (names only)

Both Macs must have in `~/.hermes/.env` (never commit):

- `NVIDIA_API_KEY` — NIM `nemotron`
- `OPENROUTER_API_KEY` — `nemotron3-free` and other OpenRouter routes
- `Z_AI_API_KEY` — primary `glm-coding` subscription

`start-proxy.sh` exports these into the LiteLLM process.

## Smoke (agent-run proof)

```bash
# health
curl -sS http://127.0.0.1:4010/health/liveliness

# free Ultra path
curl -sS http://127.0.0.1:4010/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"nemotron3-free","messages":[{"role":"user","content":"Reply with exactly: NEMO-OK"}],"max_tokens":128,"temperature":0}'

# paid NIM Super (opt-in)
curl -sS http://127.0.0.1:4010/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"nemotron","messages":[{"role":"user","content":"Reply with exactly: NEMO-OK"}],"max_tokens":256,"temperature":0}'
```

2026-07-15 verification: both hosts returned `NEMO-OK` for both models; free path reported `cost: 0`.

## Operator policy (mac-yolo-safeguards)

- **Do not** make Nemotron the default `hermes-yolo` interactive brain.
- Economic router keeps `nemotron3_ultra_escalation` as an **approval-gated candidate** — see [HERMES-ECONOMIC-ROUTER.md](./HERMES-ECONOMIC-ROUTER.md).
- All-Macs readiness matrix: `node tools/hermes-all-macs-setup.js --hosts 100.94.135.78 --write --json`
- Token-burn lesson: never run long Nemotron sessions with dead tools + huge pinned context (mini 833k incident).

## Mini repair notes (this setup)

If mini `:4010` is down:

1. Confirm `~/Library/LaunchAgents/com.igor.hermes-litellm.plist` exists and sets `LITELLM_BIN` to the real UV tool binary (not only the zero-spend shim).
2. `launchctl load -w ~/Library/LaunchAgents/com.igor.hermes-litellm.plist`
3. Prefer the **safe fallback chain** above — do not reintroduce paid `cloud-fallback` / metered `nemotron` into auto fallbacks.

## Related

- [HERMES-ALL-MACS-SETUP.md](./HERMES-ALL-MACS-SETUP.md)
- [HERMES-ECONOMIC-ROUTER.md](./HERMES-ECONOMIC-ROUTER.md)
- [HERMES-ZERO-SPEND.md](./HERMES-ZERO-SPEND.md)
