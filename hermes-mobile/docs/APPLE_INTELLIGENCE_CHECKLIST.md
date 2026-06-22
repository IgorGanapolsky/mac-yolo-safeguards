# Apple Intelligence checklist (Hermes Mobile)

Maps [Apple Intelligence for developers](https://developer.apple.com/apple-intelligence/) to **Hermes Mobile** (`com.iganapolsky.hermesmobile`).

**Vertical slice:** Siri / Shortcuts → **Leash** (approve or reject ThumbGate tool calls).

---

## 1. App Intents (highest ROI)

| Capability | Hermes implementation | Status |
|---|---|---|
| Intent schemas (actions) | `ApproveTopPendingIntent`, `RejectTopPendingIntent`, `OpenLeashIntent`, `CheckGatewayHealthIntent` | **Scaffolded** |
| Entity schemas (content) | `HermesPendingApprovalEntity` | **Scaffolded** |
| App Shortcuts provider | `HermesShortcuts` with Siri phrases | **Scaffolded** |
| Deep link bridge to RN | `hermes://leash/approve` etc. → `useHermesDeepLinks.ts` | **Shipped** |

**Files**

- `native-intelligence/swift/HermesAppIntents.swift`
- `native-intelligence/swift/HermesIntentEntities.swift`
- `plugins/withHermesAppleIntelligence.js`
- `src/hooks/useHermesDeepLinks.ts`

**Siri phrases (examples)**

- “Approve with Hermes Mobile”
- “Reject tool call in Hermes Mobile”
- “Open Leash in Hermes Mobile”
- “Check gateway in Hermes Mobile”

---

## 2. Foundation Models framework

| Use in Hermes | Status |
|---|---|
| On-device summarization of gate-blocked command diffs | **Scaffolded** — `HermesFoundationModelsBridge.swift` |
| Multimodal “explain this approval” with redacted screenshot | **Scaffolded** — `HermesVisionBridge.swift` |

Add a Swift `FoundationModels` bridge when you need on-device reasoning; keep RN `GatewayContext` as SoT. Full ML mapping: [MACHINE_LEARNING_CHECKLIST.md](./MACHINE_LEARNING_CHECKLIST.md).

---

## 3. Visual Intelligence + View Annotations

| Use in Hermes | Status |
|---|---|
| Reference on-screen approval card via View Annotations | **Future** |
| Camera / screen search → open Leash | **Future** |

Pair with entity index for pending approvals once App Intents entities are populated from live queue.

---

## 4. Shortcuts

| Item | Hermes |
|---|---|
| Natural-language automations | `HermesShortcuts` registers Leash intents in Shortcuts app |
| Multistep workflows | User can chain “Check gateway” → “Approve” in Shortcuts |

---

## 5. Write with Siri

Standard `TextInput` fields (Settings gateway URL, API key, pair code) inherit system writing tools automatically — no extra work.

---

## 6. Platform parity with Android AI glasses

| Platform | Voice / glance path |
|---|---|
| Android | Jetpack XR projected activity + Glance mode |
| iOS | App Intents + Siri + `hermes://` deep links |

See also [AI_GLASSES_CHECKLIST.md](./AI_GLASSES_CHECKLIST.md) and [AI_GLASSES_PARITY.md](./AI_GLASSES_PARITY.md).

---

## Setup (iOS)

```bash
cd hermes-mobile
npx expo prebuild --platform ios --clean
open ios/HermesMobile.xcworkspace
```

1. Confirm `HermesAppIntents.swift` + `HermesIntentEntities.swift` are in the app target (see `ios/HERMES_APP_INTENTS.md` after prebuild).
2. Build on device with Apple Intelligence enabled.
3. Settings → Siri → test “Approve with Hermes Mobile”.
4. Shortcuts app → Hermes intents should appear under your app.

**Deep link test (Simulator)**

```bash
xcrun simctl openurl booted "hermes://leash/approve"
```

---

## 7. Ship criteria

- [ ] App Intents compile in Xcode target
- [ ] `hermes://leash/approve` navigates to Leash and calls `approve_top_pending`
- [ ] Siri phrase opens app and runs same path
- [ ] Maestro / unit tests still pass (`npm run test:ci`)

---

## References

- [Apple Intelligence overview](https://developer.apple.com/apple-intelligence/)
- [AI & Machine Learning overview](https://developer.apple.com/machine-learning/) — see [MACHINE_LEARNING_CHECKLIST.md](./MACHINE_LEARNING_CHECKLIST.md)
- [App Intents](https://developer.apple.com/documentation/appintents)
- [Foundation Models](https://developer.apple.com/documentation/foundationmodels)
