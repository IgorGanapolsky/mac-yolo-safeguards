# Why Tailscale / USB connect breaks daily

**Honesty score for agent "fixed" claims on this path: 2 / 10** (until a LaunchAgent owner + simulated heal is proven in the same turn).

Crisis evidence (2026-07-15): phone showed infinite **"Trying to reach your computer automatically…"** while Mac `/health` was **200** and Tailscale peers were online. Root class: **auth + pair artifact poison**, not "Tailscale is down."

## Recurring root causes (ranked)

| # | Failure | Why it returns daily | Permanent owner |
|---|---------|----------------------|-----------------|
| 1 | **Wrong `API_SERVER_KEY` on phone** (`invalid_api_key` / 401 on `/api/sessions`) while `/health` stays 200 | Multi-Mac keys differ; agents push laptop key onto mini URL (or stale SecureStore key survives re-pair); silent heal loops forever | `wrongKeyRecovery` + GatewayContext heal exit; Mac `com.igor.hermes-tailscale-reachability` auto-pair on 401 when USB present |
| 2 | **`pair.json` primary hijack** (mini hostname + Pro LAN IP, or vice versa) | Concurrent `hermes-mobile-pair.js` / `--mini-tailscale` / `--server-only` writers | `writePairJsonAtomic` + `withPairJsonLock` in `hermes-mobile-pair-lib.js` |
| 3 | **`adb reverse` drops** (8642/8765) with no OS notification | adbd flaps after dumps/installs; phone **cannot** re-assert reverse | `com.igor.hermes-usb-reverse-watchdog` (15s) + **ntfy on failed re-apply** |
| 4 | **Agent overclaim "Connected"** | Banner flips on optimistic state / `/health` alone; chat needs authenticated `/api/sessions` | Skill `diagnose-hermes-mobile-connection`; ban "fixed" without Connected UI **and** heal simulation |
| 5 | **Android cleartext / NSC** for `100.x` / `.ts.net` | Play/store binary lags repo XML; OTA cannot ship native NSC | Must ship in **Android 1.0 store binary** (PR #422 / G-02). Repo has `cleartextTrafficPermitted=true` + `ts.net` domains — **verify Play APK**, not source alone |
| 6 | **Phone Tailscale VPN off** | Peer shows `offline, last seen…` | Not Mac-healable; product must surface "turn on Tailscale" — infra keepers cannot fix this |
| 7 | **Path decays to DERP** (high RTT) | Double-CGNAT (hotspot + T-Mobile home) | `com.igor.tailscale-path-keeper` (rebind/restun) — **path quality**, not chat auth |

## What is NOT a fix

- One `hermes-mobile-pair.js` run with no LaunchAgent owner
- Claiming USB works because `adb reverse --list` looked good once
- Claiming Tailscale works because the green Connected banner flashed
- OTA for native Network Security Config changes

## Proof bar (same turn)

1. `curl` both `100.87.85.85:8642` and `100.94.135.78:8642` → `/health` **and** authenticated `/api/sessions` = 200  
2. Phone UI dump/screenshot shows **Connected** (not Connecting / Trying to reach)  
3. Simulated failure self-healed: e.g. `adb reverse --remove tcp:8765` → watchdog restores; or reachability `--once` reports reachable  
4. LaunchAgents loaded: `com.igor.hermes-usb-reverse-watchdog`, `com.igor.hermes-tailscale-reachability`

## Remaining single points of failure

- **Phone Tailscale VPN** must be on for cellular/off-LAN chat (Mac agents cannot toggle it).
- **Store binary lag** for NSC — Play users until 1.0 with cleartext ships.
- **1.6M-token mega sessions** can make Connected UI feel "broken" (composer disabled) even when transport is fine.
- **Gateway requires auth even on loopback** (`/api/sessions` without key → 401) — empty/wrong SecureStore key is always fatal.
