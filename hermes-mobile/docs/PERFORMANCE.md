# Hermes Mobile — performance

Callstack 2026 RN optimization alignment for chat list rendering, context subscriptions, startup, and release bundle budgets.

## Implemented

| Area | Detail |
|---|---|
| Chat list | `@shopify/flash-list` v2 + `maintainVisibleContentPosition` (replaces inverted FlatList) |
| List cells | `ChatMessageListItem` memo + stable callbacks from `ChatScreen` |
| Gateway context | `use-context-selector` + `useGatewayConnection` / `Relay` / `Approvals` / `ChatSync` |
| Tab startup | `React.lazy` + `Suspense` for Chat, Leash, Settings in `App.tsx` |
| React Compiler | `babel-plugin-react-compiler` target 19 in `babel.config.js` |
| Bundle audit | `npm run analyze:bundle` → `scripts/analyze-bundle.sh` |

## FlashList version

Expo SDK 55 pins **`@shopify/flash-list@2.0.2`** (`npx expo install @shopify/flash-list`). FlashList v2 auto-sizes items on Old Architecture — no `estimatedItemSize`. v1 remains an option if you pin it manually, but Expo’s compatible native module is v2.

## Context selectors

Prefer focused hooks over `useGateway()` in hot screens:

```ts
import { useGatewayConnection, useGatewayApprovals } from '../hooks/useGatewaySelector';
```

`useGateway()` remains for providers, tab bar badge, and deep links.

## Barrel exports

Audit (2026-06-25): no `src/**/index.ts` re-export barrels. Imports are direct file paths — keep it that way for tree-shaking.

## Bundle size gate

```bash
npm run analyze:bundle              # default android, 8192KB budget
HERMES_BUNDLE_MAX_KB=9000 npm run analyze:bundle
```

Release preflight runs a lightweight size check when `SKIP_BUNDLE_SIZE_CHECK` is unset.

## Runtime metrics (TTI / FPS)

Hermes Mobile does not ship an in-app TTI hook yet. For on-device profiling use **[Flashlight](https://github.com/bamlab/flashlight)** (BAM):

```bash
npm run perf:flashlight   # prints install hint if CLI missing
```

Recommended flows: cold launch → Chat tab → open thread with 50+ messages → scroll while sending.

Flashlight captures TTI, CPU, and FPS without Metro attached. Store reports under `docs/proofs/perf/` when benchmarking regressions.

## Continuous E2E

`scripts/release-preflight.sh` runs `npm run e2e:accelerated` when an adb device is connected (`SKIP_ACCELERATED_E2E=1` to bypass locally).
