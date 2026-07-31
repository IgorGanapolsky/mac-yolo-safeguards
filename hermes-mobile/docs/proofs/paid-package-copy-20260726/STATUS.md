# Paid Android package proof — 2026-07-26

Device: Samsung `R3CY90QPM7E`

Package under test: `com.iganapolsky.hermesmobile.paid`

## Release artifact

- Release APK build: PASS (`BUILD SUCCESSFUL in 3m 18s`)
- Package verification: PASS
- Embedded JavaScript bundle: PASS
- Version: `versionCode=20`, `versionName=1.4`
- APK SHA-256: `804433d4e6ad829382239b744b09c91e0514d1d164edc630b3a625822cb91e1d`
- Physical install: PASS (`adb install`: `Success`)
- Cold start: PASS (`React Native started (Running main)`)
- The retired free package remains installed alongside the paid package; it was not deleted or modified.

## Automated checks

- Full Jest: PASS — 242/242 suites, 2,155/2,155 tests.
- Release-safety Jest: PASS — 7/7 suites, 131/131 tests.
- TypeScript: PASS.
- Paid installer contract: PASS — 9/9 assertions.
- Pairing package-target shell contract: PASS — 57/57 assertions.
- Focused secretless USB repair tests: PASS — 14/14 tests.

## Physical UI evidence

- [Thread header](./paid-thread-started-connected.png): renders `Started Jul 24, 2026, 11:22 AM`, names `Igors-MacBook-Pro`, and reports `Connected · USB`.
- [Paid Leash screen](./paid-leash-current.png): renders `Upgrade Hermes with ThumbGate`, paid Continuity copy, and `See ThumbGate plans`.
- The Leash accessibility tree contains none of `Unlock in Google Play`, `Restore purchases`, or `$4.99`.
- [Named computer picker](./paid-named-computer-picker.png): renders both `Igors-MacBook-Pro (Mac Pro)` and `Igors-Mac-mini`.

Paid-package Maestro proof:

- PASS: thread header exposes `Started …`.
- PASS: named connected Mac is visible.
- PASS: picker names both computers.
- PASS: `Scan QR from your Mac` is absent.
- PASS: ThumbGate paid-companion card and CTA are visible.
- PASS: all three legacy in-app-purchase strings are absent.

## Honest remaining gap

The shared continuous suite status is still `e2e=skipped` because its phone-activity guard detected the physical device as actively in use. Two paid-package targeted Maestro flows passed independently.

The checked-in `picker-two-machines.yaml` flow failed because tapping the nested `chat-context-mac-button` selector did not open the sheet; tapping the visible named-computer row passed the same physical scenario. This is a harness-selector failure, not promoted to a product pass.

The previous paid build reproduced the CEO's `Re-pair this Mac` failure and opened generic discovery. The corrected build now cold-starts the same persisted paid installation as connected after secretless USB credential exchange, and deterministic repair tests pass, but a second safe physical button reproduction was not obtained: an intentionally invalid raw-key deep link was correctly rejected before it could corrupt the saved profile.
