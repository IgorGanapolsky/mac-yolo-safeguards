#!/usr/bin/env bash
# Install a release APK with embedded JS bundle on a connected Android phone.
# Supported device path — never a Metro-only debug APK.
set -euo pipefail

_hermes_bootstrap_script_dir() {
  local target="${BASH_SOURCE[0]}"
  local target_dir
  while [ -L "$target" ]; do
    target_dir="$(cd -P "$(dirname "$target")" && pwd)"
    target="$(readlink "$target")"
    case "$target" in
      /*) ;;
      *) target="$target_dir/$target" ;;
    esac
  done
  cd -P "$(dirname "$target")" && pwd
}
SCRIPT_DIR="$(_hermes_bootstrap_script_dir)"
# shellcheck source=lib/hermes-mobile-path.sh
source "$SCRIPT_DIR/lib/hermes-mobile-path.sh"

# shellcheck source=maestro-env.sh
source "$SCRIPT_DIR/maestro-env.sh"

export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
if [ -d "${ANDROID_HOME}/platform-tools" ]; then
  export PATH="${ANDROID_HOME}/platform-tools:$PATH"
fi


if ! HERMES_DIR="$(hermes_resolve_mobile_dir)"; then
  echo "Error: hermes-mobile directory not found (set HERMES_MOBILE_DIR)" >&2
  exit 1
fi

APK_OUT="$HERMES_DIR/android/app/build/outputs/apk/release/app-release.apk"
PROBLEMS_REPORT="$HERMES_DIR/android/build/reports/problems/problems-report.html"
LOCK_DIR="$HERMES_DIR/android/.install-phone-release.lockdir"

if ! command -v adb >/dev/null 2>&1; then
  echo "Error: adb not on PATH (install Android platform-tools)" >&2
  exit 1
fi

DEVICE="$(adb devices 2>/dev/null | awk 'NR>1 && $2=="device" {print $1; exit}')"
if [[ -z "$DEVICE" ]]; then
  echo "Skip install: no Android device in 'device' state (check: adb devices)" >&2
  exit 0
fi

if [[ -z "${JAVA_HOME:-}" ]] || ! "$JAVA_HOME/bin/java" -version >/dev/null 2>&1; then
  echo "Error: Java 17 required for Gradle (install openjdk@17 or Android Studio)" >&2
  exit 1
fi

export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
export PATH="${JAVA_HOME}/bin:${ANDROID_HOME}/platform-tools:${PATH}"

cd "$HERMES_DIR"

apk_is_ready() {
  [[ -f "$APK_OUT" ]] || return 1
  node "$HERMES_DIR/scripts/verify-apk-package.cjs" "$APK_OUT" >/dev/null 2>&1
}

maybe_build_release() {
  if [[ "${HERMES_MOBILE_FORCE_BUILD:-}" == "1" ]]; then
    return 0
  fi
  if [[ "${HERMES_MOBILE_SKIP_BUILD:-}" == "1" ]] && apk_is_ready; then
    echo "=== Skipping Gradle (HERMES_MOBILE_SKIP_BUILD=1, verified APK present) ==="
    return 1
  fi
  return 0
}

ensure_release_apk_has_bundle() {
  if apk_is_ready; then
    return 0
  fi
  echo "=== APK missing embedded JS bundle — rerunning bundle + assemble (--rerun-tasks) ==="
  (
    cd android
    ensure_android_gradle_jvmargs
    export EXPO_PUBLIC_HERMES_DEV_UNLOCK=1
    export EXPO_PUBLIC_E2E_AUTOMATION=1
    ./gradlew :app:createBundleReleaseJsAndAssets :app:assembleRelease \
      -PreactNativeArchitectures=arm64-v8a --rerun-tasks --no-daemon
  ) || {
    echo "Error: Gradle bundle/assemble retry failed." >&2
    if [[ -f "$PROBLEMS_REPORT" ]]; then
      echo "  See: $PROBLEMS_REPORT" >&2
    fi
    exit 1
  }
  apk_is_ready || {
    echo "Error: release APK still missing assets/index.android.bundle after rebuild." >&2
    exit 1
  }
}

ensure_android_gradle_jvmargs() {
  local props="$HERMES_DIR/android/gradle.properties"
  if [[ ! -f "$props" ]]; then
    return 0
  fi
  local jvmargs="-Xmx2048m -XX:MaxMetaspaceSize=512m"
  if grep -q '^org.gradle.jvmargs=' "$props"; then
    if ! grep -q 'MaxMetaspaceSize=512m' "$props"; then
      sed -i '' "s/^org.gradle.jvmargs=.*/org.gradle.jvmargs=${jvmargs}/" "$props"
    fi
  else
    printf '
org.gradle.jvmargs=%s
' "$jvmargs" >>"$props"
  fi
}

