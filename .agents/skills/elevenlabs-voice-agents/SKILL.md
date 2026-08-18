---
name: elevenlabs-voice-agents
description: ElevenLabs Hosted MCP Voice Agents, Conversational AI Engine, Multi-LLM Cost Estimator & ThumbGate Pre-Action Interdiction Suite for all coding agents on Igor's Mac.
---

# ElevenLabs Conversational Voice Agents & ThumbGate Governance Suite

This skill implements the ElevenLabs Hosted MCP Connector pattern for voice agents (**ElevenAgents**), enabling AI coding assistants to configure, simulate, version, and govern production voice agents as code while enforcing ThumbGate pre-action safety guardrails.

## Capabilities

1. **Voice-Agent-as-Code (GitOps)**:
   - Export and version voice agent configurations (system prompts, voice IDs, latency profiles, initial greetings, language targets) as declarative YAML/JSON.
   - Synchronize configurations between git repositories and ElevenLabs workspaces via automated pipelines.

2. **Pre-Deployment Multi-LLM Cost Estimator**:
   - Compares expected inference cost per conversation minute across foundation models:
     - **Gemini 2.5 Flash** (Ultra-low latency conversational tier)
     - **Qwen 3.8 / 2.5** (High ROI token plan tier)
     - **GLM-5.3** (Zero marginal cost coding plan)
     - **GPT-4o** (Enterprise flagship tier)
     - **Claude 3.5 Sonnet** (Reasoning tier)
   - Evaluates token budgets, average turn duration, and tool call overhead before promoting changes.

3. **Conversational Simulation Test Framework**:
   - Simulates multi-turn voice dialogs against mock caller intents before production deployment.
   - Asserts tool invocation accuracy, system prompt adherence, and graceful fallback responses.

4. **ThumbGate & Leash Pre-Action Interdiction**:
   - **Destructive Action Blocking**: Intercepts `delete_agent`, `modify_production_prompt`, or `swap_llm_backend` tool calls via ThumbGate `PreToolUse` hooks.
   - Requires phone Leash operator approval (or prior simulated test pass proof) before executing changes on live customer phone trees.

## Global CLI Commands

```bash
# Run full voice agent suite audit & status
eleven-voice audit

# Estimate conversation costs across LLM backends (100 calls, 3 mins avg)
eleven-voice cost-estimate --calls 100 --minutes 3

# Run conversational simulation tests on an agent config
eleven-voice test-agent --config config/voice_agent_sample.json

# Validate ThumbGate pre-action safety gate on a proposed tool call
eleven-voice gate-check --action delete_agent --agent-id agent_prod_01
```

## Configuration Schema

Voice agent configurations follow the standardized declarative format:

```json
{
  "agent_id": "hermes_voice_receptionist_v1",
  "name": "Hermes Mobile Voice Receptionist",
  "conversation_config": {
    "agent": {
      "prompt": {
        "prompt": "You are Hermes, a friendly and ultra-fast voice assistant...",
        "llm": "gemini-2.5-flash",
        "temperature": 0.3
      },
      "first_message": "Hey there! Hermes here. How can I help you today?",
      "language": "en"
    },
    "tts": {
      "voice_id": "21m00Tcm4TlvDq8ikWAM",
      "model_id": "eleven_turbo_v2_5",
      "stability": 0.5,
      "similarity_boost": 0.8
    }
  }
}
```
