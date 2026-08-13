---
name: prolo-ring-triage-rescue
description: >
  Triage the Prolo Ring / Prolo Studio on macOS when the ring "keeps
  disconnecting" or when changing its keymap. Its #1 job is to stop you editing
  the plist: ProloStudio holds config in Qt memory, overwrites the plist on
  launch, and never sends BLE commands from a file edit. Second job: stop you
  diagnosing Bluetooth when the app is what died. Encodes verified 2026-08-12/13
  evidence. Use when Prolo Ring disconnects/drops HID, Prolo Studio crashes, or a
  gesture/macro must be remapped. Do NOT use for other BLE peripherals.
---

# Prolo Ring / Prolo Studio triage

> **Merge note:** this file has been overwritten several times by parallel agents.
> Two claims keep getting re-added that are PROVEN WRONG — `QT_ACCESSIBILITY=0
> open -a` (no-op) and a "sync MAC address" step (destructive). Read the non-fix
> table before re-adding either. Everything else here has been merged, not
> clobbered.

## RULE 1: the plist is NOT the device. Never configure from a file.

*(Independently confirmed twice on 2026-08-13.)*

- ProloStudio keeps configuration in **Qt app memory** and **overwrites the plist
  on launch**. A value written to disk survives only until the app next starts.
- **Editing the plist sends NO BLE GATT commands** — the ring never learns about
  it, whatever the file says.
- Keymaps (`actionNavTap`, `actionNavLongHold`, …) and `auto_sleep` **must** be
  changed in the Prolo Studio GUI, which pushes them over GATT in App Status.

Proven the hard way: an agent set `actionNavLongHold` to `Escape` in the plist. It
read back correctly, `profile_synced_at` looked fresh, it was reported to the user
as live — and an hour later the app had reverted it to `Ctrl+Meta`. **A plist read
is not proof of device state.** Same trap applies to `auto_sleep`.

Corollary: a `defaults write` to the pairing fields is worse than useless, it is
destructive — see the pairing-record section.

## RULE 2: crash-report count is not outage count

ProloStudio died 6 times on 2026-08-12 writing **zero** `.ips` files. Read
`~/Library/Logs/prolo-ring-watchdog.log`, not the report count.

## RULE 3: do NOT claim jetsam killed it

A `JetsamEvent-*.ips` is a snapshot of ~750 processes. ProloStudio appears in it
routinely with **no `reason` field**, meaning it was *not* killed — only entries
carrying `reason` were. Misreading this produced a bogus "second root cause",
disproved by the process being alive across the supposed kill. Correct parse:
[[diagnose-mac-app-crash-loop]].

## Verified environment (2026-08-13, MacBook Pro M5, macOS 26.5.2)

- ProloStudio 1.0.7 / build 20260727, `com.prolotechnology.prolostudio`
- Preferences domain is **`com.miracletech.ProloStudio`** (NOT the bundle id)
- Binary is **x86_64 only** (`lipo -archs`) → runs under **Rosetta**
- Firmware 1.0.7+1, Pro edition

## The pairing record: capture before touching, never write

An agent added a `sync_mac_address()` helper to the watchdog; it corrupted the
pairing record and the app then died every 30–60 minutes.

- `DeviceConnectAddress` holds a **CoreBluetooth peripheral NSUUID**
  (`C4B5A055-E0AF-36B5-1F23-2DC2EFB6D9CD`), *not* a hardware address. macOS
  CoreBluetooth **cannot** address a peripheral by MAC — it only vends opaque
  NSUUIDs. A colon-stripped MAC (`F62CA9AAF785`) there breaks reconnection.
- `DeviceAddress` (`85:F7:AA:A9:2C:F3`) **legitimately differs** from what
  `system_profiler` reports (`F6:2C:A9:AA:F7:85`). Different identifiers, not a
  mismatch to repair.
- ProloStudio then rewrites `RegisteredRingsV1` from the bad values, destroying
  the last good copy.

## Three fixes that look right and do NOTHING

| Non-fix | Why |
|---|---|
| `QT_ACCESSIBILITY=0 open -a ProloStudio` | Env vars **do not cross `open`** (LaunchServices spawns the app fresh; the working flag is `open --env VAR=x`), AND `QT_ACCESSIBILITY` **appears nowhere in the bundle** (`grep -rao QT_ACCESSIBILITY /Applications/ProloStudio.app` → empty). On macOS, Qt a11y has no env kill-switch; that var is the Linux AT-SPI one. |
| `~/Library/LaunchAgents/com.prolo-studio.protected.plist` | Sets that same dead var, and has `RunAtLoad: false` with `runs = 0` — never executed. |
| Any "sync MAC address" step | Actively destructive — see above. |

## Triage procedure

### 1. Boot boundary FIRST
```bash
sysctl -n kern.boottime; date; uptime
/bin/ls -lt ~/Library/Logs/DiagnosticReports/ | grep -i prolo
```
Crashes predating boot describe a **previous session**. All 8 segfaults on
2026-08-12 were pre-boot; presenting them as the live cause was an error.

