#!/usr/bin/env bash
# Launch Hermes Mobile — Android phone when connected, otherwise iOS Simulator.
# Phone: release APK with embedded JS (never Metro-only debug).
# Install: ln -sf "$(pwd)/scripts/run-hermes-mobile.sh" ~/.local/bin/run-hermes-mobile

set -eo pipefail

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

if ! MOBILE_DIR="$(hermes_resolve_mobile_dir)"; then
  echo "Error: hermes-mobile not found." >&2
  echo "Set HERMES_MOBILE_DIR or symlink:" >&2
  echo "  ln -sf \"\$REPO/hermes-mobile/scripts/run-hermes-mobile.sh\" ~/.local/bin/run-hermes-mobile" >&2
  exit 1
fi

export HERMES_MOBILE_DIR="$MOBILE_DIR"

has_adb_device() {
  command -v adb >/dev/null 2>&1 &&
    adb devices 2>/dev/null | awk 'NR>1 && $2=="device" {found=1} END {exit found ? 0 : 1}'
}

require_java_for_android() {
  if [[ -n "${JAVA_HOME:-}" ]] && "$JAVA_HOME/bin/java" -version >/dev/null 2>&1; then
    export PATH="$JAVA_HOME/bin:$PATH"
    return 0
  fi
  echo "Error: Java 17 required for Android builds (openjdk@17 or Android Studio JBR)." >&2
  return 1
}

resolve_ios_sim_udid() {
  local default_name="${HERMES_SIM_NAME:-iPhone 17 Pro}"
  local booted udid

  booted="$(xcrun simctl list devices booted 2>/dev/null | grep -oE '[0-9A-F-]{36}' | head -1 || true)"
  if [ -n "$booted" ]; then
    echo "$booted"
    return 0
  fi

  if ! xcrun simctl list devices available 2>/dev/null | grep -q '(Booted\|Shutdown)'; then
    echo "Error: No iOS Simulator runtimes installed." >&2
    echo "  Xcode → Settings → Platforms → install an iOS simulator runtime," >&2
    echo "  OR plug your Android phone (USB) and rerun — release install needs no Simulator." >&2
    return 1
  fi

  udid="$(xcrun simctl list devices available 2>/dev/null | grep "$default_name (" | head -1 | grep -oE '[0-9A-F-]{36}' || true)"
  if [ -z "$udid" ]; then
    udid="$(xcrun simctl list devices available 2>/dev/null | grep 'iPhone' | head -1 | grep -oE '[0-9A-F-]{36}' || true)"
  fi
  if [ -z "$udid" ]; then
    echo "Error: No bootable iPhone simulator found." >&2
    echo "  Install a simulator runtime in Xcode, or use Android: npm run android:phone" >&2
    return 1
  fi

  echo "-> Booting simulator $default_name ($udid)..." >&2
  xcrun simctl boot "$udid" 2>/dev/null || true
  open -a Simulator >/dev/null 2>&1 || true
  xcrun simctl bootstatus "$udid" -b
  echo "$udid"
}

cd "$MOBILE_DIR"

echo "========================================================"
echo "Launching Hermes Mobile ($MOBILE_DIR)"
if has_adb_device; then
  echo "Android device — release APK (embedded bundle, no Metro)"
else
  echo "No adb device — iOS Simulator + Metro"
fi
echo "========================================================"

ANDROID_OK=0
IOS_OK=0

if has_adb_device; then
  require_java_for_android || exit 1
  export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
  export PATH="${ANDROID_HOME}/platform-tools:$PATH"

  echo "-> Building and installing release APK..."
  if bash "$MOBILE_DIR/scripts/install-phone-release.sh"; then
    echo "Phone install complete — runs without Metro."
    ANDROID_OK=1
  else
    status=$?
    echo "Phone install failed (exit $status)." >&2
    echo "Try: HERMES_MOBILE_SKIP_BUILD=1 run-hermes-mobile if a verified APK already exists." >&2
    exit "$status"
  fi
else
  METRO_PORT="${HERMES_METRO_PORT:-8081}"
  if lsof -i ":$METRO_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "-> Metro already on :$METRO_PORT"
    METRO_PID=""
  else
    echo "-> Starting Metro on :$METRO_PORT..."
    npx expo start --port "$METRO_PORT" &
    METRO_PID=$!
    sleep 2
  fi

  cleanup() {
    if [ -n "${METRO_PID:-}" ]; then
      kill "$METRO_PID" 2>/dev/null || true
    fi
  }
  trap cleanup SIGINT SIGTERM

  SIM_UDID="$(resolve_ios_sim_udid)" || {
    cleanup
    exit 1
  }

  echo "-> Building and launching iOS Simulator app (udid=$SIM_UDID)..."
  if npx expo run:ios --no-bundler --udid "$SIM_UDID" "$@"; then
    echo "iOS build and deploy completed."
    IOS_OK=1
  else
    status=$?
    echo "iOS build failed (exit $status)." >&2
    cleanup
    exit "$status"
  fi

  if [ -n "${METRO_PID:-}" ]; then
    wait "$METRO_PID" 2>/dev/null || true
  fi
fi

echo "========================================================"
if [ "$ANDROID_OK" = "1" ] || [ "$IOS_OK" = "1" ]; then
  echo "Deploy complete."
else
  echo "No deployment succeeded." >&2
  exit 1
fi
echo "========================================================"
