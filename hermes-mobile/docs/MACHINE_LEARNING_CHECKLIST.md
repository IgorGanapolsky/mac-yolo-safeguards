# Machine Learning & AI checklist (Hermes Mobile)

Maps [AI & Machine Learning for developers](https://developer.apple.com/machine-learning/) to **Hermes Mobile** (`com.iganapolsky.hermesmobile`).

**Vertical slice:** explain + act on **ThumbGate Leash** approvals — summarize blocked diffs, read redacted screenshots, transcribe voice commands.

Companion docs: [APPLE_INTELLIGENCE_CHECKLIST.md](./APPLE_INTELLIGENCE_CHECKLIST.md), [AI_GLASSES_CHECKLIST.md](./AI_GLASSES_CHECKLIST.md).

---

## 1. Core AI

| Use in Hermes | Status |
|---|---|
| Run small on-device classifiers for risky-command heuristics | **Future** |
| Zero-token on-device inference for approval triage | **Future** |

Hermes keeps **GatewayContext** as source of truth; Core AI models would score `PendingApproval` payloads before Siri/glasses act.

---

## 2. Foundation Models framework

| Capability | Hermes implementation | Status |
|---|---|---|
| Summarize gate-blocked diffs | `HermesFoundationModelsBridge.swift` | **Scaffolded** |
| RN bridge + fallback | `src/native/hermesAppleMl.ts` | **Scaffolded** |
| Prompt template | `src/utils/approvalSummaryPrompt.ts` | **Shipped** |
| Multimodal “explain this card” | Vision OCR → FM prompt | **Future** |
| Evaluations framework guardrails | Golden prompts for Leash summaries | **Future** |

**Files**

- `native-intelligence/swift/HermesFoundationModelsBridge.swift`
- `src/native/hermesAppleMl.ts`
- `src/utils/approvalSummaryPrompt.ts`

---

## 3. Vision

| Use in Hermes | Implementation | Status |
|---|---|---|
| OCR on redacted approval screenshots | `HermesVisionBridge.swift` (`VNRecognizeTextRequest`) | **Scaffolded** |
| Tap-to-segment sensitive regions before share | Redaction pipeline in Ops/Leash | **Future** |
| Pass Vision tools to Foundation Models | Multimodal Leash explain | **Future** |

---

## 4. Speech

| Use in Hermes | Implementation | Status |
|---|---|---|
| Hands-free “approve” / “reject” when Siri unavailable | `HermesSpeechBridge.swift` | **Scaffolded** |
| Sign-of-life greeting (phone) | `src/services/signOfLife.ts` | **Shipped** |
| Glasses audio-first path | `HermesGlassesViewModel` (Android) | **Scaffolded** |

Speech complements [App Intents](./APPLE_INTELLIGENCE_CHECKLIST.md) — same agent tools (`approve_top_pending`, `reject_top_pending`).

---

## 5. Machine-learning-powered APIs

| API | Hermes use | Status |
|---|---|---|
| Natural Language — sentiment / entities | Classify approval urgency in diff text | **Future** |
| Translation | Localize Leash copy for operators | **Future** |
| Sound classification | Detect “approve” keyword in ambient audio | **Future** |

Start with Foundation Models + Vision before bespoke Core ML for these.

---

## 6. Core ML

| Use in Hermes | Status |
|---|---|
| Lightweight risk scorer (.mlmodel) for tool names | **Future** |
| Regression on gateway latency → health badge | **Future** |

Use [Core ML Tools](https://developer.apple.com/documentation/coremltools) only if Foundation Models is too heavy for a fixed classifier.

---

## 7. Metal

| Use in Hermes | Status |
|---|---|
| GPU-accelerated diff highlight previews | **Future** |
| On-device embedding search over past approvals | **Future** |

Not on critical path for Leash vertical slice.

---

## 8. MLX (Mac research / training)

| Use in Hermes | Status |
|---|---|
| Fine-tune approval-summary prompts on Mac | **Research only** |
| Export distilled model → Core AI / Core ML for iOS | **Future** |

MLX stays in `scripts/mlx/` (not shipped in app binary).

---

## 9. Platform parity

| Platform | ML / voice path |
|---|---|
| Android glasses | Gemini Live + Firebase AI Logic (Kotlin) |
| iOS | Foundation Models + Vision + Speech + App Intents |
| RN shared | `hermesAgentTools.ts`, `GatewayContext` |

---

## Setup (iOS)

```bash
cd hermes-mobile
npx expo prebuild --platform ios --clean
open ios/HermesMobile.xcworkspace
```

1. Add all files under `native-intelligence/swift/` to the app target (see `ios/HERMES_APP_INTENTS.md`).
2. Link `HermesAppleMl` native module when ready (optional; RN falls back gracefully).
3. Enable **Speech Recognition** and **Siri** capabilities in Xcode.
4. Test Vision OCR with a redacted screenshot from Leash.

---

## Ship criteria

- [ ] `HermesFoundationModelsBridge` compiles with iOS 26 SDK
- [ ] `HermesVisionBridge.extractText` returns OCR from test image
- [ ] `summarizeApprovalDiff()` returns native text when module linked
- [ ] Voice path routes to same tools as `hermes://leash/approve`
- [ ] `npm run test:ci` passes (includes `machineLearningChecklist.test.ts`)

---

## References

- [AI & Machine Learning overview](https://developer.apple.com/machine-learning/)
- [Apple Intelligence overview](https://developer.apple.com/apple-intelligence/)
- [Foundation Models](https://developer.apple.com/documentation/foundationmodels)
- [Vision](https://developer.apple.com/documentation/vision)
- [Speech](https://developer.apple.com/documentation/speech)
- [Core ML](https://developer.apple.com/documentation/coreml)
