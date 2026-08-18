# ElevenLabs voice governance (ThumbGate)

Source steal: [TNS — Claude can delete your production voice agent](https://thenewstack.io/elevenlabs-mcp-voice-agents/) (2026-08-18).

## Problem

Hosted MCP lets a chat agent inspect/edit/**delete** production voice agents. A chat confirmation screen proves the tool ran — **not** that the new prompt still escalates billing disputes or that a model swap is affordable.

## High-ROI controls (implemented)

| Control | CLI | Proof |
|---------|-----|-------|
| Destructive delete interdiction | `eleven-voice gate-check --action delete_agent --agent-id …` | exits 1 / `BLOCK` without `--approved` |
| Cost before model swap | `eleven-voice compare-models --baseline gpt-4o --candidate gemini-2.5-flash` | per-call delta USD |
| Sim-before-promote (billing retained) | `eleven-voice promote [--config path]` | receipt requires sim PASS + gate ALLOW |
| Full catalog estimate | `eleven-voice cost-estimate --calls 100 --minutes 3` | ranked models |

## Atomic promote path

```
simulate_conversation_test → calculate cost for config.llm → evaluate_thumbgate_pre_action
→ emit promote receipt (dry_run default)
```

Chat OK ≠ deploy. Use the receipt as the artifact.

## Tests

```bash
node tests/test-elevenlabs-voice-agents.js
bash bin/eleven-voice audit
```

## Samples

- `config/voice-agents/hermes-receptionist.v1.json` — known-good
- `config/voice-agents/trimmed-no-billing.json` — TNS regression (must HOLD)

## Out of scope this week

Agency HVAC first-cash still uses phone-first call sheets — do not stand up paid ElevenAgents phone trees as the beachhead SKU.
