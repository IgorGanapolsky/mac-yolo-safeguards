# hermes-yolo P0 harness (2026-08-03)

High-ROI controls from the Aug 2026 harness research + DeepSeek V4-Flash open-weights note.

## What changed

| Control | Behavior |
|---------|----------|
| **Slim toolsets** | Default: `terminal,file,web,code_execution,memory,clarify` (no `computer_use`/`vision`) |
| **Capability registry** | `MODEL_CAPABILITY_REGISTRY` + fail-closed spawn if model is not `agent_capable` |
| **Fleet route** | Z_AI / OpenRouter keys → `custom:litellm-gateway` + `glm-coding` (not raw z.ai-only) |
| **DeepSeek V4-Flash** | Marked `agent_capable`; LiteLLM alias + coding fallback rung (hermes-eval config) |
| **Tool budget** | `fingerprintCommand` + `createToolBudget` (identical timeout → blocked) |
| **Heartbeats** | One-shot runs print `still working… Ns` every 15s (`HERMES_YOLO_HEARTBEAT_MS`) |
| **Receipts** | `hermes-yolo/route-receipt-v2` with `runId`, `requestedModel`/`actualModel`, `agentCapable`, `toolsets` |
| **Kill tree** | One-shot spawn `detached`; timeout kills process group |

## Env knobs

| Env | Default | Purpose |
|-----|---------|---------|
| `HERMES_YOLO_TOOLSETS` | slim list | Opt in computer_use/vision when needed |
| `HERMES_YOLO_FAIL_CLOSED` | on (`!=0`) | Block non-agent models at spawn |
| `HERMES_YOLO_ALLOW_WEAK_MODEL` | off | Allow qwen2.5:3b etc. |
| `HERMES_YOLO_MAX_IDENTICAL_TOOL_RETRIES` | 1 | Identical-command thrash stop |
| `HERMES_YOLO_MAX_TOOL_CALLS` | 200 | Per-run tool budget |
| `HERMES_YOLO_HEARTBEAT_MS` | 15000 | One-shot liveness |
| `HERMES_YOLO_PROGRESS` | on | Heartbeats / done line |

## Verify

```bash
node tests/test-hermes-yolo.js
# expect: All tests passed
```

LiteLLM (hermes-eval): restart `com.igor.hermes-litellm` after config change so `deepseek-v4-flash` is live.