### 2. Classify deaths
```bash
python3 -c "
import json,glob,os
for f in sorted(glob.glob(os.path.expanduser('~/Library/Logs/DiagnosticReports/ProloStudio-*.ips'))):
    h,b=open(f).read().split(chr(10),1); d=json.loads(b)
    th=d['threads'][d['faultingThread']]
    ax=any('AXXMIGCopyHierarchy' in (fr.get('symbol') or '') for fr in th['frames'][:12])
    print(os.path.basename(f), d['exception'].get('signal'), 'AX-path=',ax, 'translated=',d.get('translated'))
"
```
Verified segfault class: `EXC_BAD_ACCESS` in the Accessibility hierarchy walk
(`_AXXMIGCopyHierarchy` → Qt a11y bridge), a different garbage address each time.
Trigger is an external assistive client enumerating the UI; this Mac has ~22 apps
holding Accessibility, several always-on AI screen-readers:
```bash
sqlite3 "/Library/Application Support/com.apple.TCC/TCC.db" \
  "select client,auth_value from access where service='kTCCServiceAccessibility';"
```
(`auth_value` 2 = granted, 0 = denied — count only the 2s.)

### 3. Watchdog health
```bash
launchctl print gui/$(id -u)/com.igor.prolo-ring-watchdog | grep -E "state|runs|last exit"
tail -20 ~/Library/Logs/prolo-ring-watchdog.log
```
`~/.local/bin/prolo-ring-watchdog.sh` — 15s poll, `open -a`, **read-only on prefs**
(`grep -c 'defaults write'` must be 0). Pause: `touch ~/.prolo-watchdog-off`.

## You CANNOT measure the App Status link programmatically

Both instruments tried on 2026-08-13 are blind. Do not repeat them:

- **`blueutil` / `system_profiler` connected-state** — reports *classic Bluetooth*.
  In App Status the ring holds a custom GATT link that never appears there. A
  30-minute poll read "not connected" throughout while the ring was in use.
  Absence of a transition is NOT absence of a drop.
- **`blueutil` "recent access date"** — equals the *query* timestamp, not ring
  activity (two samples 31 min apart both matched query time).

`settings.json` is **encrypted** (Fernet, `PROLO` header) and the app logs nothing
to the unified log. **The wearer is the only reliable instrument — ask them.**

## Remapping a gesture (the only path that works)

GUI only. To automate it, use **coordinate clicks** (`cliclick`, CGEvents) and
**never** AppleScript AX traversal — walking this app's Accessibility tree is what
segfaults it. Screenshot with `screencapture`, locate controls visually, click by
coordinate. Taking over the user's cursor/Spaces needs an explicit ask first.

Never call a remap done until the wearer confirms the key actually fires on the
ring. A plist read, a fresh `profile_synced_at`, and a successful click are all
compatible with nothing having changed on the hardware.

## Gestures — quote ONLY these (FW/APP 1.0.6 manual, verbatim)

Source `downloads.proloring.com/Prolo_Ring_Manual_1.0.6.pdf` via `pdftotext -layout`.
**Never state a gesture from memory or a web snippet.**

- **Toggle Device Status / App Status:** `3× Tap + Press & Hold` (ModStrip)
- **Manual Advertise / Broadcast:** `2× Tap + Press & Hold` (ModStrip)
- **Unlock (Palm Lock):** `1× Tap + Press & Hold` (ModStrip)
- **Enter Cursor Mode:** swipe left · **Navigation Mode:** swipe right (ModStrip)
- **Forced Reboot (Charging Contact Method):** charger to power → ring on contacts
  → *"Wiggle / rub the ring's charging contacts against the charger pins a few
  times to re-trigger charging detection"*. **This IS documented — do not dismiss
  it as invented** (I wrongly did).

**ModStrip tap+hold is RESERVED and not user-bindable:** 1× = Connect/Switch/Unlock,
2× = Pairing, 3× = Toggle Device/App Status, 4× = Shutdown. Swipes switch modes.
Requests to "put Esc on ModStrip tap+hold" cannot be satisfied — offer Navigation
Mode trackpad Tap/Hold, or `Mod Hold + Tap` (documented Customizable).

## THE STRATEGIC FIX: Flash to Ring, then return to Device Status

> *"After you Flash to Ring, your customizations are saved on the ring, so Prolo
> Ring works anywhere as a standard Bluetooth HID device — no app or driver
> needed."*
> *"To use the ring normally after configuration with Prolo Studio App, toggle the
> ring back to 'Device Status'."*

Correct end state: configure in App Status → **Flash to Ring** → `3× Tap + Press &
Hold` back to **Device Status**. Bindings then run from ring firmware with
ProloStudio closed, and every crash mode here stops mattering. macOS also
auto-reconnects HID pointers (`BluetoothAutoSeekPointingDevice = 1`) — a benefit
App Status does not get. App Status is for *occasional configuration*, not wear.

`profile_synced_at` reflects an app↔ring sync in App Status. It is NOT proof that
Flash to Ring happened. Different actions — do not conflate.

## Never proven

That the ring drops at the **instant** the app dies. Inferred from the manual plus
App Status registration; never observed directly. Ask the wearer.

## Escalation

Vendor bug: x86-only Qt app under Rosetta. Real fix = arm64 build.
hello@proloring.com · Discord `HMm6HynDRA` · attach `ProloStudio-*.ips`.
