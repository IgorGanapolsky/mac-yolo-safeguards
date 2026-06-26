---
name: verify-hermes-mobile-ship
description: Verifies Hermes Mobile ship claims with evidence — unit tests, continuous E2E, simulator full-suite, device Maestro. Use before saying fixed/shipped/works on device, when user asks "are you sure?", or after UX changes under hermes-mobile/. Prevents false simulator-E2E claims.
---

# Verify Hermes Mobile ship claims

## Rule

**No "shipped" / "full E2E passed" / "verified on simulator" without artifact paths in the same turn.**

Continuous E2E ≠ `full-suite.yaml`. Unit tests ≠ Maestro. Device install timestamp ≠ UI behavior proof.

## Step 0 — session

```bash
node tools/agent-session-start.js
```

## Step 1 — canonical status file

```bash
cat hermes-mobile/docs/proofs/continuous/latest.json
```

| Field | Meaning |
|-------|---------|
| `unit` | Jest CI result |
| `e2e` | Maestro **continuous** subset only |
| `flows` | Usually `ship-guard.yaml` + `chat-send-persistence.yaml` — **not** full-suite |
| `updatedAt` | Stale if older than your diff |

## Step 2 — what actually ran

```bash
ls -lt hermes-mobile/docs/proofs/continuous/run-*.log | head -5
tail -30 hermes-mobile/docs/proofs/continuous/run-<latest>.log
```

Record: **platform** (Android USB vs iOS sim), **flows**, **pass/fail**, **timestamp**.

## Step 3 — simulator readiness (before claiming sim E2E)

```bash
xcrun simctl list runtimes
xcrun simctl list devices available | head -20
adb devices
```

| State | Implication |
|-------|-------------|
| `runtime profile not found` / empty runtimes | Sim E2E **blocked** — do not start Maestro |
| No adb device | Continuous runner falls back to sim → often fails |
| Device connected | Prefer `npm run e2e` / continuous on Android |

## Step 4 — run proofs (scoped)

After `hermes-mobile/src` edits:

```bash
cd hermes-mobile
npm test -- --maxWorkers=1                    # or scoped --testPathPattern
npm run e2e:continuous:once                   # if device/sim available
# Full sim suite — only if runtimes exist:
bash scripts/run-simulator-e2e.sh             # runs full-suite.yaml
```

Re-read `latest.json` after Maestro.

## Step 5 — install (device)

```bash
HERMES_MOBILE_FORCE_BUILD=1 bash scripts/install-phone-release.sh
node tools/hermes-mobile-pair.js              # after uninstall or fresh install
```

## Claim matrix

| Claim | Minimum evidence |
|-------|------------------|
| Unit tests pass | Jest output with count + exit 0 |
| Continuous E2E green | `latest.json` e2e: pass + log path |
| Full simulator suite | Green log for `full-suite.yaml` in `docs/proofs/` |
| UX fix on device | Maestro assertion **or** screenshot **or** honest "installed, UI unproven" |
| Composer / chips / overlap | Dedicated test or Maestro — continuous flows may not cover |

## Common false positives

- Todo marked "run full-suite on iOS" without log artifact
- `Internal Distribution` workflow green while `Store Release` red
- APK `lastUpdateTime` ≈ build time without bundle hash match
- Pair opened deep link but phone on wrong network

## Output template

```markdown
| Layer | Status | Evidence |
|-------|--------|----------|
| Unit | pass/fail | jest output |
| Continuous E2E | pass/fail | latest.json + log |
| Full sim suite | not run / pass / fail | log path or blocker |
| Device UI (feature X) | proven / unproven | screenshot / test id |
```

End with: **Can we claim shipped for [feature]?** yes/no + why.
