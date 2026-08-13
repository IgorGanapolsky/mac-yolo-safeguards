---
name: prolo-ring-triage-rescue
description: >
  Automated diagnostic, crash suppression, watchdog daemon management, and hardware 
  mode recovery protocol for Prolo Ring and Prolo Studio on macOS. Fixes PySide6/Qt 
  accessibility crashes (`NSAccessibilityEntryPointValueForAttribute`), handles 
  App Status vs Device Status hardware mode toggles, and manages the 
  `com.igor.prolo-ring-watchdog` LaunchAgent. Use when Prolo Ring disconnects, 
  drops Bluetooth HID connection, or Prolo Studio crashes.
---

# Prolo Ring & Prolo Studio Triage & Rescue Protocol

## Trigger Conditions
Activate this skill whenever:
- User reports **Prolo Ring** disconnecting, dropping off macOS, or becoming unresponsive as a mouse/pointer.
- **Prolo Studio** app quits unexpectedly, crashes in background, or generates `SIGSEGV` crash logs in `~/Library/Logs/DiagnosticReports/ProloStudio-*.ips`.
- User asks to fix, debug, or verify **Prolo Ring** or **Prolo Studio** connection health on macOS.

## Technical Context & Root Causes

1. **PySide6/Qt macOS Accessibility Crash (`SIGSEGV`):**
   * Prolo Studio (v1.0.7) ships as an x86_64 PySide6/Qt 6.9 app running under Rosetta on Apple Silicon.
   * It segfaults inside the macOS Accessibility hierarchy walk (`NSAccessibilityEntryPointValueForAttribute` -> `_AXXMIGCopyHierarchy` -> Qt a11y bridge) whenever assistive/AI services query UI elements.
   * **Fix:** Relaunch `ProloStudio` with `QT_ACCESSIBILITY=0` environment variable or supervise via the `com.igor.prolo-ring-watchdog` LaunchAgent.

2. **Hardware Operational Modes (Device Status vs App Status):**
   * **App Status (Config Mode):** Custom BLE GATT stream used exclusively for configuring gestures/macros in Prolo Studio. In App Status, standard macOS Bluetooth HID mouse pointer input is *disabled* or intermittent.
   * **Device Status (HID Mouse Mode):** Standard low-latency Bluetooth mouse pointer mode. Required for daily mouse usage.
   * **Mode Toggle Gesture:** **3 TAPS + PRESS & HOLD** on the ModStrip (touch surface). LEDs will ramp down (fade out) when returning to Device Status.

3. **Background Watchdog Daemon:**
   * LaunchAgent: `~/Library/LaunchAgents/com.igor.prolo-ring-watchdog.plist`
   * Executable: `/Users/igorganapolsky/.local/bin/prolo-ring-watchdog.sh`
   * Poll Interval: Every 15 seconds. Automatically restarts `ProloStudio` via LaunchServices (`open -a`) if it ever dies.

## Step-by-Step Triage & Rescue Procedure

### Step 1: Audit Recent Crash Logs
Run to check for PySide accessibility crash signatures:
```bash
ls -la ~/Library/Logs/DiagnosticReports/ProloStudio-*.ips 2>/dev/null
```
If new `.ips` files exist, inspect the exception type and faulting thread:
```bash
head -n 50 ~/Library/Logs/DiagnosticReports/ProloStudio-*.ips | grep -i "exception\|NSAccessibility"
```

### Step 2: Verify Process & Launch Environment
Check if `ProloStudio` is running:
```bash
pgrep -fl ProloStudio
```
If not running or recovering from a crash, restart cleanly with `QT_ACCESSIBILITY=0`:
```bash
QT_ACCESSIBILITY=0 open -a /Applications/ProloStudio.app
```

### Step 3: Check & Re-arm Watchdog Daemon
Ensure the background watchdog LaunchAgent is loaded:
```bash
launchctl list | grep com.igor.prolo-ring-watchdog
```
If not loaded, bootstrap it:
```bash
launchctl bootstrap gui/$(id -u)/~/Library/LaunchAgents/com.igor.prolo-ring-watchdog.plist
```

### Step 4: Verify Bluetooth Hardware Pairing
Query macOS Bluetooth status:
```bash
system_profiler SPBluetoothDataType | grep -A 6 -i "Prolo Ring"
```

### Step 5: MAC Address Synchronization
If connection fails, check MAC address consistency:
```bash
defaults read com.miracletech.ProloStudio DeviceAddress
```
Fix mismatch using the rescue script:
```bash
tools/prolo-ring-rescue.sh
```

### Step 6: Hardware Reset & Re-pairing Recovery
If the ring remains disconnected:
1. **Toggle Mode:** Perform **3 TAPS + PRESS & HOLD** on the ring's ModStrip until LEDs ramp down.
2. **Charging Dock Hard Reset:** Rub/wiggle charging contacts on magnetic dock for 2 seconds.
3. **Bluetooth Re-pairing:** System Settings → Bluetooth → Forget "Prolo Ring", then re-pair.

## Workspace Tools Reference
- Diagnostic & rescue script: `tools/prolo-ring-rescue.sh`
- Watchdog daemon: `~/.local/bin/prolo-ring-watchdog.sh`
- LaunchAgent: `~/Library/LaunchAgents/com.igor.prolo-ring-watchdog.plist`

## Environment Variables
- `QT_ACCESSIBILITY=0` - Bypass accessibility crashes
- `QT_LOGGING_RULES='qt.bluetooth.*=true'` - Enable Bluetooth debug logging
