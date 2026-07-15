# PRODUCTION CRISIS — 2026-07-15

**User:** "how are we publishing a live production app with so many bugs???"  
**Verdict:** Real-user readiness **FAIL**. Production OTA has been shipping without brand-new-user / continuous E2E pass. Macs and USB tunnels are healthy; the app + pair-server layer still lie.

**OTA published this crisis turn:** **NO** (blocked — `latest.json` `e2e=skipped`).

---

## Real-user readiness score: **2 / 10**

| Signal | Status | Evidence |
|--------|--------|----------|
| Continuous E2E | **FAIL / skipped** | `docs/proofs/continuous/latest.json` @ `2026-07-15T15:54:26Z`: `e2e=skipped`, detail phone awake / lease busy — **not pass** |
| Fresh-user Maestro gate before OTA | **MISSING** | `.github/workflows/mobile-ota.yml` runs unit + release-safety then `eas update` — no stranger-cold-start / fresh-user gate |
| USB path (cable + reverse) | Infra OK / product flaky | `adb reverse` live `8642`+`8765`; phone `curl 127.0.0.1:8642/health` → **200** Pro |
| Tailscale path | Infra OK / Find UI broken | Phone `curl` **200** to `100.87.85.85` and `100.94.135.78`; Tailscale peers include `igors-s25-1` active |
| Fresh-install honesty | **LIVE BUG** | Open PR #419 — synthetic USB seed → **Computer via USB · Reconnecting…** before any Mac ever paired |
| Find computers | **LIVE BUG** | Screenshot shows **Found 2** but **one row** (Pro USB only) |
| Keyboard covering connect UI | **LIVE BUG** | ConnectMacGate manual Tailscale/IP field at bottom; keyboard covers CTA (Settings escape #416 landed; connect gate still unprotected) |
| OTA "Check for update" | Intermittent / mistrusted | Visible in some Tools screenshots; user reports invisible / useless while connection broken |
| Agents dying on DNS | Operator/infra | Separate from mobile chat transport; do not round green Connected up to "agents work" |

---

## P0 bugs LIVE in production (no sugarcoating)

### P0-1 — Find computers: "Found 2" / one machine shown (Tailscale feels empty)

- **Screenshot:** `docs/proofs/crisis-2026-07-15/hermes-after-find.png` (also `/tmp/hermes-after-find.png`)
- **What user sees:** Green **"Found 2 local Hermes machines"** + only **Igors-MacBook-Pro** USB row.
- **Root cause (proven this turn):** Stale `pair.json` from `hermes-mobile-pair.js --server-only` served:
  - `hostname: Igors-Mac-mini`
  - `gatewayUrl: http://100.94.135.78:8642` (mini)
  - `localIp: 192.168.68.69` (**Pro LAN IP**)
  - while `GET :8642/health` reports **`Igors-MacBook-Pro.local`**
- Mismatched mini hostname + Pro `localIp` makes discovery/dedupe collapse two Macs into one picker row. Fresh cellular users with **empty** `tailnetProbeHosts` get a true empty Find (no USB pair seed).
- **Infra proof (same turn):** phone → USB/Tailscale health all **200**. Machines exist; the pairing artifact and picker path are wrong.

### P0-2 — Fresh install "Reconnecting…" lie (never-seed USB)

- **PR:** [#419](https://github.com/IgorGanapolsky/mac-yolo-safeguards/pull/419) `fix/fresh-install-never-reconnecting` — open; Jest green; Maestro ship-guard was still in progress at crisis triage.
- **Bug:** Fresh install seeds synthetic USB `127.0.0.1:8642` → **"Computer via USB · Reconnecting…"** before any real Mac.
- **Rule:** Merge only after CI green; **OTA only after** continuous `e2e=pass` **or** fresh-user Maestro pass. Do not claim fixed from merge alone.

### P0-3 — USB "never works" (product) vs reverse (infra)

- Watchdog `com.igor.hermes-usb-reverse-watchdog` loaded; reverses present; phone loopback health **200**.
- Product still fails when pair primary/hijack/wrong-key/Reconnecting path fires. **Connected banner ≠ chat works** (see diagnose-hermes-mobile-connection skill).

### P0-4 — Keyboard covers connect / manual Tailscale entry

- `ConnectMacGate` manual URL field sits under Find computers; Android IME covers the field and primary CTA.
- Related Settings keyboard trap fixed in #416; connect gate still needs inset / avoid.

### P0-5 — Production OTA theater

- `npm run ota:publish` / `mobile-ota.yml` publish production without fresh-user proof.
- `tools/require-device-verified.js` even has `--allow-ota` that can mark `deviceVerified` without `e2e=pass` — unsafe for ship claims.

### P0-6 — Agents dying on DNS

- Operator/gateway DNS failures are real pain; not excused by green Connected. Out of mobile OTA scope for this PR; do not ship "fixed agents" via mobile OTA.

---

## What we refuse to do

1. **No production OTA** until `docs/proofs/continuous/latest.json` has `e2e=pass` **or** `npm run e2e:fresh-user` (stranger-cold-start) passes on a Play-equivalent install.
2. No "fixed" / "Connected" claims from UI banners alone — prove with phone-class `curl` to `/health` and authenticated `/api/sessions`.

---

## Screenshot index (crisis-2026-07-15/)

| File | Shows |
|------|--------|
| `hermes-after-find.png` | Found 2 / one USB row — picker lie |
| `hermes-after-fresh.png` | Tools / Check for update / "Computer linked" while product broken |
| `hermes-after-fresh-attempt.png` | Mini Tailscale Connected + 1.1M token death spiral |
| `hermes-usb-paired.png` | Tailscale Connected UI (banner ≠ reliable chat) |
| `hermes-after-pair.png` / `hermes-after-repair.png` | Pair / repair dogfood artifacts |

---

## Crisis response status (this agent)

| Action | Status |
|--------|--------|
| Honest status board (this file) | Done |
| ThumbGate MISTAKE lesson (shipped without brand-new-user proof) | Captured |
| OTA fresh-user gate in scripts + CI | In crisis PR |
| pair.json `--server-only` refresh from THIS Mac `/health` | In crisis PR |
| ConnectMacGate keyboard inset | In crisis PR |
| PR #419 merge | Await CI; **no OTA** until fresh-user proof |
| Live rewrite of hijacked pair.json + prove both Macs in Find | Execute after code land |

**Owner claim:** `cursor-crisis-20260715` / task **T-CRISIS-20260715**.
