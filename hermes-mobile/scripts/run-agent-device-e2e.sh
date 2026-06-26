#!/bin/bash
# run-agent-device-e2e.sh — Accelerated E2E Testing and Replay Runner for Hermes Mobile
#
# Utilizes Callstack's agent-device test --maestro compatibility engine
# to execute all Maestro flows at accelerated speeds and generate structured JUnit reports.

set -e

# Setup directories
WORKSPACE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROOFS_DIR="$WORKSPACE_DIR/docs/proofs/agent-device"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
REPORT_PATH="$PROOFS_DIR/$TIMESTAMP"

echo "=========================================================="
# Brand voice: Premium console output
echo " ⚡️ Hermes Mobile Accelerated E2E Runner (Agent Device) ⚡️"
echo "=========================================================="

# Auto-detect Android serial
echo "🔍 Detecting active Android devices..."
ANDROID_DEVICES=$(adb devices | grep -v "List" | grep "device" | awk '{print $1}') || true
PLATFORM="android"
SERIAL=""

if [ ! -z "$ANDROID_DEVICES" ]; then
    SERIAL=$(echo "$ANDROID_DEVICES" | head -n 1)
    echo "   Targeting Android Device: $SERIAL"
else
    echo "🔍 No active Android devices found. Checking iOS Simulators..."
    IOS_SIMULATORS=$(xcrun simctl list devices | grep "Booted") || true
    if [ ! -z "$IOS_SIMULATORS" ]; then
        echo "✅ Active booted iOS Simulator detected!"
        PLATFORM="ios"
    else
        echo "❌ No active Android devices or booted iOS simulators found."
        echo "   Please connect a device via adb or launch a simulator first."
        exit 1
    fi
fi

mkdir -p "$REPORT_PATH"
echo "📂 Replay artifacts and JUnit reports will be saved to:"
echo "   docs/proofs/agent-device/$TIMESTAMP/"
echo "=========================================================="

# List of Maestro flows in sequential priority (matches ship-critical subset of full-suite)
FLOWS=(
    "e2e-prep"
    "launch"
    "navigation"
    "leash-connection"
    "chat"
    "settings-thumbgate"
    "approvals"
)

# Build the command arguments
FLOW_PATHS=""
for FLOW in "${FLOWS[@]}"; do
    FILE_PATH="$WORKSPACE_DIR/.maestro/$FLOW.yaml"
    if [ -f "$FILE_PATH" ]; then
        FLOW_PATHS="$FLOW_PATHS $FILE_PATH"
    fi
done

# Prepare run flags
FLAGS="--maestro --fail-fast --artifacts-dir $REPORT_PATH --report-junit $REPORT_PATH/junit-report.xml"
if [ "$PLATFORM" = "android" ] && [ ! -z "$SERIAL" ]; then
    FLAGS="$FLAGS --platform android --serial $SERIAL"
elif [ "$PLATFORM" = "ios" ]; then
    FLAGS="$FLAGS --platform ios"
fi

if [ "$PLATFORM" = "android" ] && [ ! -z "$SERIAL" ]; then
    echo "🧹 Resetting application state on Android device..."
    adb -s "$SERIAL" shell pm clear com.iganapolsky.hermesmobile || true
    echo "🔑 Auto-granting notification permissions..."
    adb -s "$SERIAL" shell pm grant com.iganapolsky.hermesmobile android.permission.POST_NOTIFICATIONS || true
    echo "🚀 Pre-launching application to prevent secure app conflicts..."
    adb -s "$SERIAL" shell am start -n com.iganapolsky.hermesmobile/.MainActivity || true
    sleep 3
fi

echo "🚀 Executing accelerated test suite via agent-device (one flow at a time)..."
echo "=========================================================="

set +e
EXIT_CODE=0
for FLOW in "${FLOWS[@]}"; do
  FILE_PATH="$WORKSPACE_DIR/.maestro/$FLOW.yaml"
  if [ ! -f "$FILE_PATH" ]; then
    echo "⚠️  Skipping missing flow: $FLOW.yaml"
    continue
  fi
  echo "▶ $FLOW.yaml"
  npx agent-device test "$FILE_PATH" $FLAGS
  FLOW_EXIT=$?
  if [ $FLOW_EXIT -ne 0 ]; then
    EXIT_CODE=$FLOW_EXIT
    echo "❌ $FLOW.yaml failed (exit $FLOW_EXIT)"
    break
  fi
done
set -e

echo "=========================================================="
if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ SUCCESS: All accelerated E2E replays passed!"
    echo "📊 JUnit report generated at:"
    echo "   docs/proofs/agent-device/$TIMESTAMP/junit-report.xml"
else
    echo "❌ FAILURE: Replay suite exited with code $EXIT_CODE"
    echo "🔍 Review the logs in the artifacts folder for detailed diagnostics."
fi
echo "=========================================================="

exit $EXIT_CODE
