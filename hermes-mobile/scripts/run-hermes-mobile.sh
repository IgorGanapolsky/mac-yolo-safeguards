#!/usr/bin/env bash
# Launch Hermes Mobile — Android phone when connected, otherwise iOS Simulator.
# Install: ln -sf "$(pwd)/scripts/run-hermes-mobile.sh" ~/.local/bin/run-hermes-mobile

set -eo pipefail

# Find hermes-mobile whether this script is symlinked, copied to ~/.local/bin, or run from repo.
resolve_mobile_dir() {
  local candidate target target_dir script_dir

  if [ -n "${HERMES_MOBILE_DIR:-}" ] && [ -f "${HERMES_MOBILE_DIR}/package.json" ]; then
    (cd "${HERMES_MOBILE_DIR}" && pwd)
    return 0
  fi

  target="${BASH_SOURCE[0]}"
  while [ -L "$target" ]; do
    target_dir="$(cd -P "$(dirname "$target")" && pwd)"
    target="$(readlink "$target")"
    case "$target" in
      /*) ;;
      *) target="$target_dir/$target" ;;
    esac
  done
  script_dir="$(cd -P "$(dirname "$target")" && pwd)"

  # Installed from hermes-mobile/scripts/run-hermes-mobile.sh
  candidate="$(cd "$script_dir/.." && pwd)"
  if [ -f "$candidate/package.json" ]; then
    printf '%s\n' "$candidate"
    return 0
  fi

  for candidate in \
    "/Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards/hermes-mobile" \
    "${HOME}/workspace/git/igor/mac-yolo-safeguards/hermes-mobile"; do
    if [ -f "$candidate/package.json" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

if ! MOBILE_DIR="$(resolve_mobile_dir)"; then
  echo "Error: hermes-mobile not found." >&2
  echo "Set HERMES_MOBILE_DIR or install a symlink:" >&2
  echo "  ln -sf \"\$REPO/hermes-mobile/scripts/run-hermes-mobile.sh\" ~/.local/bin/run-hermes-mobile" >&2
  exit 1
fi

resolve_java_home() {
  if [ -n "$JAVA_HOME" ] && [ -x "$JAVA_HOME/bin/java" ]; then
    return 0
  fi
  local candidates=(
    "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
    "/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home"
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home"
    "/Applications/Android Studio Preview.app/Contents/jbr/Contents/Home"
  )
  for candidate in "${candidates[@]}"; do
    if [ -x "$candidate/bin/java" ]; then
      export JAVA_HOME="$candidate"
      export PATH="$JAVA_HOME/bin:$PATH"
      echo "Using JAVA_HOME=$JAVA_HOME"
      return 0
    fi
  done
  echo "Warning: JAVA_HOME not set — install OpenJDK 17 or Android Studio JBR" >&2
  return 1
}

has_adb_device() {
  command -v adb >/dev/null 2>&1 &&
    adb devices 2>/dev/null | grep -v "List" | grep -E '[[:space:]]device$' | grep -q .
}

cd "$MOBILE_DIR"
resolve_java_home || true

echo "========================================================"
echo "🚀 Launching Hermes Mobile"
if has_adb_device; then
  echo "📱 Android device detected — building for phone (no iOS fallback)"
else
  echo "📱 No adb device — will use iOS Simulator"
fi
echo "========================================================"

METRO_PORT="${HERMES_METRO_PORT:-8081}"
if lsof -i ":$METRO_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "-> Metro already on :$METRO_PORT (reusing)"
  METRO_PID=""
else
  echo "-> Starting Metro on :$METRO_PORT..."
  npx expo start --port "$METRO_PORT" &
  METRO_PID=$!
  sleep 2
fi

cleanup() {
  if [ -n "$METRO_PID" ]; then
    echo "Stopping Metro (PID $METRO_PID)..."
    kill "$METRO_PID" 2>/dev/null || true
  fi
}
trap cleanup SIGINT SIGTERM

ANDROID_OK=0
IOS_OK=0

if has_adb_device; then
  echo "-> Building and installing Android app..."
  if npx expo run:android --no-bundler "$@"; then
    echo "✓ Android build and deploy completed."
    ANDROID_OK=1
  else
    echo "❌ Android build failed." >&2
    echo "   Common fix: Kotlin Compose plugin — pull latest and retry." >&2
    echo "   Log: hermes-mobile/android/build/reports/problems/problems-report.html" >&2
    cleanup
    exit 1
  fi
else
  echo "-> Building and launching iOS Simulator app..."
  if npx expo run:ios --no-bundler "$@"; then
    echo "✓ iOS build and deploy completed."
    IOS_OK=1
  else
    echo "❌ iOS build failed." >&2
    cleanup
    exit 1
  fi
fi

echo "========================================================"
if [ "$ANDROID_OK" = "1" ] || [ "$IOS_OK" = "1" ]; then
  echo "✓ Deploy complete. Metro on :$METRO_PORT"
else
  echo "❌ No deployment succeeded."
fi
echo "========================================================"

if [ -n "$METRO_PID" ]; then
  wait "$METRO_PID"
fi
