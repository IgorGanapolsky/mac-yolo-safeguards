#!/usr/bin/env bash
# office-wifi-captive-heal.sh — autonomous Office Evolution captive-portal heal
#
# Born 2026-09-16 after daily laptop-return outages on "Office Evolution":
# associate + DHCP succeed, but Captive Network Assistant never pops the
# Accept/terms page, so the Mac has a 172.29/20 address with no real internet.
# Manual ritual was: ifconfig bounce, DNS flush, delete SystemConfiguration
# plists (including preferences.plist), reboot. That nuclear path is unsafe
# for automation.
#
# This guard:
#   1. Fingerprints the office LAN without relying on SSID (macOS redacts SSID).
#   2. Probes Apple captive + a real HTTPS reachability check.
#   3. Soft-heals: DNS flush → DHCP renew → Wi-Fi power bounce → open Captive
#      Network Assistant / captive.apple.com.
#   4. NEVER deletes preferences.plist / NetworkInterfaces.plist.
#   5. NEVER reboots.
#   6. Optional last-resort airport-prefs reset only when
#      OFFICE_WIFI_ALLOW_AIRPORT_RESET=1 and privileged sudo -n works.
#
# LaunchAgent: com.igor.office-wifi-captive-heal (every 60s + RunAtLoad).
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

VERSION="1.0.0"
IFACE="${OFFICE_WIFI_IFACE:-en0}"
SERVICE="${OFFICE_WIFI_SERVICE:-Wi-Fi}"
SSID_NAME="${OFFICE_WIFI_SSID:-Office Evolution}"
LOG="${OFFICE_WIFI_LOG:-$HOME/Library/Logs/office-wifi-captive-heal.log}"
STATE_DIR="${OFFICE_WIFI_STATE_DIR:-$HOME/Library/Caches/office-wifi-captive-heal}"
STATE_FILE="$STATE_DIR/state.env"
COOLDOWN_SEC="${OFFICE_WIFI_COOLDOWN_SEC:-180}"
CAPTIVE_URL="${OFFICE_WIFI_CAPTIVE_URL:-http://captive.apple.com/hotspot-detect.html}"
HTTPS_PROBE_URL="${OFFICE_WIFI_HTTPS_PROBE_URL:-https://www.apple.com/library/test/success.html}"
CURL_MAX="${OFFICE_WIFI_CURL_MAX:-4}"
ALLOW_AIRPORT_RESET="${OFFICE_WIFI_ALLOW_AIRPORT_RESET:-0}"
DRY_RUN=0
FORCE=0
MODE="auto"

mkdir -p "$(dirname "$LOG")" "$STATE_DIR" 2>/dev/null || true

log() {
  local line
  line="$(date -u '+%Y-%m-%dT%H:%M:%SZ') $*"
  printf '%s\n' "$line" >> "$LOG" 2>/dev/null || true
  printf '%s\n' "$line"
}

notify() {
  local title="$1" body="$2"
  /usr/bin/osascript -e "display notification \"${body//\"/\\\"}\" with title \"${title//\"/\\\"}\"" >/dev/null 2>&1 || true
}

PRIV_HELPER="${OFFICE_WIFI_PRIV_HELPER:-$HOME/.local/bin/office-wifi-privileged-helper.sh}"

run_priv_helper() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$PRIV_HELPER" "$@"
  elif [[ -x "$PRIV_HELPER" ]]; then
    /usr/bin/sudo -n "$PRIV_HELPER" "$@"
  else
    return 127
  fi
}

usage() {
  cat <<'EOF'
Usage: office-wifi-captive-heal.sh [--check|--heal|--status|--force|--dry-run]
  --check     Probe office fingerprint + captive/internet; exit 0 healthy, 2 needs heal, 1 error
  --heal      Run progressive heal if unhealthy (default for LaunchAgent)
  --status    Print JSON-ish status line and exit 0
  --force     Heal even if probes currently look healthy
  --dry-run   Print actions without mutating network state
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) MODE="check"; shift ;;
    --heal) MODE="heal"; shift ;;
    --status) MODE="status"; shift ;;
    --force) FORCE=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) log "unknown arg: $1"; usage; exit 1 ;;
  esac
done

# --- detection helpers (pure-ish; testable via OFFICE_WIFI_FIXTURE) -------------

is_office_ip() {
  case "${1:-}" in
    172.29.*) return 0 ;;
    *) return 1 ;;
  esac
}

summary_looks_office() {
  local summary="$1"
  printf '%s' "$summary" | /usr/bin/grep -Eq '172\.29\.0\.1|10\.1\.200\.1|medusa\.local' && return 0
  printf '%s' "$summary" | /usr/bin/grep -Eq 'yiaddr = 172\.29\.|Addresses : .*172\.29\.' && return 0
  return 1
}

