---
name: local-media-lane
description: >
  AMD local-ai-use pattern adapted for Apple Silicon: route image/TTS/STT to
  local Lemonade or Ollama when healthy; never claim local media without probe.
  Chat stays on Hermes economic router. Trigger: local image, local tts, local
  stt, lemonade, cut media token cost, multimodal local. Slash: /local-media-lane.
---

# Local media lane (AMD local-ai-use adapted)

## Do / don't

| Do | Don't |
|----|--------|
| Probe before claiming local ready | Install ROCm / Instinct skills on M5 Mac by default |
| Prefer Lemonade (`:13305`) for image/TTS/STT | Hijack chat routing away from Hermes/LiteLLM |
| Fall back honestly if probe fails | Pretend Whisper/DALL·E are free when nothing is listening |

## Classify + decide

```bash
node tools/local-media-route.js classify --task "generate an image of X"
node tools/local-media-route.js probe
node tools/local-media-route.js decide --task "transcribe this recording"
node tests/test-local-media-route.js
```

## Setup (optional)

1. Install [Lemonade Server](https://lemonade-server.ai) (macOS beta) **or** rely on Ollama for non-image audio experiments.  
2. Confirm probe JSON shows `lemonade.ok` or `ollama.ok`.  
3. Pull models lazily on first use (skill does not pre-download multi-GB weights).

## Product mapping

- **Chat / code:** `tools/hermes-economic-router.js` + hybrid policy  
- **Media:** this skill + `tools/local-media-route.js`  
- **Hardware:** Apple Silicon OK; AMD Instinct skills remain out of scope here  
