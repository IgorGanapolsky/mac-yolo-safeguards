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
# Coordination lock for the phone build+install pipeline. Lives OUTSIDE android/ so the
# failure-recovery step (`expo prebuild --clean`, which wipes android/) cannot delete the
# lock mid-build — the exact bug that let two agents' Gradle builds corrupt each other.
LOCK_FILE="$HERMES_DIR/.install-phone-release.lock"
LOCK_META="$HERMES_DIR/.install-phone-release.lock.meta"
LOCK_MKDIR="$HERMES_DIR/.install-phone-release.lockdir"   # portable fallback when flock is absent
LOCK_WAIT_SECONDS="${HERMES_INSTALL_LOCK_WAIT:-2400}"     # queue up to 40m behind an in-flight build
LAST_INSTALL_MARKER="$HERMES_DIR/.install-phone-release.last"
LOCK_OWNED=0

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

# Production APKs must NOT be demo-capable. Baking EXPO_PUBLIC_E2E_AUTOMATION /
# EXPO_PUBLIC_HERMES_DEV_UNLOCK into every build is what kept real users stuck in demo mode
# (isDemoModeAllowed()/isDeveloperLeashUnlockAllowed() in src/utils/demoModePolicy.ts honor
# those flags). Opt in ONLY for Maestro/E2E builds via HERMES_E2E_BUILD=1; the default install
# is a clean production build with neither flag set (explicitly unset so a stray caller env
# cannot leak demo capability into a shipped APK).
apply_release_build_flags() {
  if [[ "${HERMES_E2E_BUILD:-}" == "1" ]]; then
    export EXPO_PUBLIC_HERMES_DEV_UNLOCK=1
    export EXPO_PUBLIC_E2E_AUTOMATION=1
  else
    unset EXPO_PUBLIC_HERMES_DEV_UNLOCK EXPO_PUBLIC_E2E_AUTOMATION
  fi
}

