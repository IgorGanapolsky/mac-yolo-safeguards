# Hermes Mobile — testing

## Layers (prevents shipping broken APKs)

| Layer | Command | Catches |
|---|---|---|
| Release safety unit tests | `npm run test:release-safety` | Debug APK without JS bundle, legacy shell, wrong package/Firebase IDs |
| Full unit + coverage gate | `npm run test:ci` | Regressions; global ≥60% lines; critical utils ≥85% |
| APK verify (pre-Firebase) | `npm run verify:apk -- path/to.apk` | Missing `index.android.bundle`, wrong package, legacy UI strings |
| Maestro ship-guard | `npm run e2e:ship-guard` | Red screen "Unable to load script", orange onboarding shell |
| Full device E2E | `npm run e2e:device` | Build release → verify → install → Maestro (phone required) |

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

## Maestro E2E flows

| Flow | File | Proves |
|---|---|---|
| Ship guard | `ship-guard.yaml` | No Metro red screen / legacy shell |
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

**Cloud:** GitHub Actions workflow `mobile-continuous.yml` runs unit tests every 6 hours + Maestro ship-guard on `macos-latest`.

## CI

- **Every PR/push:** `mobile-checks` job — typecheck, doctor, `test:ci` with coverage thresholds.
- **Internal distribution:** quality gate + `verify-apk-package` before Firebase upload.
- **Local mirror:** `./scripts/ci-verify.sh` from repo root.

## Crises this suite blocks

1. **Debug APK to Firebase** → no `assets/index.android.bundle` → unit test + verify script FAIL.
2. **Legacy native shell** → Maestro `ship-guard` + APK string scan FAIL.
3. **Wrong Firebase/Play project** → `releaseSafetyContract` + `appIdentity` tests FAIL.
4. **Metro red screen on device** → Maestro `assertNotVisible: "Unable to load script"` FAIL.
5. **Broken Settings JSX** → `SettingsScreen.test.tsx` + Maestro settings flow FAIL.
6. **Leash UI regression** → `approvals.yaml` thumbs testIDs FAIL.
7. **WS event handling drift** → `GatewayContext.test.tsx` FAIL.
