# seed-yolo model lock (2026-08-13)

## Symptom

Herdr **seed** tab status bar showed `qwen3.5:9b-hermes-64k` via
`custom:ollama-local-64k` with multi-minute timeouts — not Seed.

## Root cause

1. Hermes global `fallback_providers` / legacy `fallback_model` pointed at
   Ollama `qwen3.5:9b-hermes-64k`.
2. OpenRouter Seed calls returned **HTTP 402** (credits exhausted / max_tokens
   too high for remaining balance).
3. Hermes silently fell back to the Ollama lane; the session kept that model.

## Fix

| Layer | Change |
|-------|--------|
| Launcher `tools/seed-yolo-wrapper.js` 3.3.0 | Default model `bytedance-seed/seed-2-1-turbo`; `assertSeedIdentity` refuses ollama/qwen; launches with `--profile seed` |
| Hermes profile `~/.hermes/profiles/seed` | `fallback_providers: []`, no `fallback_model`, provider openrouter, Seed default, max_tokens 4096 |
| Install | `~/.local/lib/seed-yolo/seed-yolo-wrapper.js` |

## Operator rule

If the status bar shows qwen/ollama: **exit** the session and start a **fresh**
`seed-yolo` (do not `/continue` the wrong-model session).

If OpenRouter returns 402: add credits at https://openrouter.ai/settings/credits
or lower `model.max_tokens` on the seed profile — **never** re-enable Ollama
fallback for seed.
