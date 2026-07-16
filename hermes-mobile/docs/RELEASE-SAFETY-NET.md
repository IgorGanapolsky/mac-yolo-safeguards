# Hermes Mobile — Release Safety Net (T-114)

Prevention hardening so today's bug class fails closed in CI / install / continuous E2E — without editing contended app sources (`ChatScreen.tsx`, `App.tsx`, `leashUx.ts`, notification/approvals implementations).

## Bug → would CI catch?

| Bug (desired behavior) | Gate today | Where |
|------------------------|------------|--------|
| Glanceable approvals toggle does not steal the active tab / drop Hermes | **Partial → strong** | Unit: T-113 `leashUx` (on fix branch). Maestro: `.maestro/regression-glanceable-tab.yaml` (tier-0 required). PR emulator: `ship-guard` only (does not toggle Glanceable). |
| User prompt bubble visible after send | **Unit yes / Maestro flaky** | Unit: `ChatScreen.test.tsx` optimistic send. Maestro: `chat-send-persistence.yaml` + `regression-chat-send-visible.yaml`. **Open harness bug:** Android Maestro `inputText` often fails to hydrate RN `TextInput` (IME composing) — E2E can red-fail with a correct app. |
| Auto-scroll / latest message visible after send | **Unit yes** | `ChatScreen.test.tsx` `scrollToEnd` suites. Maestro send flows assert bubble / text after scroll. |
| No foreground notification while app active | **Unit yes** | `hermesNotifications.test.ts` + `GatewayContext.test.tsx`. No Maestro assertion (notification shade is OS-owned). |
| Leash pull-to-refresh spinner clears | **Unit + Maestro** | `ApprovalsScreen.test.tsx` spinner clearing. Maestro: `regression-leash-refresh.yaml`. |
| Chat header shows real model, not bare `Hermes (active)` | **Unit yes** | `ChatScreenHeader.test.tsx` (`buildHermesStatusLabel`). Maestro: `regression-chat-header-model.yaml` asserts status row present. |
| `/health` green but chat API key wrong (multi-Mac fleet) | **Unit yes** | `gatewayClient.test.ts` auth probe + `gatewayConnection.test.ts` wrong-key label; `tests/test-hermes-mobile-pair.sh` mini SSH key; `releaseSafetyNet.test.ts` contract. |
| **Connected ⊕ Wrong key** simultaneous UI | **SHIP BLOCK** | Fresh install or re-pair showing green **Connected** + red Wrong-key banner is a **state-machine failure**, not a setup hiccup. Never ship. `effectiveAuthMismatch` (health ⊕ banner) forces header/Codex off green; USB must not auto-steal over Tailscale pair. Gates: `gatewayConnection.test.ts`, `ChatScreenHeader.test.tsx`, `gatewayProfiles.test.ts` (no USB auto-pick), `gatewayClient.test.ts`, `releaseSafetyNet.test.ts`, `REAL-USER-READINESS.md`. |
| False **Mac · USB** header (wrong machine or not cabled) | **SHIP BLOCK** | Loopback URL + stale red/null health must not show a saved Mac name as if live on USB. `resolveMachineDisplayName` only names the cable from green/amber reachable `/health` hostname; otherwise `Computer via USB · USB`. Gates: `chatMachineHeader.test.ts`, `preventRecurrenceContract.test.ts` (`assertUsbHeaderIdentityLaw`). |

## Wrong-key class (T-120 / T-227, 2026-07-08 → 2026-07-14)

**Failure mode:** Phone saved Mac mini URL (`100.94.135.78:8642`) with MacBook Pro `API_SERVER_KEY`. Unauthenticated `GET /health` returned 200 → UI showed Connected; authenticated `POST /api/sessions/.../chat` returned 401 → "No reply — tap ↑ again". Escalation (2026-07-14): green **Connected** + red **Wrong key** at once = **SHIP BLOCK**.

**Prevention:**

| Layer | What it catches | Evidence |
|-------|-----------------|----------|
| Pair script | Laptop pairs mini with laptop key | `tests/test-hermes-mobile-pair.sh` — mini URL must SSH-fetch key |
| Auth probe | Reachability alone never Connected | `gatewayClient.test.ts` — empty key / 401 → `authMismatch` + `level: red` |
| UI XOR | False Connected beside Wrong key | `gatewayConnection.test.ts` — `wrongKeyBannerActive` / `isConnectedWrongKeyContradiction` |
| Release contract | Regression in pair/auth wiring | `releaseSafetyNet.test.ts` + this doc + `REAL-USER-READINESS.md` SHIP BLOCK row |
| Recovery CTA | Settings homework as primary | Wrong-key banner → **Find computers** (not Settings → …) |

Pair Mac mini over Tailscale: `node tools/hermes-mobile-pair.js --mini-tailscale` (never manual key paste from laptop `.env`).

## CI / E2E gates

