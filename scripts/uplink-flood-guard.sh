#!/bin/bash
# uplink-flood-guard.sh — pause (SIGSTOP) a known agent process that saturates
# the uplink, then auto-resume (SIGCONT). Never kills anything, so no agent WIP
# is destroyed. Two triggers:
#   1. screen-share mode: pause while a screen-share session is active.
#   2. chronic mode: when the same known agent floods for consecutive checks
#      and public RTT is degraded, pause it for a bounded window so local web
#      traffic can drain.
#
# Born 2026-07-07: agy (Antigravity CLI) uploaded 415MB w/ 25M TCP re-tx to
# Google's backend on the mini's T-Mobile uplink -> screen share fully frozen
# while load avg was 3 and RAM 81% free. No existing guard branch saw it.
#
# Detection: two nettop snapshots SAMPLE_SECS apart; a single non-system
# process whose outbound rate exceeds BPS_THRESHOLD AND whose per-proc re-tx
# delta exceeds RETX_THRESHOLD is a flooder. System/transport procs are never
# touched.
set -u

LOG="${UPLINK_GUARD_LOG:-$HOME/Library/Logs/uplink-flood-guard.log}"
STATE="${UPLINK_GUARD_STATE:-/tmp/uplink-flood-guard.paused}" # pid name kind deadline identity
NTFY_TOPIC="yolo-guard-fdh8ktuw1vtxb5sb"
SAMPLE_SECS="${UPLINK_GUARD_SAMPLE_SECS:-10}"
# 700 KiB/s ~= 5.7 Mbps, leaving roughly half of today's measured 10.9 Mbps
# T-Mobile uplink for interactive traffic. RTT + retransmit + consecutive-run
# gates prevent a healthy faster link from pausing work on rate alone.
BPS_THRESHOLD_KBPS="${UPLINK_FLOOD_KBPS_THRESHOLD:-700}"
BPS_THRESHOLD=$((BPS_THRESHOLD_KBPS*1024))
RETX_THRESHOLD="${UPLINK_FLOOD_RETX_THRESHOLD:-500}"
COOLDOWN_SECS=600
COOLDOWN_FILE="${UPLINK_GUARD_COOLDOWN_FILE:-/tmp/uplink-flood-guard.lastalert}"
# No-screen-share mitigation. With a 60-second LaunchAgent cadence, two
# detections bound time-to-protection near two minutes without reacting to one
# burst. The next interval after the deadline resumes the exact same process.
CHRONIC_RUNS="${UPLINK_FLOOD_CHRONIC_RUNS:-2}"
CHRONIC_GAP_SECS="${UPLINK_FLOOD_CHRONIC_GAP_SECS:-180}"
CHRONIC_RTT_MS="${UPLINK_FLOOD_CHRONIC_RTT_MS:-300}"
CHRONIC_PAUSE_SECS="${UPLINK_FLOOD_CHRONIC_PAUSE_SECS:-90}"
CHRONIC_FILE="${UPLINK_GUARD_CHRONIC_FILE:-/tmp/uplink-flood-guard.chronic}"
CHRONIC_NOTIFY_FILE="${UPLINK_GUARD_CHRONIC_NOTIFY_FILE:-/tmp/uplink-flood-guard.chronicnotify}"
CHRONIC_NOTIFY_COOLDOWN=1800
PROBE_HOST="${UPLINK_GUARD_PROBE_HOST:-1.1.1.1}"
# only ever pause known agent/automation processes — never system or transport
AGENT_RE='^(agy|codex|claude|node|python[0-9.]*|ollama|gemini|deno|bun|language_server|grok.*)\.'
# never flag these even for alerts: their outbound IS the interactive session/transport
EXCLUDE_RE='^(screensharingd|ScreensharingAgent|IPNExtension|Tailscale|tailscaled|sshd)'
DRY_RUN="${1:-}"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }

now_epoch() { echo "${UPLINK_GUARD_NOW_EPOCH:-$(date +%s)}"; }

notify() {
  [[ "${UPLINK_GUARD_DISABLE_NOTIFY:-0}" == "1" ]] && return
  curl -s -m 10 -H "Title: uplink-flood-guard ($(hostname -s))" -H "Priority: high" \
    -d "$1" "https://ntfy.sh/$NTFY_TOPIC" >/dev/null 2>&1
}

screen_share_active() {
  lsof -n -a -i TCP -c screensharingd -c ScreensharingAgent 2>/dev/null | grep -q ESTABLISHED
}

# `nettop` and `ps` spell executables differently (for example grok-1.0.6 vs
# grok). Resume identity therefore uses PID + immutable process start identity,
# not a fragile display-name equality check. PID reuse changes the identity.
process_identity() {
  identity_source=$(ps -p "$1" -o lstart=,comm= 2>/dev/null \
    | sed -E 's/^[[:space:]]+//; s/[[:space:]]+/ /g')
  [[ -n "$identity_source" ]] || return 0
  printf '%s' "$identity_source" | cksum | awk '{print $1}'
}

