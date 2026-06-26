# AI glasses parity (Google I/O 2026)

Source: [Extend your mobile app for AI glasses](https://www.youtube.com/watch?v=83CF7AhozJ8) — Android Developers, Google I/O 2026.

Hermes Mobile is **Expo/React Native** today, not Kotlin Compose Glimmer. This doc maps the session patterns to what we ship now vs a future native projected module.

## Video → Hermes mapping

| I/O pattern | Hermes implementation | Status |
|---|---|---|
| Single ViewModel source of truth | `GatewayContext` owns settings, health, approvals | Shipped |
| Projected display vs audio-first | `resolvePresentationState()` + **Glance mode** | Shipped |
| Sign of life on session start | `emitSignOfLife()` + `sessionGreeting` on connect | Shipped |
| Agent function calling (approve/reject) | `hermesAgentTools.ts` (`approve_top_pending`, etc.) | Shipped |
| Glimmer Stack (one item at a time) | Glance mode: single `GateApprovalCard` stack | Shipped |
| Compose Glimmer UI | RN `GateApprovalCard` glance variant | Shipped |
| Jetpack Projected native module | `native-glasses/kotlin/` + `plugins/withHermesAiGlasses.js` | **Scaffolded** |
| Glasses emulator in Android Studio | Settings → Launch on glasses + checklist doc | **Scaffolded** |

## Glance mode (Settings)

Turn on **Glanceable approvals (AI glasses parity)** to:

- Show **Leash + Settings** tabs only (Chat/Ops hidden)
- Render **one approval at a time** with larger approve/reject targets
- Announce connection status via **VoiceOver** when screen reader is enabled
- Keep `GatewayContext` as the only state owner (same data path as full UI)

## Agent tools (voice / Live API ready)

```ts
await runAgentTool('get_pending_approval_count');
await runAgentTool('approve_top_pending');
await runAgentTool('reject_top_pending');
```

These mirror the Gemini Live function-calling flow from the I/O todo sample.

## Future: native projected module

Scaffold is in `native-glasses/` and applied on `expo prebuild` via `plugins/withHermesAiGlasses.js`.

Next steps:

1. Run prebuild + open in Android Studio Canary with AI glasses AVD
2. Wire Gemini Live + Firebase AI Logic for voice-only path (step 3)
3. Sync `HermesGlassesViewModel` with live relay queue (shared token with RN)
4. Expand Glimmer navigation for Chat/Ops slices

See [AI_GLASSES_CHECKLIST.md](./AI_GLASSES_CHECKLIST.md) for the full 9-step map.

## References

- [AI Glasses get started](https://developer.android.com/design/ui/ai-glasses/guides/foundations/get-started)
- [Build your first AI glasses app (Glimmer & Projected)](https://goo.gle/4d2iFFT)
