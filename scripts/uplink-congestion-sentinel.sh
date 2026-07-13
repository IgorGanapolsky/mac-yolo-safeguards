#!/bin/bash
# uplink-congestion-sentinel.sh — detect ISP-side uplink congestion (bufferbloat)
# that no per-process guard can see, and tell Igor it's the LINK, not the Mac.
#
# Born 2026-07-13: the mini felt "completely frozen" over Screen Sharing while
# load was 1.8 and no process was flooding. Gateway ping was 10ms but 1.1.1.1
# was 648ms avg (spikes >1s) — T-Mobile Home Internet evening congestion.
# uplink-flood-guard stayed silent (correctly: nothing local was flooding).
# This sentinel fills that blind spot: LAN fast + internet slow = ISP queue.
#
# Detection: ping the default gateway and 1.1.1.1. Congested when the gateway
# answers fast but the internet path is slow or lossy, two checks in a row
# (one launchd interval apart). Alerts once per cooldown; sends a recovery
# notice when the link heals. Detection-only — never touches any process.
#
# Install (per Mac): copy to ~/.local/bin/, then load a LaunchAgent
# com.igor.uplink-congestion-sentinel.plist with StartInterval=60 + RunAtLoad
# (same shape as com.igor.uplink-flood-guard.plist).
set -u

LOG="$HOME/Library/Logs/uplink-congestion-sentinel.log"
NTFY_TOPIC="yolo-guard-fdh8ktuw1vtxb5sb"
STATE_FILE="/tmp/uplink-congestion-sentinel.state"     # count of consecutive congested checks
ALERTED_FILE="/tmp/uplink-congestion-sentinel.alerted" # epoch of last congestion alert
GW_OK_MS=100          # LAN hop must be at most this to blame the ISP
NET_BAD_MS=300        # internet RTT at/above this = congested
NET_LOSS_BAD=40       # ...or this % packet loss
CONSECUTIVE=2         # checks in a row before alerting (rides out single blips)
COOLDOWN_SECS=1800
PROBE_HOST="1.1.1.1"
DRY_RUN="${1:-}"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }

notify() {
  [[ "$DRY_RUN" == "--dry-run" ]] && { log "DRY-RUN notify: $1"; return; }
  curl -s -m 10 -H "Title: uplink-congestion-sentinel ($(hostname -s))" -H "Priority: high" \
    -d "$1" "https://ntfy.sh/$NTFY_TOPIC" >/dev/null 2>&1
}

# avg RTT (integer ms, empty on total loss) and loss % from a ping run
ping_stats() {  # $1 = host
  ping -c 5 -t 8 "$1" 2>/dev/null | awk '
    /packets transmitted/ { for (i=1; i<=NF; i++) if ($i ~ /%/) { gsub("%","",$i); loss=$i } }
    /round-trip/          { split($4, a, "/"); avg=a[2] }
    END { printf "%d %d", (avg==""?9999:avg), (loss==""?100:loss) }'
}

GW=$(route -n get default 2>/dev/null | awk '/gateway/ {print $2}')
[[ -z "$GW" ]] && exit 0   # no default route — offline, a different problem

read -r gw_ms gw_loss <<< "$(ping_stats "$GW")"
read -r net_ms net_loss <<< "$(ping_stats "$PROBE_HOST")"

congested=0
if (( gw_ms <= GW_OK_MS && gw_loss < 40 )) && (( net_ms >= NET_BAD_MS || net_loss >= NET_LOSS_BAD )); then
  congested=1
fi

count=$(cat "$STATE_FILE" 2>/dev/null || echo 0)

if (( congested )); then
  count=$((count + 1))
  echo "$count" > "$STATE_FILE"
  log "CONGESTED ($count/$CONSECUTIVE): gw=${gw_ms}ms internet=${net_ms}ms loss=${net_loss}%"
  if (( count >= CONSECUTIVE )); then
    now=$(date +%s); last=$(cat "$ALERTED_FILE" 2>/dev/null || echo 0)
    if (( now - last > COOLDOWN_SECS )); then
      echo "$now" > "$ALERTED_FILE"
      # name the top uplink talker so the alert says whether it's self-inflicted
      talker=$(nettop -P -x -L 2 -s 5 -J bytes_out 2>/dev/null | awk -F, '
        /^,bytes_out/ {blk++; next}
        blk==1 {b[$1]=$2}
        blk==2 {d=$2-b[$1]; if (d>m) {m=d; t=$1}}
        END { if (m>0) printf "%s at %dKB/s", t, m/5/1024 }')
      notify "ISP uplink congested: LAN ${gw_ms}ms but internet ${net_ms}ms (${net_loss}% loss). The Mac is healthy — remote screen will crawl until the link clears. Top uplink talker: ${talker:-none}. If it persists, reboot the T-Mobile gateway."
      log "ALERT sent: gw=${gw_ms}ms net=${net_ms}ms loss=${net_loss}% talker=${talker:-none}"
    fi
  fi
else
  if (( count >= CONSECUTIVE )) && [[ -f "$ALERTED_FILE" ]]; then
    notify "Uplink recovered: internet ${net_ms}ms (${net_loss}% loss). Remote screen should feel normal again."
    log "RECOVERED: gw=${gw_ms}ms net=${net_ms}ms loss=${net_loss}%"
    rm -f "$ALERTED_FILE"
  fi
  echo 0 > "$STATE_FILE"
fi
