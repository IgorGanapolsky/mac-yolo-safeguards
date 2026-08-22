# Meta Glasses Screen Reading via DAT SDK

## Goal
Bypass Meta AI's "I can't read screens" guardrail by using the official
[Meta Wearables Device Access Toolkit (DAT) SDK](https://developers.meta.com/blog/introducing-meta-wearables-device-access-toolkit/)
to stream raw camera frames from Ray-Ban Meta glasses to a companion mobile
app, then route frames to a third-party multimodal LLM for screen OCR/analysis.

## Platform Decision
- **Target: Android (Kotlin)** — leverages existing `hermes-mobile/native-glasses/kotlin/HermesGlassesModule.kt`
- iOS path available via Swift + DAT SDK, but Android sideloading is simpler for dev
- Existing `withHermesAiGlasses.js` Expo plugin already wires Jetpack XR (alpha15)

## Architecture

```
[Ray-Ban Meta Glasses]
    ↓ (Bluetooth LE peripheral)
[iPhone/Android companion app via DAT SDK Camera Kit]
    ↓ (raw I420 video frames via WebRTC/DataChannel)
[Hermes Mobile app — native Kotlin module]
    → snapshot frame on gesture (tap/double-blink)
    → JPEG-encode frame
    → POST /api/glasses/inference to Mac bridge
    → OR → POST to LiteLLM gateway :4010 /vision endpoints
    → OR → MCP broker :8766 send_message → hermes
[Mac-side] LiteLLM gateway routes to:
    → Claude 3.5 Sonnet (vision) via Bedrock
    → GPT-4o via OpenAI
    → Gemini 1.5 Pro via Vertex AI
[Result] → speak via glasses speakers via Hermes bridge TTS
```

## Implementation Steps

### 1. Developer Mode Activation
- Open Meta AI app → Settings → App Info → tap version 5× → enable Developer Mode
- Skips application attestation and cloud permission bundle verification

### 2. DAT SDK Integration (Kotlin)
Add to `HermesGlassesModule.kt` or create a new native module:

```kotlin
import com.meta.wearables.dat.sdk.*

class HermesDatCameraModule : DatCameraListener() {
    override fun onFrameReceived(frame: DatCameraFrame) {
        val i420 = frame.yuv420 // raw I420 frame
        if (snapshotRequested) {
            val bitmap = DatCameraUtil.yuvToBitmap(i420, frame.width, frame.height)
            val jpeg = DatCameraUtil.bitmapToJpeg(bitmap, quality = 90)
            sendToVisionModel(jpeg)
        }
    }
}
```

### 3. Snapshot Trigger (Glasses Gestures)
Use existing gesture callbacks in `HermesGlassesModule.kt`:
- `double_blink` → capture + OCR screen
- `tap` → capture + general vision inference
- `wink_left` → toggle recording mode

### 4. Vision Model Routing
Route JPEG frames to:
- **Primary**: LiteLLM gateway `:4010` (existing Hermes setup) with `glm-vision` model
- **Fallback**: Direct Claude 3.5 Sonnet vision via Bedrock
- **Fallback**: Direct GPT-4o vision via OpenAI API

Prompt template for screen reading:
```
Extract all visible text from this screen capture. Return as structured JSON:
{"text": "...", "ui_elements": [...], "actionable_items": [...]}
```

### 5. MCP Broker Relay
The existing MCP broker (`~/.openclaw/mcp_broker.py:8766`) can receive frame metadata:
```python
send_message("hermes-mobile", "hermes-gateway", "glasses-screens", frame_metadata)
```

### 6. Publishing Limitations
- Local dev builds only (sideload via Developer Mode)
- No App Store/Google Play distribution without Meta approval
- SDK requires Meta developer account + app approval for production

## Files to Create/Modify

| File | Action |
|------|--------|
| `hermes-mobile/native-glasses/kotlin/HermesDatCameraModule.kt` | NEW — DAT SDK camera frame handler |
| `hermes-mobile/src/native/hermesGlasses.ts` | MODIFY — add `startCameraStream()` / `stopCameraStream()` / `requestSnapshot()` |
| `hermes-mobile/src/services/glassesVisionClient.ts` | NEW — sends JPEG frames to vision model |
| `hermes-mobile/plugins/withHermesDatSdk.js` | NEW — Expo config plugin for DAT SDK dependency |
| `docs/AI_GLASSES_SCREEN_READING.md` | NEW — full setup + developer mode instructions |
