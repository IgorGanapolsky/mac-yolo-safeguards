#!/usr/bin/env bash
# Build release APK, verify embedded bundle, install on connected Android, run Maestro E2E.
set -euo pipefail

HERMES_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APK_OUT="$HERMES_DIR/android/app/build/outputs/apk/release/app-release.apk"
JAVA_HOME="${JAVA_HOME:-$(brew --prefix openjdk@17 2>/dev/null)/libexec/openjdk.jdk/Contents/Home}"
export JAVA_HOME
export PATH="$JAVA_HOME/bin:$PATH"
export GRADLE_USER_HOME="${GRADLE_USER_HOME:-/tmp/gradle-hermes-mobile3}"

if ! command -v adb >/dev/null 2>&1; then
  echo "adb is required" >&2
  exit 1
fi

DEVICE="$(adb devices | awk 'NR>1 && $2=="device" {print $1; exit}')"
if [[ -z "$DEVICE" ]]; then
  echo "No Android device connected (adb devices)" >&2
  exit 1
fi

if ! command -v maestro >/dev/null 2>&1; then
  echo "Maestro is required: curl -fsSL https://get.maestro.mobile.dev | bash" >&2
  exit 1
fi

echo "=== Hermes Mobile device E2E (device=$DEVICE) ==="

cd "$HERMES_DIR"
if [[ ! -d android ]]; then
  npx expo prebuild --platform android --clean
fi

echo "Building release APK (arm64, embedded JS bundle)..."
(cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a \
  -Dorg.gradle.jvmargs="-Xmx8192m -XX:MaxMetaspaceSize=4096m" --no-daemon)

bash "$HERMES_DIR/scripts/verify-apk-package.sh" "$APK_OUT"

echo "Installing on $DEVICE..."
adb -s "$DEVICE" uninstall com.iganapolsky.hermesmobile 2>/dev/null || true
adb -s "$DEVICE" install -r "$APK_OUT"

echo "Running Maestro full suite (sequential)..."
maestro test "$HERMES_DIR/.maestro/full-suite.yaml"

echo "=== Device E2E: PASS ==="
