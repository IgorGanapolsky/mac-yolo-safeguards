#!/bin/bash
# run-e2e-proofs.sh — Automated E2E Proof Recording orchestrator for Hermes Mobile.
#
# Runs key Maestro flows, records test progression, and stores the results
# in a structured docs/proofs/ folder to satisfy quality lane checklist items.

set -e

# Export Driver Startup Timeout for XCTest driver robustness
export MAESTRO_DRIVER_STARTUP_TIMEOUT=120000

# Auto-detect Homebrew Java and Maestro CLI
if [ -d "/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home" ]; then
    export JAVA_HOME="/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home"
    export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
elif [ -d "/usr/local/opt/openjdk/libexec/openjdk.jdk/Contents/Home" ]; then
    export JAVA_HOME="/usr/local/opt/openjdk/libexec/openjdk.jdk/Contents/Home"
    export PATH="/usr/local/opt/openjdk/bin:$PATH"
fi

if [ -d "$HOME/.maestro/bin" ]; then
    export PATH="$HOME/.maestro/bin:$PATH"
fi

# Setup directories
WORKSPACE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROOFS_DIR="$WORKSPACE_DIR/docs/proofs"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")

echo "=========================================================="
echo "   Hermes Mobile E2E Proofs Recording Orchestrator"
echo "=========================================================="

# Check if Maestro CLI is installed
if ! command -v maestro &> /dev/null; then
    echo "⚠️  Maestro CLI is not installed or not in PATH."
    echo "   Please install it using: curl -fsSL \"https://get.maestro.mobile.dev\" | bash"
    exit 1
fi

# Detect active Android devices / emulators
echo "🔍 Detecting active Android devices..."
ANDROID_DEVICES=$(adb devices | grep -v "List" | grep "device" | awk '{print $1}') || true
ANDROID_DEVICE_COUNT=0
if [ ! -z "$ANDROID_DEVICES" ]; then
    ANDROID_DEVICE_COUNT=$(echo "$ANDROID_DEVICES" | wc -l)
fi

# Detect active iOS simulators
echo "🔍 Detecting active iOS Simulators..."
IOS_SIMULATORS=$(xcrun simctl list devices | grep "Booted") || true

# Determine target platform
PLATFORM=""
DEVICE_ID=""
BOOTED_BY_SCRIPT=false
DEFAULT_SIM_ID="0BAF0E81-ADF2-4E7E-82DE-6ECA9E781397" # iPhone 17 Pro

if [ "$ANDROID_DEVICE_COUNT" -gt 0 ]; then
    echo "✅ Active Android device detected!"
    DEVICE_ID=$(echo "$ANDROID_DEVICES" | head -n 1)
    echo "   Targeting Android Device: $DEVICE_ID"
    PLATFORM="android"
else
    # Check if we have booted iOS simulator
    if [ -z "$IOS_SIMULATORS" ]; then
        echo "⚠️  No booted iOS simulator found. Attempting to boot default iPhone 17 Pro ($DEFAULT_SIM_ID)..."
        if xcrun simctl list devices | grep -q "$DEFAULT_SIM_ID"; then
            xcrun simctl boot "$DEFAULT_SIM_ID" || true
            BOOTED_BY_SCRIPT=true
            echo "🖥️  Opening macOS Simulator application GUI..."
            open -a Simulator || true
            echo "⏳ Waiting for simulator to finish booting (via bootstatus)..."
            xcrun simctl bootstatus "$DEFAULT_SIM_ID"
            echo "✅ Simulator is fully booted and ready!"
        else
            echo "❌ Default iPhone 17 Pro ($DEFAULT_SIM_ID) not found in the simulator list."
            echo "   Please connect a device or launch a simulator manually."
            exit 1
        fi
    else
        # Find which device is booted
        DEVICE_ID=$(echo "$IOS_SIMULATORS" | head -n 1 | sed -E 's/.*\(([0-9A-F-]+)\).*/\1/')
        echo "✅ Active booted iOS Simulator found: $DEVICE_ID"
    fi
    
    # Ensure Simulator GUI app is open on Mac to keep driver connected
    echo "🖥️  Opening macOS Simulator application GUI..."
    open -a Simulator || true
    sleep 3
    PLATFORM="ios"
fi

PLATFORM_PROOFS_DIR="$PROOFS_DIR/$PLATFORM/$TIMESTAMP"
mkdir -p "$PLATFORM_PROOFS_DIR"

echo "📂 Proofs will be saved in: docs/proofs/$PLATFORM/$TIMESTAMP/"
echo "=========================================================="
echo "🚀 Starting Maestro E2E test runs..."

# List of key flows to run and capture
FLOWS=(
    "launch"
    "navigation"
    "approvals"
)

SUCCESS_COUNT=0
FAILURE_COUNT=0

for FLOW in "${FLOWS[@]}"; do
    FLOW_PATH="$WORKSPACE_DIR/.maestro/$FLOW.yaml"
    if [ -f "$FLOW_PATH" ]; then
        echo -n "🏃 Running E2E flow: $FLOW ... "
        
        LOG_FILE="$PLATFORM_PROOFS_DIR/${FLOW}_run.log"
        
        if maestro test "$FLOW_PATH" > "$LOG_FILE" 2>&1; then
            echo "✅ PASS"
            SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
        else
            echo "❌ FAIL (Check log: docs/proofs/$PLATFORM/$TIMESTAMP/${FLOW}_run.log)"
            FAILURE_COUNT=$((FAILURE_COUNT + 1))
        fi
    else
        echo "⚠️  Flow $FLOW.yaml not found, skipping."
    fi
done

# Clean up booted simulator if we booted it
if [ "$BOOTED_BY_SCRIPT" = true ]; then
    echo "🧹 Shutting down simulator booted by script..."
    xcrun simctl shutdown "$DEFAULT_SIM_ID" || true
fi

echo "=========================================================="
echo "📊 Run Summary:"
echo "   Platform: $PLATFORM"
echo "   Passed:   $SUCCESS_COUNT"
echo "   Failed:   $FAILURE_COUNT"
echo "=========================================================="
echo "✨ E2E Proofs run completed. Dated logs saved to docs/proofs/$PLATFORM/$TIMESTAMP/"

exit $FAILURE_COUNT
