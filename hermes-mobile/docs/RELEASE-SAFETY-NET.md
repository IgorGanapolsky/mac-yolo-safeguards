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
| **Connected ⊕ Wrong key** simultaneous UI | **SHIP BLOCK** | Green **Connected** while Wrong-key banner is visible is release-blocking. `resolveChatLinkDisplay` + `isConnectedWrongKeyContradiction` + auth probe force red / Find computers CTA. Gates: `gatewayConnection.test.ts`, `gatewayClient.test.ts`, `releaseSafetyNet.test.ts`, `REAL-USER-READINESS.md`. |

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
| Tier-1 emulator | `pull_request` + `push` on hermes-mobile paths | `.github/workflows/mobile-e2e.yml` → **ship-guard only** on Android emulator |
| Continuous local | LaunchAgent 15m | `ship-guard` + `chat-send-persistence` (USB Android preferred) |

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

## Still needs GitHub branch-protection settings (human admin / gh api with admin token)

Workflow YAML alone does **not** make the check required. Still needed on `main`:

1. Settings → Branches → Branch protection rule for `main`
2. Require status checks to pass before merging
3. Add check name exactly: **`Maestro ship-guard (Android emulator)`** (job name from mobile-e2e.yml)
4. Keep existing CI checks (`Hermes Mobile typecheck and tests`, etc.)
5. Optionally require conversation resolution / up-to-date branch — outside this task

Until step 3, PRs run the emulator job but can still merge red.
