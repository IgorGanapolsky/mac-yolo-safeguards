# Kimi K3 fleet note (July 2026)

**Source signal:** [Threads @vaibhavsisinty](https://www.threads.com/@vaibhavsisinty/post/DbTU_Tsms1S) —
“Kimi K3 is now open source… 2.8T params, 1M context, full stack.”

**Product docs:** [Kimi K3 quickstart](https://platform.kimi.ai/docs/guide/kimi-k3-quickstart) ·
weights [moonshotai/Kimi-K3](https://huggingface.co/moonshotai/Kimi-K3)

## How this improves Hermes workflow (honest ROI)

| Claim | Hermes action | ROI |
|-------|---------------|-----|
| Open-source 2.8T | **Do not** download weights to Mac Pro/mini | Avoids multi-node disk/RAM thrash; keeps fleet usable |
| 1M context | Wire API aliases `kimi-k3` / `kimi-code-k3` on LiteLLM `:4010` | Long-horizon agent jobs when billing allows |
| Full stack (kernels, MoE, agents) | Stay on Moonshot/Kimi Code APIs + existing Hermes harness | No new runtime to own until inference partners ship |
| Social “switch everything to K3” | Audit refuses primary promotion on hype | Prevents spend + reliability regressions |

**Primary stays `glm-coding`.** K2.7 Code remains the recommended **coding fallback**. K3 is **opt-in by model name only**.

## Gateway routes (Pro + mini)

In `hermes-eval/litellm/config.yaml` (synced dual-host):

| Alias | Upstream | Key | Notes |
|-------|----------|-----|-------|
| `kimi-k3` | `api.moonshot.ai` model `kimi-k3` | `MOONSHOT_API_KEY` | Per-token ~$3/$15 per M; needs balance |
| `kimi-code-k3` | `api.kimi.com/coding` model `k3` | `KIMI_CODE_API_KEY` | Membership; quota-capped |
| `kimi-code-k3-256k` | same, model `k3-256k` | `KIMI_CODE_API_KEY` | Smaller window membership SKU |

```bash
# list
curl -s http://127.0.0.1:4010/v1/models | jq '.data[].id' | rg kimi

# audit (config + gateway)
node tools/kimi-model-upgrade-audit.js --json
```

## Verified 2026-07-28 (Pro + mini)

- Gateway lists: `kimi-k3`, `kimi-code-k3`, `kimi-code-k3-256k` on both hosts after config sync + LiteLLM restart.
- Completions currently **blocked by billing**, not wiring:
  - Moonshot: account suspended / insufficient balance
  - Kimi Code: usage limit for billing cycle
- Unblock: top-up Moonshot (≥$1 for K3 unlock) **or** wait/upgrade Kimi Code quota — then re-smoke:

```bash
curl -s http://127.0.0.1:4010/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"kimi-code-k3","messages":[{"role":"user","content":"ping"}],"max_tokens":8}'
```

## Anti-patterns

1. Replacing fleet primary because a Threads post said “open source.”
2. Pulling multi-TB MoE weights onto a laptop “to try.”
3. Putting `kimi-k3` in auto-fallback while keys are suspended (silent spend thrash after top-up).
