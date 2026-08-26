---
name: bytedance-seed-yolo
description: >
  ByteDance Seed catalog steal for hermes-yolo: cheapest live OpenRouter Seed
  (1.6-flash / 2.0-mini) by default; Seed 2.1 Turbo only with --paid-ok.
  $10/mo fail-closed. Coding stays glm-coding. Not Seedance video. Slash:
  /bytedance-seed-yolo.
---
# ByteDance Seed for hermes-yolo

Source: https://seed.bytedance.com/en/direction/llm (Seed2.1 agent + Seed2.0 multimodal).

Complementary to GH #2117 / AGENT-542 (Codex owns the wrapper) and to
`seed-yolo-wrapper.js` (already-released launcher). This leaf is catalog policy.

```bash
node tools/bytedance-seed-yolo-router.js --task "describe this screenshot" --json
node tools/hermes-yolo-cheap-router.js --task "use granite for this agentic multi-step tool call" --json
node tests/test-bytedance-seed-yolo-router.js
node tests/test-hermes-yolo-cheap-router.js
```

## NEVER / ALWAYS

| NEVER | ALWAYS |
|-------|--------|
| Auto-route `implement` to Seed 2.1 Turbo ($0.50/$2.50 per M) | `glm-coding` quality lock |
| Treat Turbo as "very low pay" | Default 1.6-flash / 2.0-mini |
| Clone Seedance video SKU | Text/multimodal catalog routing only |
| Edit `hermes-yolo-wrapper.js` / `hermes-yolo-smart-router.js` | Leave AGENT-542 files alone |
| Spend without budget file | Fail closed to glm-coding |

Dynamic combiner `tools/hermes-yolo-cheap-router.js`: sensitive→local; coding→glm; multimodal/seed→cheap Seed; granite/reason→Granite 4.1-8b.
