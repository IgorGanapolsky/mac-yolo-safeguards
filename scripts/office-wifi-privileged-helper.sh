#!/usr/bin/env bash
# Root-only helper for office-wifi-captive-heal. Invoked via narrow sudoers NOPASSWD.
# Allowed verbs: flush-dns | bounce-iface | renew-dhcp | reset-airport-prefs
set -euo pipefail

IFACE="${OFFICE_WIFI_IFACE:-en0}"
SC="/Library/Preferences/SystemConfiguration"
VERB="${1:-}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "must run as root" >&2
  exit 1
fi

case "$VERB" in
  flush-dns)
    /usr/bin/dscacheutil -flushcache
    /usr/bin/killall -HUP mDNSResponder 2>/dev/null || true
    ;;
  bounce-iface)
    /sbin/ifconfig "$IFACE" down
    /bin/sleep 3
    /sbin/ifconfig "$IFACE" up
    ;;
  renew-dhcp)
    /usr/sbin/ipconfig set "$IFACE" DHCP
    ;;
  reset-airport-prefs)
    # ONLY airport preference files — never preferences.plist / NetworkInterfaces.plist.
    backup_root="${2:-}"
    if [[ -z "$backup_root" || "$backup_root" != /Users/* ]]; then
      echo "backup_root under /Users required" >&2
      exit 2
    fi
    /bin/mkdir -p "$backup_root"
    for f in com.apple.airport.preferences.plist com.apple.airport.preferences.plist.backup; do
      if [[ -f "$SC/$f" ]]; then
        /bin/cp -p "$SC/$f" "$backup_root/$f"
        /bin/rm -f "$SC/$f"
      fi
    done
    ;;
  *)
    echo "usage: $0 flush-dns|bounce-iface|renew-dhcp|reset-airport-prefs <backup_dir>" >&2
    exit 2
    ;;
esac