process_exists() { kill -0 "$1" 2>/dev/null; }

signal_process() {
  signal="$1"; target_pid="$2"
  if [[ -n "${UPLINK_GUARD_SIGNAL_CMD:-}" ]]; then
    "$UPLINK_GUARD_SIGNAL_CMD" "$signal" "$target_pid"
  else
    kill "-$signal" "$target_pid"
  fi
}

pause_process() {
  target_pid="$1"; target_name="$2"; pause_kind="$3"; deadline="$4"; identity="$5"
  state_tmp="${STATE}.$$"
  printf '%s %s %s %s %s\n' "$target_pid" "$target_name" "$pause_kind" "$deadline" "$identity" > "$state_tmp"
  mv "$state_tmp" "$STATE"
  if signal_process STOP "$target_pid"; then
    return 0
  fi
  rm -f "$STATE"
  return 1
}

net_rtt_ms() {
  ping -c 3 -t 5 "$PROBE_HOST" 2>/dev/null | awk '
    /round-trip/ { split($4, a, "/"); avg=a[2] }
    END { printf "%d", (avg==""?9999:avg) }'
}

# --- resume a previously paused flooder ---
if [[ -f "$STATE" ]]; then
  read -r ppid pname pkind pdeadline pidentity < "$STATE" || true
  pkind="${pkind:-share}"; pdeadline="${pdeadline:-0}"; pidentity="${pidentity:-missing}"
  now=$(now_epoch)
  if ! process_exists "$ppid"; then
    rm -f "$STATE"; log "paused pid $ppid ($pname) no longer exists; state cleared"
  else
    resume_reason=""
    if [[ "$pkind" == "chronic" ]]; then
      (( now >= pdeadline )) && resume_reason="chronic pause window elapsed"
    else
      screen_share_active || resume_reason="screen share ended"
    fi
    if [[ -n "$resume_reason" ]]; then
      current_identity=$(process_identity "$ppid")
      if [[ -n "$current_identity" && "$current_identity" == "$pidentity" ]]; then
        signal_process CONT "$ppid" && log "$resume_reason -> resumed $pname ($ppid) identity=$pidentity"
        [[ "$pkind" != "chronic" ]] && notify "Screen share ended — resumed paused agent $pname (pid $ppid)."
      else
        log "pid $ppid identity changed (stored=$pidentity current=${current_identity:-missing}); not sending CONT"
      fi
      rm -f "$STATE"
    fi
  fi
  exit 0   # while something is paused (or just resumed), don't hunt for more
fi

