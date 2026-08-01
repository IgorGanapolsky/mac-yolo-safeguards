# Hermes Mobile testing — August 2026 practice

**Sources:** Parallel deep research `parallel-research/mobile-testing-aug-2026.md` (interaction `trun_530cc911f7344667907913723de5ba62`, 2026-08-01) + this repo’s live gates (`docs/TESTING.md`, continuous E2E, OTA gate).

**Do not** treat `docs/proofs/continuous/latest.json` `e2e=skipped` as device UX verified.

## Executive decisions (Hermes-specific)

| Decision | August 2026 practice | Hermes Mobile today | Action |
|---|---|---|---|
| Pyramid | Many unit/contract; few device E2E | Strong unit + Maestro; thin continuous | Keep; expand **contracts** for pairing/stream |
| UI runner | Maestro default for Expo release journeys | Maestro + EAS-friendly flows | Keep Maestro as ship gate |
| Detox | Only if gray-box sync pain is measured | Not used | Do **not** add unless flakes prove need |
| agent-device | Exploratory / evidence, not release oracle | Documented correctly | Enforce in contract tests |
| Device truth | Small expensive real-device matrix | Continuous often **skips** when phone awake | Emulator fallback + nightly full tier |
| OTA | runtimeVersion + production-like smoke + rollback | `ota:gate` + fresh-user / stranger CI | Keep; never bypass with `e2e=skipped` |
| Network | Protocol tests offline; small tailnet matrix on device | chatErrors/connectivity unit tests | Add reconnect/idempotency contracts |

## Recommended pyramid (this product)

```
Static / type / release-safety     ── every commit
Unit (Jest) + pure protocol        ── every PR
Component (RTL) + a11y labels      ── every PR (screens with state)
Contract (gateway/SSE/pairing)     ── every PR that touches chat/pair
Maestro smoke (ship-guard + send)  ── continuous / PR device job
Fresh-user + connection journeys   ── OTA gate + nightly full
agent-device exploratory           ── incidents only (not e2e=pass)
Native Espresso/XCUITest           ── only on deep-link / notif / keystore seams
```

## Continuous tiers

| Tier | When | Flows | Proof |
|---|---|---|---|
| **core** (default LaunchAgent) | every 15 min | `ship-guard`, `chat-send-persistence` | `latest.json` e2e=pass\|fail\|skipped |
| **connection** | `HERMES_E2E_TIER=connection` or nightly | core + `leash-connection` + `wrong-key-repair` (if present) | same |
| **full** | pre-OTA / `HERMES_E2E_TIER=full` | core + `stranger-cold-start` / `npm run e2e:fresh-user` | fresh-user JSON or continuous pass |

`e2e=skipped` → SLO **yellow**. Agents must not claim chat works on device.

## Anti-patterns we reject

1. Fixed `sleep` as the only wait for network/animation (prefer Maestro `extendedWaitUntil` / visible id).
2. Global retry that greens a red product failure without flake accounting.
3. Shared dogfood session as “fresh user.”
4. agent-device snapshot alone as `e2e=pass`.
5. Production OTA when continuous is `skipped` and no stranger/fresh-user proof.
6. Treating Expo Go as production binary truth.

## Connection / Tailscale matrix (test offline first)

Unit/contract (no phone):

- Private LAN URL + cellular block copy
- Connectivity vs operational error classification (`isConnectivityMessage`)
- Empty-stream hard stop (no infinite “Checking your Mac…”)
- Offline empty-reply must not offer **Retry send** (reconnect path)

Device (when phone free):

- Paid package, Tailscale profile, Connected header honesty
- Desktop offline / wrong key / switch computer
- App kill mid-wait + reconnect

## OTA gate (unchanged product law)

Pass **any one of**: continuous `e2e=pass` · fresh-user proof pass · stranger cold-start CI/local hard proof.  
Refuse if only `e2e=skipped`.

## Cadence for agents

| Change type | Minimum verification |
|---|---|
| Copy / pure util | `npm test` focused + related unit |
| Chat / pair / Tailscale | unit + `test:release-safety` + connection contracts; device when claiming Connected |
| UI chrome | unit + Maestro ship-guard or continuous once |
| Production OTA | `npm run ota:gate` with real pass proof |
| Store assets | device-framed pipeline + OCR privacy (`frame-store-captures.py`) |

## Implementation map

| Artifact | Role |
|---|---|
| [TESTING.md](./TESTING.md) | Commands and flow inventory |
| [AGENT-DEVICE.md](./AGENT-DEVICE.md) | agent-device vs Maestro |
| [RESEARCH-MOBILE-TESTING-AUGUST-2026.md](./RESEARCH-MOBILE-TESTING-AUGUST-2026.md) | Full external research report |
| `src/__tests__/mobileTestingStrategyContract.test.ts` | Guards against strategy drift |
| `scripts/run-continuous-e2e.sh` | Tiered continuous flows |
| `scripts/require-fresh-user-ota-gate.sh` | OTA hard gate |

## Follow-ups (not all blocking)

1. Pact-style provider verification for gateway session/chat events (optional; start with existing Jest contracts).
2. Android Macrobenchmark / iOS launch metrics budgets once baseline exists (`docs/PERFORMANCE.md`).
3. Storybook RN visual stories for approval + offline banners (optional Chromatic).
4. Nightly `HERMES_E2E_TIER=full` LaunchAgent when phone docked.
