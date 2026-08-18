---
name: local-ai-use-adapt
description: >
  Adapt AMD Skills' local-ai-use pattern to route image generation,
  text-to-speech, and speech-to-text through local AI servers to reduce
  token cost and improve privacy. Maps to ThumbGate.memory tier. Use when
  asked about local AI, local image, local TTS, local STT, or token reduction.
---

# Local AI Use (Adapted from AMD Skills)

## Purpose

Route AI workloads through local models to:
- Reduce token cost (like Grok's $12K-$60K per prompt)
- Improve privacy (no data leaving device)
- Enable offline capability

## Integration with ThumbGate

| AMD Pattern | Our Implementation |
|-------------|-------------------|
| Local AI server | ThumbGate.AgenticMemory |
| Router logic | MCP server: mcp__thumbgate__local_ai |
| Cost reduction | $10/mo Continuity + FREE Leash |

## Usage

```bash
# Check local AI compatibility
nodes/verify-local-ai.sh --check

# Route image gen locally
node tools/local-ai-router.js --image "prompt" --local

# Route TTS locally
node tools/local-ai-router.js --tts "text" --local
```

## Product Mapping

| Workload | Local Option | ThumbGate Integration |
|----------|--------------|----------------------|
| Image Generation | llama.cpp, Ollama | Continuity VPS with GPU passthrough |
| Text-to-Speech | Silero, Coqui | Agentic Memory + TTS MCP |
| Speech-to-Text | Whisper.cpp | Continuity + STT MCP |

## Truth Guardrails

- Local models: FREE (no token cost)
- Continuity VPS: $10/mo (for local server hosting)
- Leash approvals: FREE forever (for local model routing decisions)
- NEVER claim local AI is always faster (depends on hardware)

## Verification Required

- [ ] llama.cpp/ollama installed locally
- [ ] GPU detection script working
- [ ] Continuity VPS configured for local AI
- [ ] MCP server registration successful

## Reference

Adapted from AMD Skills' local-ai-use (MIT licensed)
Original: https://github.com/amd/skills/blob/main/skills/local-ai-use
