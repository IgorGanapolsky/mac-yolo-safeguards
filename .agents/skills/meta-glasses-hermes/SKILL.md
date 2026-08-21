---
name: meta-glasses-hermes
description: >
  Meta Glasses (Ray-Ban / Oakley) integration with Hermes agent runtime:
  screen capture streaming, voice-to-inference, and AR macro/command
  execution on MacBook via Hermes gateway. Trigger when user wants to
  connect Meta glasses to Hermes for live screen capture, deep AI
  inference, or hands-free macro execution. Slash: /meta-glasses-hermes.
---

# Meta Glasses Hermes Integration

Connects Meta smart glasses (Ray-Ban / Oakley, Meta Wear 2026+) to the
Hermes agent runtime for five capabilities:

1. **Bluetooth link status** — probes and connects to the Meta glasses
   BLE peripheral via `blueutil` (Mac-side daemon).
2. **Multimodal screen capture** — grabs retina screen context as JPEG
   for vision-model inference.
3. **Deep inference** — queries the Hermes LiteLLM gateway with the
   screen image + voice prompt, returning concise spoken-friendly answers.
4. **Voice TTS playback** — streams synthesized speech directly into the
   glasses' open-ear speakers via macOS `say`.
5. **Mac command/macro dispatch** — executes shell and AppleScript
   automation, routed through the OpenBot Action Gateway for deterministic
   policy interdiction.

## Steal Matrix (high ROI only)

| Meta Glasses concept | Implement here |
|----------------------|----------------|
| Live voice mode | `hermes-voice-engine.js` + `bin/eleven-voice` + this bridge (TTS via `say`) |
| Screen capture streaming | `tools/meta-glasses-hermes-bridge.js` captureScreen → JPEG base64 |
| AR gesture macros | `tools/meta-glasses-hermes-bridge.js` runMacro (wink → shell command) |
| Deep inference via gateway | `tools/meta-glasses-hermes-bridge.js` queryHermesVision (LiteLLM gateway) |
| Workflow teaching ("watch it") | Native `hermesGlasses.ts` + `HermesGlassesModule` gesture recording |

## CLI Usage

```bash
# Check Bluetooth connection status to glasses
node tools/meta-glasses-hermes-bridge.js --status

# Connect to glasses via BLE
node tools/meta-glasses-hermes-bridge.js --connect

# Speak text into glasses' open-ear speakers
node tools/meta-glasses-hermes-bridge.js --speak "Connected to Hermes inference engine."

# Capture screen as JPEG
node tools/meta-glasses-hermes-bridge.js --screen

# Deep inference: ask Hermes to analyze the screen
node tools/meta-glasses-hermes-bridge.js --ask "What is on my screen right now?"

# Execute a shell macro command
node tools/meta-glasses-hermes-bridge.js --command "open Slack and focus Warp"

# Run tests
node tests/test-meta-glasses-hermes-bridge.js
```

## Native Module

The Android native side lives in `hermes-mobile/native-glasses/kotlin/`:
- `HermesGlassesModule.kt` — RN bridge for BLE + projection
- `HermesGlassesViewModel.kt` — state management for glasses UI
- `HermesGlassesScreens.kt` — Compose XR AR overlay screens
- `HermesGlassesProjectedActivity.kt` — projected display lifecycle

## Related

- `/openbot-action-gateway` — AG-UI policy interdiction for every command
- `/outcome-owned-agent-pattern` — GrokBot team-agent orchestration
- `/screenpipe-activity-local` — activity timeline + recall
