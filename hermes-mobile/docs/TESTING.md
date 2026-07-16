# Hermes Mobile — testing

## Layers (prevents shipping broken APKs)

| Layer | Command | Catches |
|---|---|---|
| Release safety unit tests | `npm run test:release-safety` | Debug APK without JS bundle, legacy shell, wrong package/Firebase IDs |
| Full unit + coverage gate | `npm run test:ci` | Regressions; global ≥60% lines; critical utils ≥85% |
| APK verify (pre-Firebase) | `npm run verify:apk -- path/to.apk` | Missing `index.android.bundle`, wrong package, legacy UI strings |
| Maestro ship-guard | `npm run e2e:ship-guard` | Red screen "Unable to load script", orange onboarding shell |
| Full device E2E | `npm run e2e:device` | Build release → verify → install → Maestro (phone required) |
| agent-device connection proof | `bash scripts/agent-device-connection-proof.sh` | Chat transport label / Tailscale / reconnecting vs Connected (exploratory; not a ship gate) |

## agent-device vs Maestro vs adb

| Tool | Use when |
|------|----------|
| **agent-device** | Connection crisis, Tailscale, fresh-user UI inspection; screenshots + a11y snapshots; `npm run e2e:accelerated` |
| **Maestro** | Deterministic CI / continuous `latest.json` ship gate |
| **adb** + pair script | Install, pair, port reverse — not primary UI truth |

Canonical: [AGENT-DEVICE.md](./AGENT-DEVICE.md). Install CLI: `bash ../scripts/install-agent-device.sh`.

## Unit test map (what each suite proves)

| Area | Test file | Proves |
|---|---|---|
| Leash UI | `ApprovalsScreen.test.tsx` | Connection block, empty state, thumbs up/down resolve |
| Settings | `SettingsScreen.test.tsx` | Gateway inputs, save, smoke-test inject |
| Gateway WS | `GatewayContext.test.tsx` | `/v1/events` connect, `GATE.BLOCKED`, `TRANSCRIPT.UPDATED` |
| Chat | `ChatScreen.test.tsx` | Demo send, session picker |
| ThumbGate API | `thumbgateClient.test.ts` | `/v1/feedback/capture` POST + errors |
| ThumbGate Leash | `leashThumbgate.test.ts` | Capture payload shape |
| Telegram inbox | `telegramInbox.test.ts` | Merged threads + tool lines |
| Gateway client | `gatewayClient.test.ts` | URL normalize, event parse, WS URL |
| Release guards | `apkReleaseGuards.test.ts` | Production APK contract |
| Prevent recurrence | `preventRecurrenceContract.test.ts` | Connected ⊕ Wrong key XOR, tier-0 Maestro flows, `e2e=fail` without phone |
| Auth mismatch UI | `ChatScreen.authMismatch.test.tsx` | Green health + `authMismatch` → header not Connected |
| Abort jargon | `chatErrors.abort.test.ts` | Bare `Aborted` → human retry copy |

## Maestro E2E flows

| Flow | File | Proves |
|---|---|---|
| Ship guard | `ship-guard.yaml` | No Metro red screen / legacy shell |
| Stranger cold start | `stranger-cold-start.yaml` | No demo deep link → `connect-mac-onboarding-card` + Find computers CTA |
| **Fresh-user suite** | `fresh-user-suite.yaml` | Full stranger path: cold start + tabs + Leash Pro IAP surface (`npm run e2e:fresh-user`) |
| Wrong-key repair | `wrong-key-repair.yaml` | Computer picker reachable for re-pair path |
| Launch | `launch.yaml` | Chat tab loads with input |
| Navigation | `navigation.yaml` | All four tabs reachable |
| Leash connection | `leash-connection.yaml` | Connection status block visible |
| Chat smoke | `chat.yaml` | Session modal, type + send, user bubble visible |
| Send persistence | `chat-send-persistence.yaml` | User bubble survives post-send wait (refresh-race guard) |
| Settings ThumbGate | `settings-thumbgate.yaml` | ThumbGate toggles + save reachable |
| Leash approval | `approvals.yaml` | Smoke inject → card → thumbs up → empty |
| Gateway API key | `save_key.yaml` | Save settings persistence |
| Full suite | `full-suite.yaml` | All flows sequential on one device |

**Release-safe Leash test:** Settings → "Preview Leash card (smoke test)" (`leash-smoke-test`) — works in release builds (not gated on `__DEV__`).

**Device/Maestro chat input (permanent):** Maestro flows, `adb input text`, and agent device automation must type only **`make money today`** into the chat composer — never gibberish probe strings. Guarded by `preventRecurrenceContract.test.ts`. API-key fields (`save_key.yaml`) and session IDs in deep links are exempt.

## Device E2E (Android phone USB)

