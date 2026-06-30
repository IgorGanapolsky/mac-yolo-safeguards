#!/usr/bin/env bash
# dev-emulator.sh — reproducible one-command Android emulator harness for
# Hermes Mobile on Apple Silicon (native arm64 AVD, NOT Docker).
#
# WHY THIS EXISTS: diagnosing connection/UX issues needs a DEBUG build on a
# controllable device (run-as + /proc access), which a physical release phone
# blocks. Docker Android emulators are not viable on Apple Silicon arm64
# (no arm64 emulator component for containers; amd64-only). The correct 2026
# approach is the native arm64 AVD — this script encodes the exact, proven steps.
#
# USAGE:
#   scripts/dev-emulator.sh                       # boot emulator + Metro + install debug + launch
#   scripts/dev-emulator.sh --wipe                # fresh "brand-new user" state (wipe emulator data first)
#   scripts/dev-emulator.sh --gateway http://100.94.135.78:8642 --key "$KEY"
#                                                 # also point the app at a gateway via hermes://setup
#   scripts/dev-emulator.sh --headless            # boot emulator with no window (CI / background)
#
# Idempotent: reuses a running emulator/Metro if already up. Safe to re-run.
set -euo pipefail

# ---- config (override via env) ----
AVD="${HERMES_AVD:-}"                       # default: first available AVD
ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
PKG="com.iganapolsky.hermesmobile"
ACTIVITY=".MainActivity"
METRO_PORT="${METRO_PORT:-8081}"
HEADLESS=0; WIPE=0; GATEWAY=""; KEY=""

while [ $# -gt 0 ]; do
  case "$1" in
    --headless) HEADLESS=1; shift;;
    --wipe)     WIPE=1; shift;;
    --gateway)  GATEWAY="$2"; shift 2;;
    --key)      KEY="$2"; shift 2;;
    -h|--help)  grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done

HERE="$(cd "$(dirname "$0")/.." && pwd)"   # hermes-mobile/
EMU="$ANDROID_HOME/emulator/emulator"
ADB="$ANDROID_HOME/platform-tools/adb"

# ---- JDK 17 (Android Gradle Plugin requirement; the #1 local-build failure) ----
if [ -z "${JAVA_HOME:-}" ] || ! "$JAVA_HOME/bin/java" -version 2>&1 | grep -q '"17'; then
  for c in /opt/homebrew/opt/openjdk@17 /opt/homebrew/opt/zulu@17 \
           /Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home; do
    [ -x "$c/bin/java" ] && export JAVA_HOME="$c" && break
  done
fi
[ -x "${JAVA_HOME:-/nope}/bin/java" ] || { echo "❌ No JDK 17. Install: brew install openjdk@17" >&2; exit 1; }
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
echo "✅ JDK: $("$JAVA_HOME/bin/java" -version 2>&1 | head -1)"

# ---- emulator: reuse if running, else boot the AVD and wait for full boot ----
if ! "$ADB" devices | grep -q 'emulator-.*device'; then
  [ -n "$AVD" ] || AVD="$("$EMU" -list-avds | head -1)"
  [ -n "$AVD" ] || { echo "❌ No AVD. Create one in Android Studio (arm64 image)." >&2; exit 1; }
  echo "🚀 Booting AVD '$AVD'$([ $WIPE = 1 ] && echo ' (wiped/fresh)')$([ $HEADLESS = 1 ] && echo ' (headless)')..."
  ARGS=(-avd "$AVD" -no-snapshot-load -no-audio -no-boot-anim)
  [ $WIPE = 1 ] && ARGS+=(-wipe-data)
  [ $HEADLESS = 1 ] && ARGS+=(-no-window)
  nohup "$EMU" "${ARGS[@]}" >/tmp/hermes-emu.log 2>&1 &
  echo "   waiting for boot_completed (up to ~3min)..."
  "$ADB" wait-for-device
  for _ in $(seq 1 30); do
    [ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ] && break
    sleep 6
  done
fi
DEVICE="$("$ADB" devices | awk '/emulator-.*device/{print $1; exit}')"
echo "✅ Emulator: $DEVICE"

# ---- Metro: start if not already serving JS on the port ----
if ! curl -s -m 2 "http://localhost:$METRO_PORT/status" 2>/dev/null | grep -q packager; then
  echo "🚀 Starting Metro on :$METRO_PORT..."
  ( cd "$HERE" && nohup npx expo start --port "$METRO_PORT" >/tmp/hermes-metro.log 2>&1 & )
  sleep 4
else
  echo "✅ Metro already running on :$METRO_PORT"
fi

# ---- prebuild native project if missing (android/ is gitignored / CNG) ----
if [ ! -d "$HERE/android" ]; then
  echo "🔧 No android/ — running expo prebuild..."
  ( cd "$HERE" && npx expo prebuild --platform android --non-interactive )
fi

# ---- build + install the DEBUG build (debuggable -> run-as works for diagnosis) ----
echo "🔨 Building + installing debug build (this can take a few minutes the first time)..."
( cd "$HERE/android" && ./gradlew :app:installDebug -PreactNativeArchitectures=arm64-v8a )
echo "✅ Installed debug build on $DEVICE"

# ---- launch ----
"$ADB" -s "$DEVICE" shell am start -n "$PKG/$ACTIVITY" >/dev/null
echo "✅ Launched $PKG"

# ---- optional: point the app at a gateway via the hermes://setup deep link ----
if [ -n "$GATEWAY" ]; then
  sleep 4
  LINK="$(python3 -c "import urllib.parse,sys;print('hermes://setup?'+urllib.parse.urlencode({'url':sys.argv[1],'key':sys.argv[2]}))" "$GATEWAY" "$KEY")"
  "$ADB" -s "$DEVICE" shell am start -a android.intent.action.VIEW -d "'$LINK'" "$PKG" >/dev/null
  echo "✅ Sent gateway deep link -> $GATEWAY"
fi

echo ""
echo "🎉 Ready. Inspect live state (debug build):"
echo "   $ADB -s $DEVICE exec-out screencap -p > /tmp/shot.png"
echo "   $ADB -s $DEVICE shell run-as $PKG strings databases/RKStorage   # stored gateway/profile state"
echo "   $ADB -s $DEVICE logcat -s ReactNativeJS:V                       # JS logs"
