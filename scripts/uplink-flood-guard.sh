#!/bin/bash
# uplink-flood-guard.sh — pause (SIGSTOP) an agent process that saturates the
# uplink while a screen-share session is active; auto-resume (SIGCONT) when the
# session ends. Never kills anything, so no agent WIP is destroyed.
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

LOG="$HOME/Library/Logs/uplink-flood-guard.log"
STATE="/tmp/uplink-flood-guard.paused"      # "<pid> <procname>" of a paused flooder
NTFY_TOPIC="yolo-guard-fdh8ktuw1vtxb5sb"
SAMPLE_SECS=10
BPS_THRESHOLD=$((1500*1024))   # 1.5 MB/s sustained outbound (~12 Mbps, most of a T-Mobile uplink)
RETX_THRESHOLD=500             # per-proc retransmits during the sample window = link is drowning
COOLDOWN_SECS=600
COOLDOWN_FILE="/tmp/uplink-flood-guard.lastalert"
# only ever pause known agent/automation processes — never system or transport
AGENT_RE='^(agy|codex|claude|node|python[0-9.]*|ollama|gemini|deno|bun)\.'
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

# --- resume a previously paused flooder once screen share is gone ---
if [[ -f "$STATE" ]]; then
  read -r ppid pname < "$STATE"
  if ! kill -0 "$ppid" 2>/dev/null; then
    rm -f "$STATE"; log "paused pid $ppid ($pname) no longer exists; state cleared"
  elif ! screen_share_active; then
    cur=$(ps -o comm= -p "$ppid" 2>/dev/null | xargs basename 2>/dev/null)
    if [[ "$cur" == "$pname" ]]; then
      kill -CONT "$ppid" && log "screen share ended -> resumed $pname ($ppid)" \
        && notify "Screen share ended — resumed paused agent $pname (pid $ppid)."
    else
      log "pid $ppid reused by '$cur' (was $pname); not sending CONT"
    fi
    rm -f "$STATE"
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
    kill -STOP "$pid" && echo "$pid $name" > "$STATE" \
      && log "SIGSTOP $name ($pid) — screen share active" \
      && notify "Paused $name (pid $pid): it was saturating the uplink ($((rate/1024))KB/s, $retx re-tx) and freezing your screen share. It auto-resumes when you disconnect, or run: kill -CONT $pid"
  fi
else
  # nobody is interactively suffering — let the agent work, just tell Igor once
  now=$(date +%s); last=$(cat "$COOLDOWN_FILE" 2>/dev/null || echo 0)
  if (( now - last > COOLDOWN_SECS )); then
    echo "$now" > "$COOLDOWN_FILE"
    notify "Heads-up: $name (pid $pid) is saturating the uplink ($((rate/1024))KB/s, $retx re-tx). No screen share active, so it was left running."
  fi
fi