| Layer | Trigger | What runs |
|-------|---------|-----------|
| Tier-0 | Every PR (`CI` / `mobile-checks`) | `npm run e2e:validate` — structural Maestro checks; required flow list includes regression YAMLs |
| Tier-0 contract | Every PR + mobile-e2e job | `npm run test:release-safety` (includes `releaseSafetyNet.test.ts`) |
| Tier-1 emulator (paired/demo) | `pull_request` + `push` / `merge_group` | `.github/workflows/mobile-e2e.yml` → **Maestro ship-guard** (`demo=1` + `EXPO_PUBLIC_E2E_AUTOMATION=1`) |
| Tier-1 emulator (stranger) | same | **Maestro stranger cold-start** — `clearState`, **no** `demo=1`, `EXPO_PUBLIC_E2E_AUTOMATION=0`, assert `connect-mac-gate` + no "Reconnecting" |
| Pre-OTA | `ota:publish` / `mobile-ota.yml` | `scripts/require-stranger-cold-start-proof.cjs` — **hard by default**: structural contract + runtime proof (proof JSON or green GitHub stranger check). Soft only with `--soft` / `HERMES_OTA_REQUIRE_STRANGER_PROOF=0` |
| Continuous local | LaunchAgent 15m | `ship-guard` + `chat-send-persistence` (USB Android preferred) |

**SHIP BLOCK (2026-07-15 crisis):** Merging / OTA on ship-guard green alone is **insufficient**. ship-guard hides ConnectMacGate via E2E automation + opens `hermes://setup?demo=1`. Fresh-user proof is the stranger cold-start job.

SHA pins (as of T-114):

- `actions/setup-java@c1e323688fd81a25caa38c78aa6df2d33d3e20d9` (v4.8.0)
- `reactivecircus/android-emulator-runner@a421e43855164a8197daf9d8d40fe71c6996bb0d` (v2.38.0)

## Install script gate

`scripts/install-phone-release.sh` now:

1. Runs unit tests + `test:release-safety` and **refuses** install on failure (`HERMES_INSTALL_SKIP_TESTS=1` to override).
2. Reads `docs/proofs/continuous/latest.json` and **warns** when `e2e != pass`.
3. Hard-blocks only when `HERMES_INSTALL_REQUIRE_E2E=1` and E2E is not `pass`. Soft continue on `skipped`/`fail` by default so agent installs are not stranded without a USB phone.

## Continuous E2E load-skip fix

`run-continuous-e2e.sh` no longer immediately writes `e2e=skipped` at load `> 6`. Default max load scales to `hw.ncpu` (floor 6). When overloaded it **queues** up to `HERMES_E2E_LOAD_WAIT_SEC` (default 900s), then skips with an explicit waited detail. Override: `HERMES_E2E_FORCE=1`. `run-e2e.sh` uses the same scaled max for AVD boot.

## chat-send-persistence root cause

**Primary harness failure mode (documented 2026-07-04 T-70):** Maestro Android `inputText` does not reliably update React Native TextInput state (IME / composing region). Send then fires with empty composer → bubble assertions fail even when unit optimistic-send is green.

**Mitigations in this net:**

- Keep the flow as a desired-behavior regression (fail closed when harness+app both work).
- Prefer `chat-message-user` testID + shorter unique probe string.
- Do **not** put typing flows on the PR emulator required path (ship-guard stays typing-free).
- Unit coverage remains the trustworthy send/scroll/header gates until a paste/clipboard Maestro path is proven.

## GitHub branch-protection (required checks)

Workflow YAML alone does **not** make checks required. `main` must require **both**:

1. **`Maestro ship-guard (Android emulator)`** — paired/demo critical path
2. **`Maestro stranger cold-start (Android emulator)`** — brand-new user / ConnectMacGate (T-342)

Also keep `Hermes Mobile typecheck and tests` (and other existing CI checks).

Admin apply (when `gh` has admin on the repo):

```bash
# Read current contexts, then PATCH to include both Maestro jobs.
gh api repos/IgorGanapolsky/mac-yolo-safeguards/branches/main/protection/required_status_checks \
  --method PATCH \
  -f strict=true \
  --input - <<'EOF'
{"strict":true,"contexts":[
  "Hermes Mobile typecheck and tests",
  "Maestro ship-guard (Android emulator)",
  "Maestro stranger cold-start (Android emulator)"
]}
EOF
```

If the API returns Forbidden, document the gap and apply via GitHub Settings → Branches → `main`.
Until stranger cold-start is required, PRs can still merge with only ship-guard green — that is the crisis hole.

The stranger Maestro job itself runs the script with `--soft` (structural fail-fast only) so it can produce the runtime proof. **Hard OTA (default):** `require-stranger-cold-start-proof.cjs` always enforces the workflow/flow contract **and** requires runtime proof (local `docs/proofs/**/latest.json` with `strangerColdStart=pass`, or GitHub Checks `"Maestro stranger cold-start (Android emulator)"=success` on the publish SHA). `mobile-ota.yml` polls the parallel stranger job up to ~35m. Soft-warn opt-out is `--soft` or `HERMES_OTA_REQUIRE_STRANGER_PROOF=0` for local dry-runs only — never for production publish.