# --- sample per-process outbound bytes + retransmits ---
# nettop -L 2 prints two CUMULATIVE snapshots; the per-window delta is snap2 - snap1
sample=$(nettop -P -x -L 2 -s "$SAMPLE_SECS" -J bytes_out,re-tx 2>/dev/null)
deltas=$(echo "$sample" | awk -F, '
  /^,bytes_out/ {blk++; next}
  blk==1 {b1[$1]=$2; r1[$1]=$3}
  blk==2 {db=$2-b1[$1]; dr=$3-r1[$1]; if (db>0) printf "%s,%d,%d\n", $1, db, (dr>0?dr:0)}
')
[[ -z "$deltas" ]] && exit 0

top_line=$(echo "$deltas" | grep -vE "$EXCLUDE_RE" | sort -t, -k2 -rn | head -1)
[[ -z "$top_line" ]] && exit 0

proc_pid=$(echo "$top_line" | cut -d, -f1)     # e.g. agy.83950
bytes=$(echo "$top_line" | cut -d, -f2)
retx=$(echo "$top_line" | cut -d, -f3)
rate=$(( bytes / SAMPLE_SECS ))
pid="${proc_pid##*.}"
name="${proc_pid%.*}"
[[ "$pid" =~ ^[0-9]+$ ]] || exit 0
(( pid > 1 )) || exit 0

if (( rate < BPS_THRESHOLD )) || (( ${retx:-0} < RETX_THRESHOLD )); then
  rm -f "$CHRONIC_FILE"
  exit 0
fi

log "FLOOD: $proc_pid rate=$((rate/1024))KB/s retx=$retx (window ${SAMPLE_SECS}s)"

# --- self-heal: the "flooder" is the Tailscale tunnel itself drowning in re-tx.
# Screen share rides the tunnel; when the CGNAT path rots, retx explodes
# (85k-215k/10s on 2026-07-13 vs ~500-3k normal) and the UI feels frozen while
# load/RAM are healthy. The proven fix is a fresh path: rebind + restun.
TS_HEAL_RETX=20000
TS_HEAL_COOLDOWN=900
TS_HEAL_FILE="/tmp/uplink-flood-guard.lastheal"
TS_BIN="/Applications/Tailscale.app/Contents/MacOS/Tailscale"
if [[ "$name" == io.tailscale* || "$name" == *tailscaled* ]] && (( ${retx:-0} >= TS_HEAL_RETX )) && [[ -x "$TS_BIN" ]]; then
  now=$(date +%s); last=$(cat "$TS_HEAL_FILE" 2>/dev/null || echo 0)
  if (( now - last > TS_HEAL_COOLDOWN )); then
    echo "$now" > "$TS_HEAL_FILE"
    if [[ "$DRY_RUN" == "--dry-run" ]]; then
      log "DRY-RUN: would rebind+restun Tailscale (tunnel retx=$retx)"
    else
      "$TS_BIN" debug rebind >/dev/null 2>&1
      "$TS_BIN" debug restun >/dev/null 2>&1
      log "SELF-HEAL: Tailscale rebind+restun (tunnel retx=$retx in ${SAMPLE_SECS}s)"
      notify "Tailscale tunnel was drowning ($retx re-tx in ${SAMPLE_SECS}s) — auto-ran rebind+restun for a fresh path. Screen share should recover in ~30s."
    fi
  fi
  exit 0
fi

if ! echo "$proc_pid" | grep -qE "$AGENT_RE"; then
  # not an agent proc (could be Backblaze, Photos sync, the user themselves) — alert only
  now=$(date +%s); last=$(cat "$COOLDOWN_FILE" 2>/dev/null || echo 0)
  if (( now - last > COOLDOWN_SECS )); then
    echo "$now" > "$COOLDOWN_FILE"
    notify "Uplink saturated by non-agent process $proc_pid ($((rate/1024))KB/s, $retx re-tx). Not pausing it — investigate."
  fi
  exit 0
fi

if screen_share_active; then
  if [[ "$DRY_RUN" == "--dry-run" ]]; then
    log "DRY-RUN: would SIGSTOP $name ($pid)"
  else
    identity=$(process_identity "$pid")
    if [[ -n "$identity" ]] && pause_process "$pid" "$name" share 0 "$identity"; then
      log "SIGSTOP $name ($pid) — screen share active identity=$identity"
      notify "Paused $name (pid $pid): it was saturating the uplink ($((rate/1024))KB/s, $retx re-tx) and freezing your screen share. It auto-resumes when you disconnect."
    fi
  fi
  exit 0
fi

# No screen share: require the same process name to flood in consecutive
# launchd intervals, then prove the public path is degraded before pausing.
now=$(now_epoch)
if [[ -f "$CHRONIC_FILE" ]]; then
  read -r cname ccount cts < "$CHRONIC_FILE" || { cname=""; ccount=0; cts=0; }
else
  cname=""; ccount=0; cts=0
fi
if [[ "$cname" == "$name" ]] && (( now - cts <= CHRONIC_GAP_SECS )); then
  ccount=$((ccount + 1))
else
  ccount=1
fi
echo "$name $ccount $now" > "$CHRONIC_FILE"

if (( ccount < CHRONIC_RUNS )); then
  log "chronic: $name flood streak $ccount/$CHRONIC_RUNS"
  exit 0
fi

rtt=$(net_rtt_ms)
if (( rtt < CHRONIC_RTT_MS )); then
  log "chronic: $name streak $ccount but RTT ${rtt}ms < ${CHRONIC_RTT_MS}ms — link is coping, not pausing"
  exit 0
fi

if [[ "$DRY_RUN" == "--dry-run" ]]; then
  log "DRY-RUN: would chronic-SIGSTOP $name ($pid) for ${CHRONIC_PAUSE_SECS}s (streak=$ccount rtt=${rtt}ms threshold=${BPS_THRESHOLD_KBPS}KB/s)"
  exit 0
fi

identity=$(process_identity "$pid")
if [[ -n "$identity" ]] && pause_process "$pid" "$name" chronic "$((now + CHRONIC_PAUSE_SECS))" "$identity"; then
  rm -f "$CHRONIC_FILE"
  log "CHRONIC SIGSTOP $name ($pid) for ${CHRONIC_PAUSE_SECS}s — $((rate/1024))KB/s, retx=$retx, rtt=${rtt}ms, identity=$identity"
  last=$(cat "$CHRONIC_NOTIFY_FILE" 2>/dev/null || echo 0)
  if (( now - last > CHRONIC_NOTIFY_COOLDOWN )); then
    echo "$now" > "$CHRONIC_NOTIFY_FILE"
    notify "Chronic uplink flood: paused $name (pid $pid) for ${CHRONIC_PAUSE_SECS}s after ${ccount} checks; RTT was ${rtt}ms. It auto-resumes."
  fi
fi
