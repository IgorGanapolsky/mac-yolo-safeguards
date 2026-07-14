# shellcheck shell=bash
# Shared Maestro + Java env for Hermes Mobile E2E scripts. Source, do not execute.
export MAESTRO_DRIVER_STARTUP_TIMEOUT="${MAESTRO_DRIVER_STARTUP_TIMEOUT:-180000}"
_MAESTRO_ENV_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_MAESTRO_ENV_REPO_ROOT="$(cd "$_MAESTRO_ENV_SCRIPT_DIR/../.." && pwd)"
export MAESTRO_ANDROID_PREP_RETRIES="${MAESTRO_ANDROID_PREP_RETRIES:-3}"
export MAESTRO_ANDROID_ADB_WAIT_ATTEMPTS="${MAESTRO_ANDROID_ADB_WAIT_ATTEMPTS:-45}"

if [ -z "${JAVA_HOME:-}" ] || ! "$JAVA_HOME/bin/java" -version >/dev/null 2>&1; then
  for candidate in \
    "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home" \
    "/usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home" \
    "/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home" \
    "/usr/local/opt/openjdk/libexec/openjdk.jdk/Contents/Home" \
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
    "/Applications/Android Studio Preview.app/Contents/jbr/Contents/Home"; do
    if [ -d "$candidate" ] && "$candidate/bin/java" -version >/dev/null 2>&1; then
      export JAVA_HOME="$candidate"
      break
    fi
  done
  if [ -z "${JAVA_HOME:-}" ]; then
    for candidate in /opt/homebrew/Cellar/openjdk@17/*/libexec/openjdk.jdk/Contents/Home \
      /usr/local/Cellar/openjdk@17/*/libexec/openjdk.jdk/Contents/Home; do
      if [ -d "$candidate" ] && "$candidate/bin/java" -version >/dev/null 2>&1; then
        export JAVA_HOME="$candidate"
        break
      fi
    done
  fi
fi

if [ -n "${JAVA_HOME:-}" ]; then
  export PATH="$JAVA_HOME/bin:$PATH"
fi

if [ -d "$HOME/.maestro/bin" ]; then
  export PATH="$HOME/.maestro/bin:$PATH"
fi

if [ -d "$HOME/Library/Android/sdk/platform-tools" ]; then
  export PATH="$HOME/Library/Android/sdk/platform-tools:$PATH"
fi

# Unified global phone device lease (T-330 priority 2): pairing, install, Maestro/E2E,
# screenshots, and dogfooding all share ONE lease so no lane yanks the USB phone from
# another. Prints the busy reason and returns 1 when another lane (or a human) holds it;
# returns 0 (silently) when free. `--lane maestro` makes a human hold an immediate skip
# rather than a queue — Maestro must never fight a human for the phone. The CLI itself
# ignores its own ancestor's mkdir pipeline lock when HERMES_PHONE_PIPELINE_LEASE_HELD=1
# (run-continuous-e2e.sh already holds it for this whole process tree) while still
# honoring a human hold that starts mid-cycle.
phone_lease_busy_reason() {
  node "${_MAESTRO_ENV_REPO_ROOT}/tools/agent-phone-lease.js" busy-reason --lane maestro 2>/dev/null
}

kill_competing_maestro_processes() {
  local self_pid="${1:-$$}"
  pgrep -f 'maestro\.cli\.AppKt|maestro test|maestro studio' 2>/dev/null | while read -r pid; do
    if [[ "$pid" != "$self_pid" && "$pid" != "$PPID" ]]; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  sleep 1
}

clear_maestro_sessions() {
  rm -rf "${HOME}/.maestro/sessions"
}

restart_adb_server() {
  adb kill-server >/dev/null 2>&1 || true
  adb start-server >/dev/null 2>&1 || true
}

wait_for_adb_device() {
  local device_id="$1"
  local attempts="${2:-24}"
  local i=0
  while [[ $i -lt $attempts ]]; do
    if adb devices 2>/dev/null | awk -v id="$device_id" 'NR>1 && $1==id && $2=="device" {found=1} END {exit !found}'; then
      if adb -s "$device_id" shell echo ok >/dev/null 2>&1; then
        return 0
      fi
    fi
    sleep 2
    i=$((i + 1))
  done
  return 1
}

reset_android_maestro_driver() {
  local device_id="$1"
  adb -s "$device_id" shell am force-stop dev.mobile.maestro >/dev/null 2>&1 || true
  adb -s "$device_id" shell am force-stop dev.mobile.maestro.test >/dev/null 2>&1 || true
  adb -s "$device_id" forward --remove-all >/dev/null 2>&1 || true
}

prepare_android_maestro_driver() {
  local device_id="$1"
  local lease_reason
  lease_reason="$(phone_lease_busy_reason)"
  if [[ -n "$lease_reason" ]]; then
    echo "Phone lease busy — refusing to touch the device: ${lease_reason}" >&2
    return 1
  fi
  echo "Preparing Maestro Android driver for ${device_id}..."
  kill_competing_maestro_processes "$$"
  clear_maestro_sessions
  restart_adb_server
  if ! wait_for_adb_device "$device_id" "$MAESTRO_ANDROID_ADB_WAIT_ATTEMPTS"; then
    echo "ADB device ${device_id} not responsive after restart" >&2
    return 1
  fi
  reset_android_maestro_driver "$device_id"
  adb -s "$device_id" forward --list 2>/dev/null || true
  echo "Maestro driver prep complete (timeout=${MAESTRO_DRIVER_STARTUP_TIMEOUT}ms)"
  return 0
}
