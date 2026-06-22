# AI glasses implementation checklist (Hermes Mobile)

Repo-level mapping of [Extend your mobile app for AI glasses](https://www.youtube.com/watch?v=83CF7AhozJ8) (Google I/O 2026) to **Hermes Mobile** (`com.iganapolsky.hermesmobile`).

**Vertical slice:** Leash / ThumbGate approvals (approve or reject risky agent tool calls).

---

## 1. Set up the XR / glasses stack

| Step | Hermes action |
|---|---|
| Android Studio Canary + AI glasses system image | [Set up Jetpack XR SDK](https://developer.android.com/develop/xr/jetpack-xr-sdk/set-up-sdk) |
| Create AI glasses AVD | Device Manager → AI glasses virtual device |
| Pair glasses ↔ phone emulator | Device Manager → **Pair glasses** |

Local prebuild (copies native sources + Gradle deps):

```bash
cd hermes-mobile
npx expo prebuild --platform android --clean
```

---

## 2. Project your existing app to glasses

| Artifact | Path |
|---|---|
| Expo config plugin | `plugins/withHermesAiGlasses.js` |
| Projected activity | `native-glasses/kotlin/HermesGlassesProjectedActivity.kt` |
| Shared ViewModel | `native-glasses/kotlin/HermesGlassesViewModel.kt` |
| Manifest category | `XR_PROJECTED` + `XR_PROJECTED_LAUNCHER` (injected by plugin) |
| Phone RN state (SoT mirror) | `src/context/GatewayContext.tsx` |

`HermesGlassesViewModel` is the glasses-side truth; it uses the same gateway HTTP probes as `gatewayClient.ts`.

---

## 3. Integrate Gemini Live + agent logic

| Status | Implementation |
|---|---|
| **Shipped (RN)** | `src/services/hermesAgentTools.ts` — function-calling shape for approve/reject/count |
| **Next** | Wire Gemini Live + Firebase AI Logic SDK in projected activity (Kotlin) per [AI glasses agent guide](https://goo.gle/4dcCMl3) |

Tools already defined: `approve_top_pending`, `reject_top_pending`, `get_pending_approval_count`, `get_gateway_health`.

---

## 4. Design the audio-first experience

| Item | Path |
|---|---|
| Sign of life on connect | `src/services/signOfLife.ts` (phone), `HermesGlassesViewModel.buildGreeting()` (glasses) |
| Session greeting UI | `ApprovalsScreen` + Glimmer audio card |
| End session | `HermesGlassesViewModel.endSession()` / Close button |

---

## 5. Branch between audio-only and visual UI

| Layer | Path |
|---|---|
| RN presentation routing | `src/utils/presentationMode.ts` |
| Kotlin display branch | `HermesGlassesScreens.kt` — Glimmer vs audio card |
| Projected capability probe | `HermesGlassesProjectedActivity.initializeProjected()` |

Condition: `isVisualUiSupported && areVisualsOn` → Glimmer; else audio-first.

---

## 6. Build the Glimmer UI for glasses

| Component | File |
|---|---|
| Theme + routing | `HermesGlassesScreens.kt` |
| VerticalList (queue) | `HermesGlassesScreens.kt` |
| Approve / Reject buttons | `HermesGlassesScreens.kt` |
| Phone glance parity | `GateApprovalCard` + Glance mode (`Settings`) |

Gradle deps (via plugin): `androidx.xr.glimmer:glimmer:1.0.0-alpha14`, `projected:1.0.0-alpha08`.

---

## 7. Wire navigation and theming

| Item | Hermes |
|---|---|
| Navigation | Single-screen Leash slice first; Navigation 3 for multi-screen later |
| Brand colors | Glimmer `GlimmerTheme` + existing `src/theme/colors.ts` indigo/cyan |
| Phone launch | Settings → **Launch Leash on glasses** (`src/native/hermesGlasses.ts`) |

---

## 8. Test without hardware

```bash
# Phone E2E (existing)
npm run e2e:device

# Glasses emulator (after prebuild)
# Android Studio → Run HermesGlassesProjectedActivity on paired glasses AVD
```

Compose previews: use Android Studio Glimmer environment tools (bright/dark/busy backgrounds).

---

## 9. Ship and iterate

| Rule | Hermes |
|---|---|
| Thin glasses layer | Projected activity + Glimmer UI only; domain in ViewModel + gateway client |
| One vertical slice | **Leash approvals** — generalize to Chat/Ops after emulator signoff |
| CI guard | `src/__tests__/aiGlassesChecklist.test.ts` |

---

## Quick commands

```bash
cd hermes-mobile
npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease
```

Settings → **Launch Leash on glasses** (enabled when `ProjectedContext.isProjectedDeviceConnected` is true).

## References

- [First projected activity](https://developer.android.com/develop/xr/jetpack-xr-sdk/ai-glasses/first-activity)
- [Compose Glimmer](https://developer.android.com/develop/xr/jetpack-xr-sdk/jetpack-compose-glimmer)
- [Phone parity doc](./AI_GLASSES_PARITY.md)
