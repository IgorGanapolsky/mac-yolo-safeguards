---
name: ibm-granite-yolo
description: >
  IBM Granite 4.2 steal for hermes-yolo: catalog-backed OpenRouter routing
  (free if listed, else very-low-pay 4.1-8b), thinking/low-effort/none modes,
  $10/mo fail-closed. Coding stays glm-coding. Not IBM Granite Cloud. Slash:
  /ibm-granite-yolo.
---
# IBM Granite for hermes-yolo

TNS 2026-08-25: Granite 4.2 is a dense reasoning family (3B/8B/30B), Apache 2.0,
thinking + low-effort + non-thinking. Coding is average — do **not** steal the
glm-coding quality lock.

Complementary to GH #2117 / AGENT-542 (Codex owns `hermes-yolo-wrapper.js` and
`tools/hermes-yolo-smart-router.js`). This leaf is the granite catalog + mode
policy those files can import.

```bash
node tools/ibm-granite-yolo-router.js --task "use granite to summarize this RFC" --json
node tools/ibm-granite-yolo-router.js --doctor --json
node tests/test-ibm-granite-yolo-router.js
```

## Steal

1. **Size by job** — 3B/micro for classify/smoke; 8B for reasoning/agentic; 30B only with `--paid-ok`.
2. **Thinking dial** — none / low-effort / thinking (maps to OpenRouter `reasoning`).
3. **Catalog is evidence** — never route to a Granite 4.2 OpenRouter id until that exact id is live.

## NEVER / ALWAYS

| NEVER | ALWAYS |
|-------|--------|
| Invent `ibm-granite/granite-4.2-*` as LIVE | Probe or inject catalog; `granite42OpenRouterLive` from exact ids |
| Auto-route `implement`/`fix bug` to Granite | `glm-coding` quality lock |
| Send secrets/PII to OpenRouter | `hermes-local` |
| Spend when `openrouter-monthly-spend.json` is missing or ≥ $10 | Fail closed to glm-coding |
| Edit `hermes-yolo-wrapper.js` | Leave AGENT-542's files alone |
| Pull 30B GGUF on 24GB Macs | Cheap OpenRouter 8B or local 8B after a resource gate (Codex) |

Live OpenRouter on 2026-08-26: `ibm-granite/granite-4.1-8b` ($0.05/$0.10 per M) and `ibm-granite/granite-4.0-h-micro`. No 4.2 yet. `liveClaim` stays false until 4.2 appears.

## Related

`/hermes-yolo-cost-autonomy` · `/hybrid-route-policy` · `/zai-glm53-fleet`
