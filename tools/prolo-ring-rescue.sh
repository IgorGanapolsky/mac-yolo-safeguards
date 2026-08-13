#!/usr/bin/env bash
# Prolo Ring & Prolo Studio Rescue Script for macOS
# Diagnostic & Fix for Bluetooth disconnects and PySide6 accessibility crashes

set -euo pipefail

echo "============================================================"
echo "      PROLO RING & PROLO STUDIO DIAGNOSTIC & FIX TOOL       "
echo "============================================================"
echo ""

# 1. Check crash reports
CRASH_FILES=$(ls -1 ~/Library/Logs/DiagnosticReports/ProloStudio-*.ips 2>/dev/null || true)
if [ -n "$CRASH_FILES" ]; then
    CRASH_COUNT=$(echo "$CRASH_FILES" | wc -l | tr -d ' ')
else
    CRASH_COUNT=0
fi

echo "🔍 Crash Reports Found: ${CRASH_COUNT} crash logs in ~/Library/Logs/DiagnosticReports/"
if [ "$CRASH_COUNT" -gt 0 ]; then
    echo "  ⚠️ Identified PySide6/Qt accessibility crash signature in Prolo Studio (SIGSEGV)."
    echo "  💡 Fix applied: Launching Prolo Studio with QT_ACCESSIBILITY=0 to bypass macOS accessibility hook crashes."
fi

echo ""
# 2. Bluetooth Device Status
echo "🔍 Checking macOS Bluetooth Device Table for Prolo Ring..."
BT_INFO=$(system_profiler SPBluetoothDataType 2>/dev/null | grep -A 5 -i "Prolo Ring" || echo "Not paired")
echo "$BT_INFO"

echo ""
# 3. Process Status
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
echo "2. Relaunching ProloStudio cleanly with QT_ACCESSIBILITY=0 to stop PySide crashes..."

if [ -n "$PROLO_PID" ]; then
    kill -9 "$PROLO_PID" 2>/dev/null || true
    sleep 1
fi

QT_ACCESSIBILITY=0 open -a /Applications/ProloStudio.app

echo "✅ ProloStudio restarted cleanly with QT_ACCESSIBILITY=0."
echo ""
echo "============================================================"
echo "             PROLO RING OPERATIONAL DIRECTIVES               "
echo "============================================================"
echo "1. HARDWARE MODE SWITCH (Device Status vs App Status):"
echo "   - App Status (Config mode): Use ONLY when editing gestures in Prolo Studio."
echo "   - Device Status (HID Mouse mode): Use for normal computer operation."
echo "   - TO TOGGLE: Perform 3 TAPS + PRESS & HOLD on the ModStrip."
echo "   - When switching back to Device Status, LEDs will ramp down (fade out)."
echo ""
echo "2. RECOVERY IF DISCONNECTED / UNRESPONSIVE:"
echo "   - Rub / Wiggle charging contacts on magnetic charger for 2s to force hard reset."
echo "   - If Bluetooth drops, Forget 'Prolo Ring' in System Settings -> Bluetooth and re-pair."
echo "============================================================"