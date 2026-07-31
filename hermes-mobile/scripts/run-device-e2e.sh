#!/usr/bin/env bash
# Build release APK, verify embedded bundle, install on connected Android, run Maestro E2E.
set -euo pipefail

HERMES_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APK_OUT="$HERMES_DIR/android/app/build/outputs/apk/release/app-release.apk"
TARGET_ANDROID_PACKAGE="${HERMES_MOBILE_ANDROID_PACKAGE:-com.iganapolsky.hermesmobile.paid}"
case "$TARGET_ANDROID_PACKAGE" in
  com.iganapolsky.hermesmobile.paid)
    export HERMES_ANDROID_STORE_SKU=paid
    export EXPO_PUBLIC_ANDROID_PAID_DOWNLOAD=1
    ;;
  com.iganapolsky.hermesmobile)
    export HERMES_ANDROID_STORE_SKU=free
    unset EXPO_PUBLIC_ANDROID_PAID_DOWNLOAD
    ;;
  *)
    echo "Unsupported Hermes Mobile Android package: $TARGET_ANDROID_PACKAGE" >&2
    exit 2
    ;;
esac
export HERMES_MOBILE_ANDROID_PACKAGE="$TARGET_ANDROID_PACKAGE"
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
if [[ ! -f android/app/build.gradle ]] \
  || ! grep -q "applicationId '$TARGET_ANDROID_PACKAGE'" android/app/build.gradle; then
  echo "Regenerating Android project for $TARGET_ANDROID_PACKAGE..."
  npx expo prebuild --platform android --clean
fi

echo "Building release APK (arm64, embedded JS bundle)..."
(
  cd android
  export EXPO_PUBLIC_HERMES_DEV_UNLOCK=1
  export EXPO_PUBLIC_E2E_AUTOMATION=1
  ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a \
    -Dorg.gradle.jvmargs="-Xmx8192m -XX:MaxMetaspaceSize=4096m" --no-daemon
)

bash "$HERMES_DIR/scripts/verify-apk-package.sh" "$APK_OUT"

echo "Installing on $DEVICE..."
adb -s "$DEVICE" uninstall "$TARGET_ANDROID_PACKAGE" 2>/dev/null || true
adb -s "$DEVICE" install -r "$APK_OUT"
adb -s "$DEVICE" shell pm path "$TARGET_ANDROID_PACKAGE" >/dev/null

echo "Running Maestro full suite against $TARGET_ANDROID_PACKAGE (sequential)..."
bash "$HERMES_DIR/scripts/run-maestro-for-app.sh" ".maestro/full-suite.yaml" \
  -p android --udid "$DEVICE"

echo "=== Device E2E: PASS ==="
