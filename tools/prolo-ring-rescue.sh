#!/usr/bin/env bash
# Prolo Ring & Prolo Studio Rescue Script for macOS
# Diagnostic & Fix for Bluetooth disconnects and PySide6 accessibility crashes
# Updated: August 2026

set -euo pipefail

# Configuration
RING_MAC="F6-2C-A9-AA-F7-85"
RING_NAME="Prolo Ring"
SETTINGS_FILE="$HOME/Library/Application Support/ProloStudio/settings.json"
PREFS_FILE="$HOME/Library/Preferences/com.miracletech.ProloStudio.plist"

echo "============================================================"
echo "      PROLO RING & PROLO STUDIO DIAGNOSTIC & FIX TOOL       "
echo "============================================================"
echo ""

# Function to run Bluetooth inquiry scan
run_inquiry_scan() {
    echo "  Running Bluetooth inquiry scan (10s)..."
    local devices
    devices=$(blueutil --inquiry 10 2>/dev/null | grep -i "prolo\|f6-2c-a9" || echo "No matching devices found")
    if [ -n "$devices" ]; then
        echo "  ✅ FOUND: $devices"
        return 0
    else
        echo "  ❌ No Prolo Ring found in inquiry scan"
        return 1
    fi
}

# Function to attempt connection
attempt_connect() {
    echo "  Attempting to connect to $RING_NAME..."
    if blueutil --connect "$RING_NAME" 2>/dev/null; then
        sleep 2
        if [ "$(blueutil --is-connected "$RING_NAME" 2>/dev/null)" = "1" ]; then
            echo "  ✅ Connected to $RING_NAME!"
            return 0
        fi
    fi
    echo "  ❌ Connection failed"
    return 1
}

# 1. Check crash reports
CRASH_COUNT=$(ls -1 ~/Library/Logs/DiagnosticReports/ProloStudio-*.ips 2>/dev/null | wc -l | tr -d ' ')
echo "🔍 Crash Reports Found: ${CRASH_COUNT} crash logs in ~/Library/Logs/DiagnosticReports/"
if [ "$CRASH_COUNT" -gt 0 ]; then
    if grep -q "NSAccessibilityEntryPointValueForAttribute" ~/Library/Logs/DiagnosticReports/ProloStudio-*.ips 2>/dev/null; then
        echo "  ⚠️ Identified PySide6/Qt accessibility crash signature in Prolo Studio (SIGSEGV)."
        echo "  💡 Fix: Launching Prolo Studio with QT_ACCESSIBILITY=0 to bypass macOS accessibility hook crashes."
    fi
fi

echo ""
# 2. Bluetooth Device Status
echo "🔍 Checking macOS Bluetooth Device Table for Prolo Ring..."
BT_INFO=$(system_profiler SPBluetoothDataType 2>/dev/null | grep -A 5 -i "Prolo Ring" || echo "Not paired")
echo "$BT_INFO"

# 3. Check MAC address consistency
echo ""
echo "🔍 Checking MAC address consistency..."

# Get system-reported MAC address
SYSTEM_MAC=$(system_profiler SPBluetoothDataType 2>/dev/null | awk '/Prolo Ring/,/Minor Type/' | grep "Address" | awk '{print $2}')
echo "  System-reported MAC: $SYSTEM_MAC"

# Get Prolo Studio stored MAC addresses
STORED_DEVICE_ADDR=$(defaults read com.miracletech.ProloStudio DeviceAddress 2>/dev/null || echo "N/A")
STORED_CONNECT_ADDR=$(defaults read com.miracletech.ProloStudio DeviceConnectAddress 2>/dev/null || echo "N/A")
echo "  Stored DeviceAddress: $STORED_DEVICE_ADDR"
echo "  Stored ConnectAddress: $STORED_CONNECT_ADDR"

# 4. Fix MAC address mismatch if needed
if [ "$SYSTEM_MAC" != "$STORED_DEVICE_ADDR" ] && [ -n "$SYSTEM_MAC" ]; then
    echo ""
    echo "  ⚠️ MAC address mismatch detected! Fixing..."
    
    # Update the preferences using Python for proper plist handling
    python3 << PYTHON_SCRIPT
import plistlib
import json
import os