ensure_release_apk_has_bundle() {
  if apk_is_ready; then
    return 0
  fi
  echo "=== APK missing embedded JS bundle — rerunning bundle + assemble (--rerun-tasks) ==="
  (
    cd android
    ensure_android_gradle_jvmargs
    apply_release_build_flags
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
    apply_release_build_flags
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

_write_lock_meta() {
  printf 'pid=%s agent=%s branch=%s sha=%s started=%s\n' \
    "$$" "${HERMES_AGENT_LABEL:-agent}" \
    "$(git -C "$HERMES_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')" \
    "$(git -C "$HERMES_DIR" rev-parse --short HEAD 2>/dev/null || echo '?')" \
    "$(date '+%H:%M:%S')" >"$LOCK_META" 2>/dev/null || true
}

# Serialize the whole build+install critical section across every agent that runs this script.
# QUEUE when busy (never fail-fast — that drove the retry storm). Reclaim only a DEAD holder.
acquire_install_lock() {
  if command -v flock >/dev/null 2>&1; then
    # flock: kernel releases the fd lock automatically on holder death (even kill -9),
    # so there is no stale lock to garbage-collect and no force-clear race.
    exec 9>"$LOCK_FILE" || { echo "Error: cannot open lock file $LOCK_FILE" >&2; exit 1; }
    if ! flock -n 9; then
      local held="another agent"; [[ -s "$LOCK_META" ]] && held="$(tr '\n' ' ' <"$LOCK_META" 2>/dev/null)"
      echo "=== Phone pipeline busy ($held). Queueing up to ${LOCK_WAIT_SECONDS}s — no concurrent build ===" >&2
      if ! flock -w "$LOCK_WAIT_SECONDS" 9; then
        echo "Error: phone pipeline still busy after ${LOCK_WAIT_SECONDS}s ($held)." >&2
        echo "       Standing down (exit 75). Do NOT auto-retry — another agent owns the build+device." >&2
        exit 75
      fi
    fi
    LOCK_OWNED=1; _write_lock_meta; return 0
  fi
  # Portable fallback (no flock): atomic mkdir + PID liveness, queue with jittered backoff.
  local deadline=$((SECONDS + LOCK_WAIT_SECONDS))
  while true; do
    if mkdir "$LOCK_MKDIR" 2>/dev/null; then
      echo "$$" >"$LOCK_MKDIR/pid"; LOCK_OWNED=1; _write_lock_meta; return 0
    fi
    local pid=""; [[ -f "$LOCK_MKDIR/pid" ]] && pid="$(<"$LOCK_MKDIR/pid" 2>/dev/null)"
    if [[ -z "$pid" ]] || ! kill -0 "$pid" 2>/dev/null; then
      echo "Reclaiming lock from dead holder (pid=${pid:-none})…" >&2
      rm -rf "$LOCK_MKDIR"; continue
    fi
    if (( SECONDS >= deadline )); then
      echo "Error: pipeline still busy after ${LOCK_WAIT_SECONDS}s (live pid $pid). Standing down (exit 75)." >&2
      exit 75
    fi
    sleep $(( 3 + RANDOM % 8 ))
  done
}

# Single-flight: if this exact commit is already installed on this device, skip the whole build.
skip_if_already_installed() {
  local target; target="$(git -C "$HERMES_DIR" rev-parse HEAD 2>/dev/null)" || return 0
  [[ -n "$target" && -f "$LAST_INSTALL_MARKER" ]] || return 0
  local last_sha last_dev; read -r last_sha last_dev <"$LAST_INSTALL_MARKER" 2>/dev/null || return 0
  if [[ "$last_sha" == "$target" && "$last_dev" == "$DEVICE" ]] \
     && adb -s "$DEVICE" shell pm list packages 2>/dev/null | grep -q 'com.iganapolsky.hermesmobile'; then
    echo "=== Single-flight: commit ${target:0:12} already installed on $DEVICE by a prior run — nothing to do ==="
    exit 0
  fi
}

record_install_marker() {
  local target; target="$(git -C "$HERMES_DIR" rev-parse HEAD 2>/dev/null)" || return 0
  [[ -n "$target" ]] && printf '%s %s\n' "$target" "$DEVICE" >"$LAST_INSTALL_MARKER" 2>/dev/null || true
}

cleanup_lock() {
  rm -f "$LOCK_META" 2>/dev/null || true
  # flock releases on fd close; only clean the mkdir-fallback dir, and only if WE own it.
  if [[ "$LOCK_OWNED" == "1" && -f "$LOCK_MKDIR/pid" && "$(<"$LOCK_MKDIR/pid" 2>/dev/null)" == "$$" ]]; then
    rm -rf "$LOCK_MKDIR" 2>/dev/null || true
  fi
}

acquire_install_lock
trap cleanup_lock EXIT INT TERM
skip_if_already_installed

# --- Safety gates (T-114): refuse install when unit/contract tests fail; warn on stale E2E ---
# Override: HERMES_INSTALL_SKIP_TESTS=1 (unit) · HERMES_INSTALL_ALLOW_BAD_E2E=1 (ignore latest.json)
gate_install_proofs() {
  if [[ "${HERMES_INSTALL_SKIP_TESTS:-}" == "1" ]]; then
    echo "=== WARNING: skipping unit/release-safety gate (HERMES_INSTALL_SKIP_TESTS=1) ===" >&2
  else
    echo "=== Gate: unit + release-safety before phone install ==="
    (cd "$HERMES_DIR" && npm test -- --no-coverage --watchman=false) || {
      echo "Error: unit tests failed — refusing phone install." >&2
      echo "       Override only with HERMES_INSTALL_SKIP_TESTS=1 (not for real-user builds)." >&2
      exit 1
    }
    (cd "$HERMES_DIR" && npm run test:release-safety) || {
      echo "Error: release-safety contract failed — refusing phone install." >&2
      exit 1
    }
  fi

  local latest="$HERMES_DIR/docs/proofs/continuous/latest.json"
  if [[ ! -f "$latest" ]]; then
    echo "=== WARNING: no continuous E2E proof at $latest — install continues ===" >&2
    return 0
  fi
  local e2e_status
  e2e_status="$(node -e "const j=require(process.argv[1]); process.stdout.write(String(j.e2e||''))" "$latest" 2>/dev/null || true)"
  if [[ "$e2e_status" == "pass" ]]; then
    echo "=== Continuous E2E proof: pass ==="
    return 0
  fi
  if [[ "${HERMES_INSTALL_ALLOW_BAD_E2E:-}" == "1" ]]; then
    echo "=== WARNING: continuous E2E is '${e2e_status:-missing}' but HERMES_INSTALL_ALLOW_BAD_E2E=1 — continuing ===" >&2
    return 0
  fi
  if [[ "$e2e_status" == "fail" ]]; then
    echo "=== WARNING: continuous E2E is fail (see $latest). Install continues; set HERMES_INSTALL_REQUIRE_E2E=1 to hard-block. ===" >&2
  elif [[ "$e2e_status" == "skipped" || -z "$e2e_status" ]]; then
    echo "=== WARNING: continuous E2E is '${e2e_status:-missing}' (often no USB phone). Prefer a pass proof before store/dogfood. ===" >&2
  else
    echo "=== WARNING: continuous E2E status '${e2e_status}' — see $latest ===" >&2
  fi
  if [[ "${HERMES_INSTALL_REQUIRE_E2E:-}" == "1" && "$e2e_status" != "pass" ]]; then
    echo "Error: HERMES_INSTALL_REQUIRE_E2E=1 and e2e != pass — refusing install." >&2
    exit 1
  fi
}

gate_install_proofs

if maybe_build_release; then
  build_release
fi

verify_and_install
cold_start_and_smoke
record_install_marker

echo "=== Done: Hermes Mobile installed (release, bundle embedded) ==="
