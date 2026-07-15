# AI SDK Profiler (Callstack) — agent runbook

Blog: [Announcing AI SDK Profiler for React Native](https://www.callstack.com/blog/announcing-ai-sdk-profiler-for-react-native)  
Package: [`@react-native-ai/dev-tools@0.12.0`](https://www.npmjs.com/package/@react-native-ai/dev-tools) (Rozenite plugin; blog sometimes says `dev-tools-plugin` — that name is **not** on npm)

## What it profiles (and what it does not)

| Captures | Does **not** capture |
|----------|----------------------|
| Vercel AI SDK OpenTelemetry spans (prompt, response, provider, latency) in Rozenite DevTools | FlashList scroll FPS / chat list jitter |
| On-device or cloud providers **if** the app calls `ai` with `experimental_telemetry` | Keyboard inset / composer layout jank |
| | Gateway HTTP chat stream latency as AI SDK spans |

Hermes Mobile chat talks to the Hermes gateway over HTTP/WS — it does **not** import the Vercel `ai` package. Use this profiler when (if) on-device / AI SDK paths land; for **chat jitter** keep measuring with Reassure + Flashlight + `appPerformance` (see [PERFORMANCE.md](./PERFORMANCE.md)).

## Expo SDK 55 fit

| Check | Result |
|-------|--------|
| Peer deps | `react: *`, `react-native: *` — OK with Expo 55 / RN 0.83 |
| Rozenite | `rozenite@1.13.0` + `@rozenite/metro@1.13.0` — Metro opt-in |
| Production | `useAiSdkDevTools` only under `__DEV__` via `DevToolsBootstrap` |
| doctor:expo | Rozenite Metro middleware **off** unless `WITH_ROZENITE=true` |

### Upstream blocker (npm tarball)

`@react-native-ai/dev-tools@0.12.0` publishes **source only** — no `dist/react-native.cjs` and no `dist/rozenite.json`. Metro can still resolve package-root `react-native.ts`. Full DevTools panel discovery expects a built `dist/` (upstream `prepare: rozenite build`). Closest path until Callstack ships a built tarball:

1. Keep Metro source load + `__DEV__` hook (already wired).
2. Opt-in `WITH_ROZENITE=true` so agents can try panel discovery after a local `rozenite build` inside the package.
3. Do **not** force OpenTelemetry 2.x overrides (prior crash: `AlwaysOn` undefined).

## Agent invoke

```bash
cd hermes-mobile

# 1) Proof artifact (always safe; no Metro)
npm run perf:ai-sdk-profiler:proof
# → docs/perf-proofs/ai-sdk-profiler-latest.json

# 2) Chat jitter baseline (Reassure — do not skip when investigating list jank)
npm run test:perf

# 3) Optional Rozenite DevTools + AI SDK Profiler panel
WITH_ROZENITE=true npm start
# Open React Native DevTools → look for "AI SDK Profiler"

# 4) Parallel agent-device E2E (Maestro acceleration — orthogonal to AI spans)
npm run e2e:fast
# or: npm run e2e:accelerated
```

App hook (dev only):

```tsx
// App.tsx
{__DEV__ ? <DevToolsBootstrap /> : null}
// DevToolsBootstrap → useAiSdkDevTools() from src/devtools/aiSdkProfiler.ts
```

If you later call Vercel AI SDK from the app:

```ts
import { getAiSdkTracer } from '../devtools/aiSdkProfiler';

const tracer = getAiSdkTracer({ serviceName: 'hermes-mobile' });
await generateText({
  /* ... */
  experimental_telemetry: {
    isEnabled: true,
    tracer,
    functionId: 'hermes-mobile.feature',
  },
});
```

## Relation to Reassure

- **Reassure** (`src/__perf__/`, `npm run test:perf`) — JS hot-path regression for message format / list-adjacent CPU.
- **AI SDK Profiler** — request/span UX for AI SDK calls.
- Agents must not treat a green AI SDK proof as a chat-jitter pass (or vice versa).

## Related

- [PERFORMANCE.md](./PERFORMANCE.md)
- Callstack skill: `.cursor/skills/react-native-best-practices/SKILL.md` (measure → optimize → re-measure)
- Rozenite getting started: https://www.rozenite.dev/docs/getting-started