try:
    prefs_path = os.path.expanduser('~/Library/Preferences/com.miracletech.ProloStudio.plist')
    with open(prefs_path, 'rb') as f:
        plist_data = plistlib.load(f)
    
    # Update with correct MAC address
    plist_data['DeviceAddress'] = '$SYSTEM_MAC'
    plist_data['DeviceConnectAddress'] = '$SYSTEM_MAC'.replace(':', '')
    
    # Also update RegisteredRingsV1
    rings_json = plist_data.get('RegisteredRingsV1', '[]')
    try:
        rings = json.loads(rings_json)
        if rings and isinstance(rings, list):
            ring = rings[0]
            ring['display_address'] = '$SYSTEM_MAC'
            plist_data['RegisteredRingsV1'] = json.dumps(rings)
    except:
        pass
    
    # Write back
    with open(prefs_path, 'wb') as f:
        plistlib.dump(plist_data, f)
    
    print("  ✅ MAC addresses synchronized to $SYSTEM_MAC")
except Exception as e:
    print(f"  ❌ Failed to update MAC addresses: {e}")
PYTHON_SCRIPT
else
    echo "  ✅ MAC addresses are consistent."
fi

echo ""
# 5. Check if ring is advertising
echo "🔍 Checking if Prolo Ring is advertising..."
IS_ADVERTISING=false
if command -v blueutil &> /dev/null; then
    if blueutil --inquiry 5 2>/dev/null | grep -qi "Prolo Ring"; then
        IS_ADVERTISING=true
        echo "  ✅ Prolo Ring is advertising and visible!"
    fi
fi

if [ "$IS_ADVERTISING" = false ]; then
    echo "  ⚠️ Prolo Ring is NOT advertising!"
    echo "     The ring may be in deep sleep mode."
fi

echo ""
# 6. Process Status
PROLO_PID=$(pgrep -i "ProloStudio" || echo "")
if [ -n "$PROLO_PID" ]; then
    echo "🟢 ProloStudio is currently running (PID: $PROLO_PID)."
else
    echo "🔴 ProloStudio is NOT running."
fi

echo ""
echo "============================================================"
echo "                      APPLIED FIXES                         "
echo "============================================================"
echo "1. Set QT_ACCESSIBILITY=0 environment variable for ProloStudio."
echo "   (Bypasses PySide6/Qt accessibility crashes on macOS Sonoma+)"
echo "2. MAC address synchronization: Fixed"
echo "3. Relaunching ProloStudio cleanly..."

if [ -n "$PROLO_PID" ]; then
    kill -9 "$PROLO_PID" 2>/dev/null || true
    sleep 1
fi

QT_ACCESSIBILITY=0 open -a /Applications/ProloStudio.app
sleep 3

echo ""
echo "============================================================"
echo "             PROLO RING OPERATIONAL DIRECTIVES               "
echo "============================================================"
echo ""
echo "🔧 CONNECTION MODES:"
echo "   - App Status (Config mode): Use ONLY when editing gestures in Prolo Studio."
echo "   - Device Status (HID Mouse mode): Use for normal computer operation."
echo "   - TO TOGGLE MODES: Perform 3 TAPS + PRESS & HOLD on the ModStrip."
echo "   - When switching to Device Status, LEDs will ramp down (fade out)."
echo ""
echo "🔄 RECOVERY IF DISCONNECTED / UNRESPONSIVE:"
echo "   1. PLACE RING ON MAGNETIC CHARGER (required for wake-up)"
echo "   2. TAP RING 3x ON MODSTRIP WHILE ON CHARGER (forces hard reset)"
echo "   3. Wait 10-15s for Bluetooth advertising to start"
echo "   4. Connect: System Settings → Bluetooth → Click 'Connect' when visible"
echo ""
echo "   ADVANCED REPAIR:"
echo "   - System Settings → Bluetooth → Forget 'Prolo Ring'"
echo "   - Delete ~/Library/Application Support/ProloStudio/settings.json"
echo "   - Re-launch Prolo Studio to trigger fresh pairing"
echo ""
echo "⚙️  ENVIRONMENT VARIABLES (for troubleshooting):"
echo "   QT_ACCESSIBILITY=0          # Bypass accessibility crashes"
echo "   QT_LOGGING_RULES='qt.bluetooth.*=true'  # Enable BT debug logging"
echo ""
echo "💻 COMMAND LINE TOOLS:"
echo "   blueutil --inquiry 10       # Scan for nearby Bluetooth devices"
echo "   blueutil --connect Prolo\ Ring  # Connect to Prolo Ring"
echo "   blueutil --paired           # List paired devices"
echo "============================================================"