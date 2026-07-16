# Fresh-user E2E orchestration (Android + iOS)

**North star:** Every install is a stranger — no `hermes://setup?demo=1`, no developer leash unlock, no pre-paired Mac.

## What it proves

| Step | Maestro / system | Pass means |
|------|------------------|------------|
| Cold start | `stranger-cold-start.yaml` | `connect-mac-gate` + onboarding card + Find computers |
| Tabs | `fresh-user-tabs.yaml` | Leash / Settings / Hermes reachable without demo |
| Paid upgrade UI | `fresh-user-leash-paywall.yaml` | `pro-upgrade-card`, IAP subscribe/restore, legal copy; tap Subscribe does not crash |

**Not proven (needs real Mac + store sandbox):** chat send to gateway, completed IAP charge, multi-Mac identity.

## Run

```bash
cd hermes-mobile

# Both platforms (emulator + simulator when available)
npm run e2e:fresh-user

# One platform
npm run e2e:fresh-user:android
npm run e2e:fresh-user:ios

# Reuse already-installed app, still clears state
bash scripts/run-fresh-user-e2e.sh --skip-install --android-only
```

Proofs: `docs/proofs/fresh-user-e2e-<timestamp>/result.json` (+ Maestro logs / fail screenshots).

**Device policy:** Android prefers `emulator-*` and installs **debug APK + Metro** from the branch under test. USB phones are ignored unless `HERMES_FRESH_USER_ALLOW_PHONE=1` (release APK will not include unreleased paywall testIDs). iOS uses the booted Simulator (`maestro --udid`, JDK via `JAVA_HOME`, `MAESTRO_DRIVER_STARTUP_TIMEOUT=120000`).

### Evidence (2026-07-15)

| Platform | Result | Proof |
|----------|--------|-------|
| Android emulator | **PASS** full suite (cold start + tabs + paywall + Subscribe → alert OK) | `docs/proofs/fresh-user-e2e-20260715T182722Z/android-maestro.log` |
| iOS simulator | **Blocked this session** by host thrash: `sim-runaway-guard` + jetsam shut down the sim under load 100–400 while Maestro ran | Orchestration ready; re-run when load &lt; ~40 with guard paused or after RAM reclaim |

**Paid upgrade on emulator:** asserts `leash-pro-upsell-card`, `pro-upgrade-card`, IAP subscribe/restore/legal, taps Subscribe; debug build shows “Store billing is unavailable” (expected without Play Billing). Real charge still needs store sandbox.

## Suite entry

```text
.maestro/fresh-user-suite.yaml
  → fresh-user-cold-start.yaml
  → fresh-user-tabs.yaml
  → fresh-user-leash-paywall.yaml
```

## Paid upgrade notes

- Free weekly Leash still unlocks approvals; **Pro upsell is near the top of Leash** when not Pro (`leash-pro-upsell-card` / `pro-upgrade-card`).
- Maestro **does not complete** a real Store purchase (needs sandbox Apple/Google account + human OTP).
- It **does** assert the IAP CTA surface and that tapping Subscribe leaves the app alive.

## Difference vs demo suite

| | Demo (`full-suite` / continuous) | Fresh-user |
|--|----------------------------------|------------|
| Deep link | `hermes://setup?demo=1` | **none** |
| ConnectMacGate | Hidden | **Required** |
| Leash smoke inject | Yes | No |
| Chat send | Yes | Optional later (pair required) |

## CI

- Structural: `npm run e2e:validate` includes `fresh-user-*` flows.
- Device: run `e2e:fresh-user` on agent Mac with emulator/sim (not required on every ubuntu PR).
