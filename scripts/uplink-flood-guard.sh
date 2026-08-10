#!/bin/bash
# uplink-flood-guard.sh — pause (SIGSTOP) an agent process that saturates the
# uplink, then auto-resume (SIGCONT). Never kills anything, so no agent WIP is
# destroyed. Two triggers:
#   1. screen-share mode (v1): pause while a screen-share session is active;
#      resume when the session ends.
#   2. chronic mode (v2, 2026-08-10): even with no screen share, a flooder that
#      saturates the uplink for CHRONIC_RUNS consecutive checks WHILE internet
#      RTT is degraded gets paused for a bounded CHRONIC_PAUSE_SECS, then
#      auto-resumes. Duty-cycles a persistent flooder (~50%) instead of letting
#      it drown the link for hours. Born from 2026-08-10: fleet upload measured
#      at 13.4 of 14.5 Mbps (93%) on T-Mobile Home Internet, 700-1100ms RTT,
#      sites/email timing out; v1 correctly logged FLOOD all day and did nothing.
#
# v1 born 2026-07-07: agy (Antigravity CLI) uploaded 415MB w/ 25M TCP re-tx to
# Google's backend on the mini's T-Mobile uplink -> screen share fully frozen
# while load avg was 3 and RAM 81% free. No existing guard branch saw it.
#
# Detection: two nettop snapshots SAMPLE_SECS apart; a single non-system
# process whose outbound rate exceeds BPS_THRESHOLD AND whose per-proc re-tx
# delta exceeds RETX_THRESHOLD is a flooder. System/transport procs are never
# touched.
set -u

LOG="$HOME/Library/Logs/uplink-flood-guard.log"
STATE="/tmp/uplink-flood-guard.paused"      # "<pid> <procname> <kind> <deadline>"; kind=share|chronic
NTFY_TOPIC="yolo-guard-fdh8ktuw1vtxb5sb"
SAMPLE_SECS=10
BPS_THRESHOLD=$((1500*1024))   # 1.5 MB/s sustained outbound (~12 Mbps, most of a T-Mobile uplink)
RETX_THRESHOLD=500             # per-proc retransmits during the sample window = link is drowning
COOLDOWN_SECS=600
COOLDOWN_FILE="/tmp/uplink-flood-guard.lastalert"
# chronic mode: N consecutive flood detections (launchd runs 60s apart) with a
# degraded internet path -> bounded pause. Counter resets if detections stop.
CHRONIC_RUNS=3
CHRONIC_GAP_SECS=240           # max age of the previous detection to count as consecutive
CHRONIC_RTT_MS=300             # only pause when the link is actually suffering
CHRONIC_PAUSE_SECS=180
CHRONIC_FILE="/tmp/uplink-flood-guard.chronic"        # "<procname> <count> <epoch>"
CHRONIC_NOTIFY_FILE="/tmp/uplink-flood-guard.chronicnotify"
CHRONIC_NOTIFY_COOLDOWN=1800   # ntfy at most every 30 min; every action still hits the log
PROBE_HOST="1.1.1.1"
# only ever pause known agent/automation processes — never system or transport.
# language_server + grok added 2026-08-10: Antigravity's language_server and the
# grok desktop helper were the measured top uploaders (4.3 + 1.7 Mbps sustained).
AGENT_RE='^(agy|codex|claude|node|python[0-9.]*|ollama|gemini|deno|bun|language_server|grok.*)\.'
# never flag these even for alerts: their outbound IS the interactive session/transport
EXCLUDE_RE='^(screensharingd|ScreensharingAgent|IPNExtension|Tailscale|tailscaled|sshd)'
DRY_RUN="${1:-}"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }

notify() {
  curl -s -m 10 -H "Title: uplink-flood-guard ($(hostname -s))" -H "Priority: high" \
    -d "$1" "https://ntfy.sh/$NTFY_TOPIC" >/dev/null 2>&1
}

