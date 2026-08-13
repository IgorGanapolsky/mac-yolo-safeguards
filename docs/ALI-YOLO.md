# ali-yolo

Fail-closed launcher for **Alibaba ModelStudio Token Plan** via Hermes profile `ali`.

## What it is

| Field | Value |
|-------|--------|
| Engine | Hermes Agent |
| Profile | `ali` (`~/.hermes/profiles/ali`) |
| Provider | `custom:alibaba-token-plan` |
| Endpoint | `token-plan.ap-southeast-1.maas.aliyuncs.com` |
| Default model | `qwen3.8-max` |
| Auth | macOS Keychain service `ALIBABA_TOKEN_PLAN_API_KEY` |
| Fallback | **Never** (no OpenRouter / Ollama / local) |

## Install

```bash
bash scripts/install-ali-yolo.sh
ali-yolo doctor --json   # ok must be true, auth macos-keychain|present, fallback false
```

## Usage

```bash
ali-yolo
ali-yolo -z "Return exactly ALI_HERMES_OK. Do not use tools."
ali-yolo --models
ali-yolo --model qwen3.7-plus -z "Review the current diff."
```

## Fix history (2026-08-13)

Broken install used `openrouter/qwen/qwen-2.5-coder-32b-instruct` (32k — Hermes min 64k)
and never injected the Token Plan key from Keychain into the `ali` profile, causing
401s / "not working at all". Fixed by pinning Token Plan + Keychain inject + `--profile ali`.