```bash
cd hermes-mobile
adb devices   # must show one device
npm run e2e:device
```

Runs: `assembleRelease` → APK verify → install → full Maestro suite.

## iOS simulator

```bash
cd hermes-mobile
npx expo run:ios --device "iPhone 17 Pro"
npx expo start --dev-client   # separate terminal for Metro
npm run e2e:simulator         # full Maestro suite (auto-boots sim, sets JAVA_HOME)
npm run e2e:ship-guard        # single flow via simulator runner
npm run e2e:simulator:flow .maestro/chat-send-persistence.yaml
```

Requires Homebrew OpenJDK 17 (`brew install openjdk@17`). The runner sets `JAVA_HOME` and `MAESTRO_DRIVER_STARTUP_TIMEOUT=180000` automatically.

## Continuous autonomous E2E (local Mac)

Runs **329 unit tests + Maestro ship-guard + chat-send-persistence** on a schedule without opening Cursor.

| Command | What |
|---|---|
| `npm run e2e:continuous:once` | Single cycle now |
| `npm run e2e:continuous` | Background daemon (every 15 min) |
| `npm run e2e:continuous:watch` | Re-run on `src/` changes |
| `npm run e2e:continuous:status` | LaunchAgent + last result |
| `bash ../scripts/install-agent-launchagents.sh` | Install LaunchAgent (every 15 min + at login) |

Status file: `docs/proofs/continuous/latest.json`
Logs: `~/Library/Logs/hermes-mobile-continuous-e2e.log`

**Priority:** USB Android phone when connected; otherwise iOS simulator. Metro is auto-started on `:8081` if missing.

**No phone (android-only LaunchAgent):** `latest.json` records `e2e=fail` (not `skipped`) so agents cannot claim device UX verified without a connected phone. Rozenite/agent-device E2E compatibility flows remain owned by T-25 (`navigation.yaml`, `ship-guard.yaml`).

### What `e2e=pass` does **not** prove (read this before “are you sure?”)

| Proof | Means | Does **not** mean |
|-------|--------|-------------------|
| Continuous / CI `e2e=pass` | `ship-guard` (+ local continuous: `chat-send-persistence`) app shell works | Multi-Mac USB identity is honest |
| Maestro ship-guard | No Metro red screen / legacy shell (often **demo** deep link) | Header never shows `Igors-Mac-mini · USB` when cable is MBP |
| Unit `chatMachineHeader` INVARIANT tests | Named `X · USB` only when live green/amber `/health` hostname is X | Device APK already has the fix |

**Multi-Mac USB product law (required unit gate):** header may show **`X · USB`** only when loopback `/health` is green|amber **and** hostname matches X. Health null/red → `Computer via USB · USB` (never invent Mini). Verify:

```bash
cd hermes-mobile
npm test -- --watchman=false src/__tests__/chatMachineHeader.test.ts
```

**Cloud:** GitHub Actions workflow `mobile-continuous.yml` runs unit tests every 6 hours + Maestro ship-guard on `macos-latest`.

## CI

- **Every PR/push:** `mobile-checks` job — typecheck, doctor, `test:ci` with coverage thresholds.
- **Release preflight:** `npm run launch:preflight:android` — optional bundle budget (`npm run analyze:bundle`) + accelerated Maestro when adb device present. Skip locally: `SKIP_BUNDLE_SIZE_CHECK=1 SKIP_ACCELERATED_E2E=1`.
- **Internal distribution:** quality gate + `verify-apk-package` before Firebase upload.
- **Local mirror:** `./scripts/ci-verify.sh` from repo root.

See [PERFORMANCE.md](./PERFORMANCE.md) for FlashList, React Compiler, and bundle audit details.

## Optional: GKD (Android accessibility macros)

**Not part of the product E2E gate.** Evaluation + pilot interruptor rules: [GKD-EVALUATION.md](./GKD-EVALUATION.md). Maestro + `latest.json` remain canonical. Install only when dogfooding system-sheet flakiness: `bash scripts/install-gkd-pilot.sh`.

## Crises this suite blocks

1. **Debug APK to Firebase** → no `assets/index.android.bundle` → unit test + verify script FAIL.
2. **Legacy native shell** → Maestro `ship-guard` + APK string scan FAIL.
3. **Wrong Firebase/Play project** → `releaseSafetyContract` + `appIdentity` tests FAIL.
4. **Metro red screen on device** → Maestro `assertNotVisible: "Unable to load script"` FAIL.
5. **Broken Settings JSX** → `SettingsScreen.test.tsx` + Maestro settings flow FAIL.
6. **Leash UI regression** → `approvals.yaml` thumbs testIDs FAIL.
7. **WS event handling drift** → `GatewayContext.test.tsx` FAIL.