screen_share_active() {
  lsof -n -a -i TCP -c screensharingd -c ScreensharingAgent 2>/dev/null | grep -q ESTABLISHED
}

# avg internet RTT in integer ms (9999 on total loss)
net_rtt_ms() {
  ping -c 3 -t 5 "$PROBE_HOST" 2>/dev/null | awk '
    /round-trip/ { split($4, a, "/"); avg=a[2] }
    END { printf "%d", (avg==""?9999:avg) }'
}

# --- resume a previously paused flooder ---
if [[ -f "$STATE" ]]; then
  read -r ppid pname pkind pdeadline < "$STATE" || true
  pkind="${pkind:-share}"; pdeadline="${pdeadline:-0}"
  now=$(date +%s)
  if ! kill -0 "$ppid" 2>/dev/null; then
    rm -f "$STATE"; log "paused pid $ppid ($pname) no longer exists; state cleared"
  else
    resume=""
    if [[ "$pkind" == "chronic" ]]; then
      (( now >= pdeadline )) && resume="chronic pause window (${CHRONIC_PAUSE_SECS}s) elapsed"
    else
      screen_share_active || resume="screen share ended"
    fi
    if [[ -n "$resume" ]]; then
      cur=$(ps -o comm= -p "$ppid" 2>/dev/null | xargs basename 2>/dev/null)
      if [[ "$cur" == "$pname" ]]; then
        kill -CONT "$ppid" && log "$resume -> resumed $pname ($ppid)"
        [[ "$pkind" != "chronic" ]] && notify "Screen share ended — resumed paused agent $pname (pid $ppid)."
      else
        log "pid $ppid reused by '$cur' (was $pname); not sending CONT"
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

if (( rate < BPS_THRESHOLD )) || (( ${retx:-0} < RETX_THRESHOLD )); then
  rm -f "$CHRONIC_FILE"   # flood over (or never was) — reset the consecutive counter
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
    kill -STOP "$pid" && echo "$pid $name share 0" > "$STATE" \
      && log "SIGSTOP $name ($pid) — screen share active" \
      && notify "Paused $name (pid $pid): it was saturating the uplink ($((rate/1024))KB/s, $retx re-tx) and freezing your screen share. It auto-resumes when you disconnect, or run: kill -CONT $pid"
  fi
  exit 0
fi

# --- chronic mode: no screen share, but the flood is sustained and the link is
# degraded for everyone (browsing, email). Count consecutive detections.
now=$(date +%s)
read -r cname ccount cts < "$CHRONIC_FILE" 2>/dev/null || { cname=""; ccount=0; cts=0; }
if [[ "$cname" == "$name" ]] && (( now - cts <= CHRONIC_GAP_SECS )); then
  ccount=$(( ccount + 1 ))
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
  log "DRY-RUN: would chronic-SIGSTOP $name ($pid) for ${CHRONIC_PAUSE_SECS}s (streak=$ccount rtt=${rtt}ms)"
  exit 0
fi

if kill -STOP "$pid"; then
  echo "$pid $name chronic $(( now + CHRONIC_PAUSE_SECS ))" > "$STATE"
  rm -f "$CHRONIC_FILE"
  log "CHRONIC SIGSTOP $name ($pid) for ${CHRONIC_PAUSE_SECS}s — $((rate/1024))KB/s, retx=$retx, rtt=${rtt}ms, streak=$ccount"
  last=$(cat "$CHRONIC_NOTIFY_FILE" 2>/dev/null || echo 0)
  if (( now - last > CHRONIC_NOTIFY_COOLDOWN )); then
    echo "$now" > "$CHRONIC_NOTIFY_FILE"
    notify "Chronic uplink flood: paused $name (pid $pid) for ${CHRONIC_PAUSE_SECS}s — it held the uplink at $((rate/1024))KB/s with $retx re-tx while internet RTT was ${rtt}ms. Auto-resumes; resume now: kill -CONT $pid"
  fi
fi
