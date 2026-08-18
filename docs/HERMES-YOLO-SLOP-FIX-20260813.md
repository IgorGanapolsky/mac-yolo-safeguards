# hermes-yolo anti-slop / gibberish fix (2026-08-13)

## Symptom
Hermes/yolo sessions produced bot-slop, empty reasoning scrap, or multi-minute
timeouts. Screenshot showed `qwen3.5:9b-hermes-64k` on Ollama at 63k/65k ctx.

## Root causes
1. LaunchAgent + `~/.hermes/.env` pinned `HERMES_YOLO_MODEL=deepseek-v4-flash`
   (OpenCode free flash) — often empty/slop answers under tool load.
2. Hermes `fallback_providers` / `fallback_model` → Ollama qwen on primary
   failure (silent downgrade).
3. Bloated sessions (>48k tokens) blocked compression and hung the local model.

## Fix
| Layer | Change |
|-------|--------|
| `hermes-yolo-wrapper.js` | Upgrade free flash / ollama primaries to `glm-coding`; quality lock; anti-slop `DIRECT_RESPONSE_RULES` |
| `~/.hermes/config.yaml` | `model.default=glm-coding`; empty `fallback_providers` |
| `~/.hermes/.env` | `HERMES_YOLO_MODEL=glm-coding` |
| LaunchAgent `com.igor.hermes-yolo-route` | setenv glm-coding |

## Verify
```bash
node tests/test-hermes-yolo.js
hermes-yolo --route-status   # legacyModel=glm-coding
HERMES_YOLO_NO_PREFLIGHT=1 hermes-yolo -z 'Reply with exactly one line: HERMES_YOLO_QUALITY_OK glm-coding'
```

Restart stale hermes-yolo panes (`/new` or kill PID) — do not continue 63k qwen sessions.
