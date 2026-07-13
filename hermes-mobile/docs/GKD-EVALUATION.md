# GKD evaluation for Hermes Mobile device testing

**Date:** 2026-07-13  
**Source:** [Threads post](https://www.threads.com/@githubprojects/post/Dat9B7plCWI/gkd-is-an-android-app-that-automates-screen-taps-based-on-user-defined-rules/) + [gkd-kit/gkd](https://github.com/gkd-kit/gkd) (`v1.12.1`)  
**Verdict:** **pilot** (interruptor-dismiss only) — **do not** replace or wire into Maestro continuous E2E.

## What GKD is

[GKD](https://gkd.li) (`li.songe.gkd`) is an on-device Android app that:

1. Runs an **Accessibility Service** (no root).
2. Watches the UI tree continuously.
3. When a **subscription rule** matches (CSS-like [selectors](https://gkd.li/guide/selector)), performs an action (usually tap / back).
4. Loads rules from local JSON5 or remote [subscriptions](https://gkd.li/guide/subscription).

Primary product niche: skip splash ads, dismiss promo dialogs, confirm repetitive system sheets — **reactive macros**, not a test runner.

GKD ships **no default rules**; you add local rules or subscribe to third-party feeds.

## How rules work (minimal model)

A subscription is JSON5 with `apps[]` → `groups[]` → `rules[]`. Each rule has:

| Field | Role |
|-------|------|
| `id` / package | Target app (`com.iganapolsky.hermesmobile`) or global |
| `matches` | Selector, e.g. `[text="Cancel"][visibleToUser=true]` |
| `actionMaximum` / `matchTime` | Rate limits so rules do not hammer the UI |
| `activityIds` | Optional Activity scoping |

Example pattern (global print-sheet dismiss):

```json5
{
  key: 0,
  name: 'Dismiss print sheet',
  rules: [{ matches: '[text="Cancel"][visibleToUser=true]' }],
}
```

## Compare to Hermes Maestro E2E

| Dimension | Maestro (current) | GKD |
|-----------|-------------------|-----|
| Driver | Host CLI over adb / Maestro driver | On-device Accessibility Service |
| Assertions | Yes (`assertVisible`, `assertNotVisible`) | No pass/fail to host |
| CI / LaunchAgent | `com.igor.hermes-mobile-continuous-e2e`, `latest.json` | None |
| Deep links / clear data / force-stop | Yes (`openLink`, `clearState`, adb) | No |
| Fresh-user onboarding proof | Explicit flows + Jest copy contracts | Would **auto-tap** and hide failures |
| Interruptor sheets (print, etc.) | `.maestro/dismiss-print-interruption.yaml` | Reactive always-on dismiss |
| Setup friction | Agent-owned scripts | Accessibility toggle often needs human gesture once |
| License | Maestro commercial/free tiers | GPL-3.0 |

**North-star conflict:** Hermes treats every test as a **brand-new user**. GKD auto-tapping "Find computers" / reconnect CTAs would fake progress and invalidate onboarding proof.

## Decision matrix (requested scenarios)

| Scenario | Use GKD? | Why |
|----------|----------|-----|
| Fresh-user onboarding taps | **No** | Need assertions + honest disconnected UI; Maestro + Jest already own this |
| Clear all / reconnect flows | **No** | State + persistence proofs belong in Maestro/unit tests; GKD cannot clear storage or assert outcomes |
| Force-quit / OTA reload | **No** | Needs `am force-stop`, Expo Updates, host orchestration — adb/scripts, not accessibility taps |
| System interruptors during long dogfood / USB Maestro | **Pilot only** | Same niche as `dismiss-print-interruption.yaml`, but always-on while phone is in pocket |

## Verdict

**Pilot — interruptor-dismiss only.**

- Keep Maestro + continuous LaunchAgent as the **sole** product E2E gate (`docs/proofs/continuous/latest.json`).
- Optional GKD rules live under `tools/gkd/` and are **not** installed by session-start or continuous E2E.
- Do **not** subscribe to third-party GKD feeds on the dogfood phone (ad-skip subscriptions can tap inside Hermes unexpectedly).

## Pilot artifacts

| Path | Purpose |
|------|---------|
| [`tools/gkd/hermes-interruptors.json5`](../tools/gkd/hermes-interruptors.json5) | Minimal local subscription: print / Cancel / permission-ish dismiss only |
| [`scripts/install-gkd-pilot.sh`](../scripts/install-gkd-pilot.sh) | Download official APK + push rule file via adb (Accessibility still needs one on-device enable) |

### Install (agent)

```bash
cd hermes-mobile
bash scripts/install-gkd-pilot.sh   # prefers physical device serial if present
```

After APK install, enable **GKD → Accessibility** once on the device, then import the pushed JSON5 as a **local subscription** (GKD UI: 订阅 → 本地). Keep the subscription **disabled** during fresh-user Maestro runs so rules cannot steal taps.

### Exit criteria for the pilot

Promote beyond "parked docs" only if:

1. Maestro runs still fail from OS sheets **after** `dismiss-print-interruption.yaml` exhausts, **and**
2. A GKD rule set reduces those failures with a before/after count in `latest.json` / Maestro logs, **and**
3. Rules never match Hermes onboarding / Chat primary CTAs.

Otherwise leave GKD uninstalled and delete the pilot later.

## Phone check (2026-07-13 session)

| Serial | State during eval |
|--------|-------------------|
| `R3CY90QPM7E` | Connected after USB refresh; **GKD v1.12.1 installed** (`pm path li.songe.gkd` OK); rules pushed to `/sdcard/Download/hermes-gkd/hermes-interruptors.json5` |
| `emulator-5554` | Also connected (not used for install) |

**Evidence:** `adb install -r` Success (`li.songe.gkd` versionName=1.12.1); Accessibility enable + local subscription import remain one-time on-device (OEM restriction).

**Pre-existing on device:** `/sdcard/Download/hermes-gkd/hermes-mobile-subscription.json` already targeted Hermes CTAs (`Stop stuck run`, summarization stall → fresh chat). That is **out of scope for this pilot** and conflicts with fresh-user Maestro honesty. Prefer the new interruptors-only file; keep Hermes app-group rules disabled during E2E.

## Related

- [TESTING.md](./TESTING.md) — Maestro layers + continuous E2E
- `.maestro/dismiss-print-interruption.yaml` — host-side interruptor dismiss
- [AGENTS.md](../AGENTS.md) — never replace Maestro; brand-new user mindset