preferred_has_office_ssid() {
  /usr/sbin/networksetup -listpreferredwirelessnetworks "$IFACE" 2>/dev/null \
    | /usr/bin/grep -Fqx $'\t'"$SSID_NAME" \
    || /usr/sbin/networksetup -listpreferredwirelessnetworks "$IFACE" 2>/dev/null \
    | /usr/bin/grep -Fq "$SSID_NAME"
}

captive_body_ok() {
  local body="$1"
  printf '%s' "$body" | /usr/bin/grep -qi '<TITLE>Success</TITLE>'
}

read_live_snapshot() {
  IP="$(/usr/sbin/ipconfig getifaddr "$IFACE" 2>/dev/null || true)"
  ROUTER="$(/usr/sbin/netstat -rn -f inet 2>/dev/null | /usr/bin/awk '/^default/{print $2; exit}')"
  SUMMARY="$(/usr/sbin/ipconfig getsummary "$IFACE" 2>/dev/null || true)"
  POWER="$(/usr/sbin/networksetup -getairportpower "$IFACE" 2>/dev/null | /usr/bin/awk '{print $NF}')"
  PREFERRED_OFFICE=0
  if preferred_has_office_ssid; then PREFERRED_OFFICE=1; fi

  OFFICE=0
  if is_office_ip "$IP"; then OFFICE=1; fi
  if summary_looks_office "$SUMMARY"; then OFFICE=1; fi
  if [[ "$ROUTER" == "172.29.0.1" ]]; then OFFICE=1; fi

  CAPTIVE_BODY="$(/usr/bin/curl -fsS --max-time "$CURL_MAX" "$CAPTIVE_URL" 2>/dev/null || true)"
  CAPTIVE_OK=0
  if captive_body_ok "$CAPTIVE_BODY"; then CAPTIVE_OK=1; fi

  HTTPS_CODE="$(/usr/bin/curl -sS -o /dev/null -w '%{http_code}' --max-time "$CURL_MAX" "$HTTPS_PROBE_URL" 2>/dev/null || echo 000)"
  HTTPS_OK=0
  if [[ "$HTTPS_CODE" == "200" ]]; then HTTPS_OK=1; fi

  HEALTHY=0
  if [[ "$OFFICE" -eq 1 && "$CAPTIVE_OK" -eq 1 && "$HTTPS_OK" -eq 1 ]]; then
    HEALTHY=1
  elif [[ "$OFFICE" -eq 0 && "$CAPTIVE_OK" -eq 1 && "$HTTPS_OK" -eq 1 ]]; then
    # Not on office LAN and internet works — nothing for this guard to do.
    HEALTHY=1
  fi

  NEEDS_HEAL=0
  if [[ "$OFFICE" -eq 1 && ( "$CAPTIVE_OK" -eq 0 || "$HTTPS_OK" -eq 0 ) ]]; then
    NEEDS_HEAL=1
  fi
}

load_fixture_if_any() {
  if [[ -n "${OFFICE_WIFI_FIXTURE:-}" && -f "$OFFICE_WIFI_FIXTURE" ]]; then
    # shellcheck disable=SC1090
    source "$OFFICE_WIFI_FIXTURE"
    return 0
  fi
  return 1
}

emit_status() {
  printf 'version=%s office=%s ip=%s router=%s power=%s captive_ok=%s https_ok=%s https_code=%s preferred_office=%s healthy=%s needs_heal=%s dry_run=%s\n' \
    "$VERSION" "${OFFICE:-0}" "${IP:-}" "${ROUTER:-}" "${POWER:-}" "${CAPTIVE_OK:-0}" "${HTTPS_OK:-0}" "${HTTPS_CODE:-}" "${PREFERRED_OFFICE:-0}" "${HEALTHY:-0}" "${NEEDS_HEAL:-0}" "$DRY_RUN"
}

in_cooldown() {
  [[ -f "$STATE_FILE" ]] || return 1
  # shellcheck disable=SC1090
  source "$STATE_FILE"
  local last="${LAST_HEAL_EPOCH:-0}"
  local now
  now="$(date +%s)"
  [[ $((now - last)) -lt "$COOLDOWN_SEC" ]]
}

mark_healed() {
  local now
  now="$(date +%s)"
  cat > "$STATE_FILE" <<EOF
LAST_HEAL_EPOCH=$now
LAST_HEAL_RESULT=${1:-unknown}
LAST_HEAL_ISO=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
EOF
}

# --- heal steps ----------------------------------------------------------------

step_flush_dns() {
  log "heal: flush DNS + HUP mDNSResponder"
  [[ "$DRY_RUN" -eq 1 ]] && return 0
  run_priv_helper flush-dns
}

step_renew_dhcp() {
  log "heal: renew DHCP on $IFACE"
  [[ "$DRY_RUN" -eq 1 ]] && return 0
  run_priv_helper renew-dhcp || true
}

