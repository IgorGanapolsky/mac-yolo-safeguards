---
name: prolo-ring-moodstrip
description: >
  Autonomous MoodStrip setup for Prolo Ring Bluetooth media controls.
  Configures Play/Pause, Next, Previous, Volume controls via Bluetooth HID.
  Handles pairing, flashing, and connection monitoring.
version: "1.0.0"
author: "Autonomous CTO Agent"
tags: ["prolo", "bluetooth", "media-control", "headset", "automation"]
---

# Prolo Ring MoodStrip Skill

## Overview

This skill automates the complete setup of the Prolo Ring as a Bluetooth headset media controller with MoodStrip configuration.

## Trigger

Use this skill when:
- `moodstrip` is mentioned
- `prolo ring media control` is requested
- `bluetooth headset setup` for Prolo Ring
- Setting up the ring as a media controller

## Prerequisites

- Prolo Ring (Firmware 1.0.7+1)
- macOS Bluetooth enabled
- ProloStudio 1.0.7+ installed

## Usage

```bash
# Basic setup
prolo-ring-moodstrip setup

# Check status
prolo-ring-moodstrip status

# Test controls
prolo-ring-moodstrip test

# Diagnose issues
prolo-ring-moodstrip diagnose

# Reset configuration
prolo-ring-moodstrip reset
```

## Actions

### 1. Setup MoodStrip Controls

Configures the following gesture mappings:

| Gesture | Action |
|---------|--------|
| Tap (touch) | Play/Pause |
| Swipe Right | Next Track |
| Swipe Left | Previous Track |
| Swipe Up | Volume Up |
| Swipe Down | Volume Down |

### Podcast Macro — Android Google Music ONLY

**NOT Apple Music. NOT Mac Podcasts.**

| Item | Value |
|------|--------|
| Phone | Galaxy `R3CY90QPM7E` |
| App | **Google Music / YouTube Music** `com.google.android.apps.youtube.music` |
| Surface | Podcasts → latest → play |
| Ring gesture | Trackpad Hold + Double Tap (after Flash) |
| Native binding | Keyboard **F13** → phone app intercepts (preferred, no Mac needed) |
| Mac bridge | Hotkey Ctrl+Alt+Cmd+P → adb → phone (fallback when phone on USB/wireless adb) |
| CLI | `bin/prolo-android-podcasts setup` |

**Delivery paths (in order):**
1. **Phone-native (preferred):** install `ProloYouTubePodcasts` APK (`~/Library/Application Support/ProloYouTubePodcasts`) on the phone, enable its accessibility service; bind ring gesture → Keyboard **F13**; Flash to Ring in ProloStudio GUI; pair ring to phone. The service intercepts F13 and drives Library → Podcasts → New Episodes → Play. Works with no Mac in the loop.
2. **Mac adb bridge (fallback):** ring paired to Mac sends F13 (or Ctrl+Alt+Cmd+P) → Hammerspoon runs `tools/prolo-android-podcast-macro.js exec` over adb. Requires phone on USB/wireless debugging.

Note: the exact "trackpad Tap + Hold" is firmware-reserved (Temporary Cursor / Joystick Assist); nearest bindable is AirTaps `actionLongHoldAir2xTap` (Trackpad Hold + Double Tap). Flash must be done in the ProloStudio GUI; only the wearer can confirm the gesture actually fires.

```bash
bin/prolo-android-podcasts status
bin/prolo-android-podcasts setup   # requires adb device
bin/prolo-android-podcasts exec
```

Requires phone on **USB debugging** or wireless adb. Without adb, the on-device F13 service (path 1) is the only path that can open+play on the phone.


### 2. Pair Ring

Puts the ring in pairing mode and attempts connection:
- Enables Bluetooth discoverable mode
- Scans for "Prolo Ring" device
- Attempts auto-connection by name or MAC address

### 3. Flash Configuration

Saves the settings to the ring firmware:
- Writes profile_snapshot to preferences
- Updates sync timestamp
- Reports ready status for "Flash to Ring"

### 4. Monitor Connection

Continuous monitoring with auto-reconnect:
- Checks connection every 30 seconds
- Attempts reconnection on dropout
- Logs connection events to `~/Library/Logs/`

## Technical Details

### Bluetooth Profile
- Uses standard Bluetooth HID profile
- Device Class: Human Interface Device
- Services: HFP, AVRCP, A2DP, HID

### Limitations
**Seek (scrub/seekbar) is NOT available** via Bluetooth HID standard profile.

### macOS Settings Required
```bash
defaults write com.apple.Bluetooth BluetoothAutoSeekPointingDevice -bool true
```

## Files Created

| Location | Purpose |
|----------|---------|
| `bin/prolo-ring-moodstrip` | Main CLI tool |
| `tools/prolo-ring-moodstrip.js` | Node.js automation |
| `~/Library/LaunchAgents/com.igor.moodstrip-monitor.plist` | Connection monitor |
| `docs/PROLO_RING_MOODSTRIP_SETUP.md` | Full documentation |

## Integration

- **With ProloRing Agent**: Uses `prolo-ring-agent` for diagnostics
- **With System Monitor**: Integrates with `com.igor.*` launch agents
- **With Mobile Tools**: Works with `adb` for Android media control debugging

## Troubleshooting

### Ring Not Connecting
1. Put ring on finger
2. Tap ModStrip 2×, then HOLD for 3 seconds (pairing mode)
3. Look for "Prolo Ring" in Bluetooth preferences
4. Click Pair

### Controls Not Working
1. Verify "Flash to Ring" in ProloStudio
2. Toggle to Device Status (3× Tap + HOLD)
3. Close ProloStudio completely

## Version History

- v1.0.0 (2026-08-15): Initial autonomous setup
- v1.0.1: Added connection monitoring
- v1.0.2: Enhanced diagnostic output
- v1.1.0: Added Podcast Macro (double-tap + hold → Open Music → Podcasts → Latest)

## Author Notes

This skill implements the TRIAGE RESCUE principles:
- Never edit plist directly (GUI or proper defaults command)
- Never claim sync happened without verification
- Never configure from file (must use ProloStudio interface)

The ring firmware must be flashed via ProloStudio GUI for proper GATT binding.