gradle_release_args() {
  if [[ "${HERMES_MOBILE_FORCE_BUILD:-}" == "1" ]]; then
    echo ":app:createBundleReleaseJsAndAssets :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --rerun-tasks"
  else
    echo "assembleRelease -PreactNativeArchitectures=arm64-v8a"
  fi
}

run_gradle_release() {
  (
    cd android
    ensure_android_gradle_jvmargs
    export EXPO_PUBLIC_HERMES_DEV_UNLOCK=1
    export EXPO_PUBLIC_E2E_AUTOMATION=1
    # --no-daemon avoids parallel Kotlin/CMake races (e.g. unresolved UpdatesPackage).
    # shellcheck disable=SC2046
    ./gradlew $(gradle_release_args) --no-daemon
  )
}

ensure_android_native_project() {
  if [[ ! -d android ]]; then
    echo "=== Generating android/ (expo prebuild) ==="
    npx expo prebuild --platform android
    return
  fi
  # Stale android/ from before expo-updates autolinking breaks :expo:compileReleaseKotlin.
  if [[ ! -f android/settings.gradle ]] || ! grep -q 'expoAutolinking.useExpoModules' android/settings.gradle; then
    echo "=== Regenerating malformed android/ (expo prebuild --clean) ==="
    npx expo prebuild --platform android --clean
  fi
}

build_release() {
  ensure_android_native_project

  echo "=== Building release APK (embedded bundle) for $DEVICE ==="
  if ! run_gradle_release; then
    echo "Warning: Gradle assembleRelease failed — regenerating android/ and retrying once." >&2
    npx expo prebuild --platform android --clean
    run_gradle_release || {
      echo "Error: Gradle assembleRelease failed after prebuild --clean." >&2
      if [[ -f "$PROBLEMS_REPORT" ]]; then
        echo "  See: $PROBLEMS_REPORT" >&2
      fi
      exit 1
    }
  fi
  ensure_release_apk_has_bundle
}

verify_and_install() {
  if [[ ! -f "$APK_OUT" ]]; then
    echo "Error: expected APK missing: $APK_OUT" >&2
    exit 1
  fi

  node "$HERMES_DIR/scripts/verify-apk-package.cjs" "$APK_OUT" || {
    echo "Error: APK verify failed — refusing Metro-only or legacy shell builds." >&2
    exit 1
  }

  echo "=== Installing on $DEVICE ==="
  adb -s "$DEVICE" install -r "$APK_OUT" || {
    echo "Error: adb install failed (device $DEVICE)" >&2
    exit 1
  }
}

cold_start_and_smoke() {
  echo "=== Cold start ==="
  adb -s "$DEVICE" logcat -c >/dev/null 2>&1 || true
  adb -s "$DEVICE" shell am force-stop com.iganapolsky.hermesmobile
  adb -s "$DEVICE" shell am start -n com.iganapolsky.hermesmobile/.MainActivity

  local deadline=$((SECONDS + 45))
  while (( SECONDS < deadline )); do
    if adb -s "$DEVICE" logcat -d 2>/dev/null | /usr/bin/grep -qE 'Running "main"|Running main'; then
      echo "=== Smoke OK: React Native started (Running main) ==="
      return 0
    fi
    sleep 2
  done

  echo "Warning: logcat did not show React Native Running main within 45s (app may still be loading)." >&2
  adb -s "$DEVICE" logcat -d 2>/dev/null | /usr/bin/grep -iE "ReactNative|hermes|Unable to load script" | tail -8 >&2 || true
  return 0
}

acquire_install_lock() {
  if [[ -d "$LOCK_DIR" ]]; then
    local lock_pid=""
    if [[ -f "$LOCK_DIR/pid" ]]; then
      lock_pid="$(<"$LOCK_DIR/pid")"
    fi
    if [[ -n "$lock_pid" ]] && kill -0 "$lock_pid" 2>/dev/null; then
      echo "Error: another phone release install/build is in progress (pid $lock_pid, lock: $LOCK_DIR)" >&2
      exit 1
    fi
    echo "Warning: removing stale install lock ($LOCK_DIR) — prior run may have crashed after Gradle." >&2
    rm -rf "$LOCK_DIR"
  fi
  mkdir "$LOCK_DIR"
  echo "$$" >"$LOCK_DIR/pid"
}

acquire_install_lock
cleanup_lock() { rm -rf "$LOCK_DIR" 2>/dev/null || true; }
trap cleanup_lock EXIT

if maybe_build_release; then
  build_release
fi

verify_and_install
cold_start_and_smoke

echo "=== Done: Hermes Mobile installed (release, bundle embedded) ==="