step_bounce_wifi() {
  log "heal: bounce Wi-Fi (privileged ifconfig preferred, else networksetup power)"
  [[ "$DRY_RUN" -eq 1 ]] && return 0
  if run_priv_helper bounce-iface; then
    /bin/sleep 5
    return 0
  fi
  /usr/sbin/networksetup -setairportpower "$IFACE" off || return $?
  /bin/sleep 3
  /usr/sbin/networksetup -setairportpower "$IFACE" on || return $?
  /bin/sleep 5
  return 0
}

step_rejoin_ssid() {
  log "heal: rejoin preferred SSID '$SSID_NAME' (password from Keychain if needed)"
  [[ "$DRY_RUN" -eq 1 ]] && return 0
  # Empty password → use Keychain-known network when already preferred.
  /usr/sbin/networksetup -setairportnetwork "$IFACE" "$SSID_NAME" "" >/dev/null 2>&1 \
    || /usr/sbin/networksetup -setairportnetwork "$IFACE" "$SSID_NAME" >/dev/null 2>&1 \
    || true
  /bin/sleep 4
}

step_open_captive_portal() {
  log "heal: open Captive Network Assistant + $CAPTIVE_URL"
  [[ "$DRY_RUN" -eq 1 ]] && return 0
  /usr/bin/killall "Captive Network Assistant" >/dev/null 2>&1 || true
  if [[ -d "/System/Library/CoreServices/Captive Network Assistant.app" ]]; then
    /usr/bin/open "/System/Library/CoreServices/Captive Network Assistant.app" || true
  fi
  /usr/bin/open "$CAPTIVE_URL" || true
  notify "Office Wi-Fi" "Tap Accept on the Office Evolution login page if it appears."
}

step_airport_prefs_reset() {
  # LAST RESORT — mirrors the working manual airport wipe without touching
  # preferences.plist / NetworkInterfaces.plist (those force a reboot).
  if [[ "$ALLOW_AIRPORT_RESET" != "1" ]]; then
    log "heal: airport prefs reset skipped (set OFFICE_WIFI_ALLOW_AIRPORT_RESET=1 to enable)"
    return 0
  fi
  local stamp backup
  stamp="$(date -u '+%Y%m%dT%H%M%SZ')"
  backup="$HOME/Library/Logs/office-wifi-airport-backup-$stamp"
  log "heal: backup+remove airport preferences only → $backup"
  [[ "$DRY_RUN" -eq 1 ]] && return 0
  if ! run_priv_helper reset-airport-prefs "$backup"; then
    log "heal: airport prefs reset needs privileged helper / sudoers — skipped"
    return 0
  fi
  notify "Office Wi-Fi" "Reset Wi-Fi airport prefs. Rejoin Office Evolution and Accept the portal."
}

progressive_heal() {
  log "heal: start office=$OFFICE ip=$IP captive_ok=$CAPTIVE_OK https_ok=$HTTPS_OK force=$FORCE"
  notify "Office Wi-Fi" "Healing Office Evolution connectivity…"

  step_flush_dns || log "heal: DNS flush unavailable (no passwordless sudo yet)"
  step_renew_dhcp || true
  step_bounce_wifi || log "heal: wifi bounce failed"
  step_rejoin_ssid || true
  step_open_captive_portal || true

  # Re-probe after soft heal.
  if ! load_fixture_if_any; then
    read_live_snapshot
  fi
  emit_status | tee -a "$LOG" >/dev/null || true

  if [[ "$NEEDS_HEAL" -eq 0 || "$FORCE" -eq 1 ]]; then
    if [[ "$CAPTIVE_OK" -eq 1 && "$HTTPS_OK" -eq 1 ]]; then
      mark_healed "soft_ok"
      log "heal: soft path restored internet"
      notify "Office Wi-Fi" "Internet restored after soft heal."
      return 0
    fi
  fi

  step_airport_prefs_reset || true
  step_open_captive_portal || true
  mark_healed "portal_opened"
  log "heal: finished with portal open; click Accept if still captive"
  return 0
}

# --- main ----------------------------------------------------------------------

if ! load_fixture_if_any; then
  read_live_snapshot
fi

case "$MODE" in
  status)
    emit_status
    exit 0
    ;;
  check)
    emit_status
    if [[ "$NEEDS_HEAL" -eq 1 ]]; then
      log "check: NEEDS_HEAL office fingerprint with captive/https failure"
      exit 2
    fi
    log "check: ok office=$OFFICE healthy=$HEALTHY"
    exit 0
    ;;
  heal|auto)
    emit_status
    if [[ "$FORCE" -ne 1 && "$NEEDS_HEAL" -ne 1 ]]; then
      log "idle: no office captive failure (office=$OFFICE healthy=$HEALTHY)"
      exit 0
    fi
    if [[ "$FORCE" -ne 1 ]] && in_cooldown; then
      log "idle: cooldown ${COOLDOWN_SEC}s since last heal"
      exit 0
    fi
    progressive_heal
    exit 0
    ;;
  *)
    usage
    exit 1
    ;;
esac
