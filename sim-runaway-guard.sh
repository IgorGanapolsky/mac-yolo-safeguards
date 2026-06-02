#!/bin/sh
# Smart simulator runaway guard — runs every 60s via LaunchAgent.
#
# Behavior:
#   1. Kills runaway sims if load>30 AND >50 simruntime procs (CPU runaway)
#      OR sim_mem>50% AND >50 simruntime procs (memory hog).
#   2. CPU-runaway guard for NON-simulator processes: any user-owned process
#      pegged above the CPU threshold is reported. Known-safe background
#      helpers (the Antigravity securecoder semgrep scanner, orphaned crash
#      handlers) are auto-killed once they stay hot for N consecutive checks;
#      editors and any unknown process are notify-only (never auto-killed).
#   3. Posts a macOS notification on every fire so the user knows.
#   4. ESCALATION: if it fires 3+ times in 10 minutes, also quits the
#      likely culprit app (Antigravity IDE) so the loop is broken.
#   5. Self-heals via `install.sh` if any safeguard file is missing.

# Resolve the canonical repository directory from the script's real path.
# Since sim-runaway-guard.sh is a symlink, resolving its real path gives the repo directory.
REAL_SCRIPT_PATH=$(python3 -c "import os; print(os.path.realpath('$0'))" 2>/dev/null || readlink -f "$0" 2>/dev/null || echo "$0")
case "$REAL_SCRIPT_PATH" in
  /*) ;;
  *) REAL_SCRIPT_PATH="$(pwd)/$REAL_SCRIPT_PATH" ;;
esac
REPO=$(dirname "$REAL_SCRIPT_PATH")

ESCALATE_AFTER_FIRES=${YOLO_ESCALATE_AFTER_FIRES:-3}
ESCALATE_WINDOW_SEC=${YOLO_ESCALATE_WINDOW_SEC:-600}
# HARD RULE: never auto-kill GUI apps (Antigravity, Cursor, Xcode, Ghostty, etc.) — user
# has unsaved work and active sessions. Escalation NOTIFIES, it does not kill.
# Override only via env if user explicitly opts in for a specific test/headless context.
SUSPECT_APPS=${YOLO_SUSPECT_APPS:-""}
FIRES_LOG=${YOLO_FIRES_LOG:-/tmp/yolo-fires.log}
LOG=${YOLO_LOG:-/tmp/shutdown-simulators.log}

now=$(date +%s)

notify() {
  # macOS notification + log line. Works from LaunchAgent in gui/$(id -u).
  # Args: TITLE, MSG, [OPEN_FILE].
  # Prefer terminal-notifier: it registers as a proper sender, so the body
  # actually renders AND a click runs -execute. Critically, osascript's
  # `display notification` is owned by Script Editor — clicking such a
  # notification launches a blank Script Editor window (the 2026-06-02 bug),
  # so it's only a last-resort fallback when terminal-notifier is absent.
  local TITLE="$1"; local MSG="$2"; local OPEN_FILE="$3"
  local TN
  TN=$(command -v terminal-notifier 2>/dev/null || /usr/bin/which terminal-notifier 2>/dev/null)
  if [ -n "$TN" ] && [ -x "$TN" ]; then
    if [ -n "$OPEN_FILE" ]; then
      "$TN" -title "$TITLE" -message "$MSG" -execute "open -t $OPEN_FILE" -ignoreDnD >/dev/null 2>&1 || true
    else
      "$TN" -title "$TITLE" -message "$MSG" -ignoreDnD >/dev/null 2>&1 || true
    fi
  else
    # Fallback: osascript. Cram the actionable bit into the title since macOS
    # often shows ONLY the title for unregistered shell-script senders.
    /usr/bin/osascript -e "display notification \"$MSG\" with title \"$TITLE\"" 2>/dev/null || true
  fi
  echo "$(date) NOTIFY: $TITLE — $MSG" >> "$LOG"
}

# --- Self-heal: if any expected symlink is missing, re-run install.sh ---
# Detect antigravity-cli path dynamically
AGY_CLI_DIR="$HOME/workspace/git/$USER/antigravity-hub/antigravity-cli"
if [ ! -d "$AGY_CLI_DIR" ]; then
  if [ -d "$HOME/workspace/git/igor/antigravity-hub/antigravity-cli" ]; then
    AGY_CLI_DIR="$HOME/workspace/git/igor/antigravity-hub/antigravity-cli"
  else
    FOUND=$(find "$HOME/workspace" -type d -path "*/antigravity-hub/antigravity-cli" -maxdepth 5 2>/dev/null | head -n 1)
    [ -n "$FOUND" ] && AGY_CLI_DIR="$FOUND"
  fi
fi

heal_needed=0
# Symlinks (created by install.sh `link` helper):
[ -L "$HOME/.local/bin/yolo-health" ] || heal_needed=1
[ -L "$AGY_CLI_DIR/bin/agy-yolo-wrapper.js" ] || heal_needed=1
# Plist is a RENDERED FILE (not a symlink) since v0.2.0 — install.sh
# substitutes {{HOME}} placeholders when copying. Check existence, not -L.
[ -f "$HOME/Library/LaunchAgents/com.igor.shutdown-simulators.plist" ] || heal_needed=1
if [ "$heal_needed" = "1" ] && [ -x "$REPO/install.sh" ]; then
  echo "$(date) SELF-HEAL: re-running install.sh" >> "$LOG"
  /bin/sh "$REPO/install.sh" >> "$LOG" 2>&1 || true
fi

# --- Threshold check ---
LOAD=$(/usr/bin/uptime | /usr/bin/awk -F'load averages?:' '{print $2}' | /usr/bin/awk '{print $1}' | /usr/bin/tr -d ',')
LOAD_INT=${LOAD%.*}
[ -z "$LOAD_INT" ] && LOAD_INT=0

SIM_COUNT=$(/bin/ps ax | /usr/bin/grep -i simruntime | /usr/bin/grep -v grep | /usr/bin/wc -l | /usr/bin/tr -d ' ')
SIM_MEM=$(/bin/ps aux | /usr/bin/grep -i simruntime | /usr/bin/grep -v grep | /usr/bin/awk '{mem+=$4} END {printf "%d", mem+0}')
[ -z "$SIM_MEM" ] && SIM_MEM=0

REASON=""
if [ "$SIM_COUNT" -gt 50 ]; then
  if [ "$LOAD_INT" -gt 30 ]; then
    REASON="CPU runaway (load=$LOAD sim_procs=$SIM_COUNT)"
  elif [ "$SIM_MEM" -gt 50 ]; then
    REASON="memory hog (sim_mem=${SIM_MEM}% sim_procs=$SIM_COUNT)"
  fi
fi

if [ -z "$REASON" ]; then
  # --- Soft CPU-runaway check (non-simulator processes) ---
  # The sim branch above only fires on simruntime procs; the memory branch
  # below keys on RSS. Neither catches a process spinning a core on CPU —
  # e.g. Antigravity securecoder's `semgrep-core-proprietary` scanner pegging
  # 100% CPU on a scratch dir (the 2026-06-01 freeze), or an orphaned crash
  # handler. This branch closes that gap.
  #
  # EVERY user-owned process over the threshold is evaluated (not just the #1
  # hog) so a runaway hiding behind a busy editor is still caught. Safe-by-
  # default: a process is only auto-killed if it is a known-safe background
  # helper — either its executable basename matches YOLO_CPU_AUTOKILL_PATTERNS,
  # or its full command line matches YOLO_CPU_AUTOKILL_CMD_PATTERNS (for
  # interpreter-hosted scanners like CodeQL-under-java) — AND it has stayed hot
  # for YOLO_CPU_SUSTAINED_FIRES consecutive checks (so a brief compile/scan
  # spike is never killed). Every other over-threshold process — editors, dev
  # servers, anything unknown — is notify-only, consistent with the "never
  # auto-kill GUI apps" hard rule. Root/system processes are ignored (their CPU
  # isn't user-actionable).
  CPU_PCT_THRESHOLD=${YOLO_CPU_PCT_THRESHOLD:-150}
  CPU_SUSTAINED_FIRES=${YOLO_CPU_SUSTAINED_FIRES:-2}
  CPU_NOTIFY_DEBOUNCE_SEC=${YOLO_CPU_NOTIFY_DEBOUNCE_SEC:-1800}
  CPU_AUTOKILL_PATTERNS=${YOLO_CPU_AUTOKILL_PATTERNS:-semgrep-core-proprietary|semgrep-core|crashpad_handler|crash_handler}
  # Command-signature allowlist: for runaways that execute under a generic
  # interpreter whose basename is too broad to allowlist (e.g. Antigravity's
  # CodeQL scanner is a plain `java` process — the 2026-06-02 freeze). Matched
  # (ERE) against the FULL command line. Keep each signature specific enough
  # that it can only be the background tool, never the user's own work.
  CPU_AUTOKILL_CMD_PATTERNS=${YOLO_CPU_AUTOKILL_CMD_PATTERNS:-com\.semmle\.cli2\.CodeQL}
  CPU_STATE_FILE=${YOLO_CPU_STATE_FILE:-/tmp/yolo-cpu-state}
  CPU_LAST_FILE=${YOLO_CPU_LAST_FILE:-/tmp/yolo-cpu-last}
  CPU_STATUS_FILE=${YOLO_CPU_STATUS_FILE:-/tmp/yolo-cpu-status.txt}

  # All user-owned procs at/above threshold, as "pid pcpu" lines (desc by CPU).
  # Detection uses only user/pid/pcpu so executable paths with spaces can't
  # break field-splitting; names are resolved per-PID via `ps -o comm=` below.
  CPU_HOT_LIST=$(/bin/ps -axo user,pid,pcpu -r | /usr/bin/awk -v u="$USER" -v t="$CPU_PCT_THRESHOLD" '
    NR>1 && $1==u { pcpu=$3+0; if (pcpu>=t) printf "%s %d\n", $2, pcpu }')

  CPU_NEW_STATE=""          # carried-forward streaks for allowlisted-not-yet-killed pids
  CPU_NOTIFY_PID=""; CPU_NOTIFY_PCPU=0; CPU_NOTIFY_NAME=""   # worst non-allowlisted hog

  # Loop in the CURRENT shell (here-doc, not a pipe) so accumulator vars persist.
  while read -r pid pcpu; do
    [ -z "$pid" ] && continue
    comm=$(/bin/ps -o comm= -p "$pid" 2>/dev/null)
    [ -z "$comm" ] && continue                              # process already gone
    base=$(printf '%s' "$comm" | /usr/bin/sed 's|.*/||')    # executable basename (robust to spaces)

    # Auto-kill eligible if the basename is allowlisted, OR (for interpreter-
    # hosted scanners like CodeQL-under-java) the full command matches a
    # specific signature. Signature match reads the whole command line, so
    # spaces in paths are irrelevant.
    kill_name=""
    if echo "$base" | /usr/bin/grep -qiE "^($CPU_AUTOKILL_PATTERNS)$"; then
      kill_name="$base"
    elif [ -n "$CPU_AUTOKILL_CMD_PATTERNS" ] \
      && /bin/ps -o command= -p "$pid" 2>/dev/null | /usr/bin/grep -qiE "$CPU_AUTOKILL_CMD_PATTERNS"; then
      kill_name="$base (matched kill-signature)"
    fi

    if [ -n "$kill_name" ]; then
      # Known-safe background helper — gate on a per-PID consecutive-hit streak.
      prev=$(/usr/bin/awk -v p="$pid" '$1==p {print $2; exit}' "$CPU_STATE_FILE" 2>/dev/null)
      [ -z "$prev" ] && prev=0
      streak=$((prev + 1))
      if [ "$streak" -ge "$CPU_SUSTAINED_FIRES" ]; then
        /bin/kill -9 "$pid" 2>/dev/null
        notify "yolo-guard: killed CPU runaway" "$kill_name (PID $pid) at ${pcpu}% CPU for $streak checks — safe background process."
        echo "$(date) CPU_KILL: $kill_name PID $pid at ${pcpu}% CPU (streak=$streak) — kill -9" >> "$LOG"
      else
        CPU_NEW_STATE="${CPU_NEW_STATE}${pid} ${streak}
"
      fi
    else
      # Not auto-killable — remember the single worst one for a notify.
      if [ "$pcpu" -gt "$CPU_NOTIFY_PCPU" ]; then
        CPU_NOTIFY_PID="$pid"; CPU_NOTIFY_PCPU="$pcpu"
        case "$comm" in
          *.app/*) CPU_NOTIFY_NAME=$(printf '%s' "$comm" | /usr/bin/sed -E 's|.*/([^/]+)\.app/.*|\1|') ;;
          *)       CPU_NOTIFY_NAME="$base" ;;
        esac
      fi
    fi
  done <<CPU_HOT_EOF
$CPU_HOT_LIST
CPU_HOT_EOF

  # Persist streaks for allowlisted-but-not-yet-killed pids (empties the file if
  # none are hot, so the streak always requires genuinely-consecutive checks).
  printf '%s' "$CPU_NEW_STATE" > "$CPU_STATE_FILE"

  # Notify about the worst non-allowlisted hog (debounced; never killed).
  if [ -n "$CPU_NOTIFY_PID" ]; then
    LAST_CPU_NOTIFY=0
    [ -f "$CPU_LAST_FILE" ] && LAST_CPU_NOTIFY=$(/bin/cat "$CPU_LAST_FILE" 2>/dev/null || echo 0)
    if [ $((now - LAST_CPU_NOTIFY)) -ge "$CPU_NOTIFY_DEBOUNCE_SEC" ]; then
      {
        echo "yolo-guard CPU runaway report"
        echo "Generated: $(date)"
        echo ""
        echo "Process: $CPU_NOTIFY_NAME"
        echo "  PID:    $CPU_NOTIFY_PID"
        echo "  CPU:    ${CPU_NOTIFY_PCPU}%  (threshold: >=${CPU_PCT_THRESHOLD}%)"
        echo ""
        echo "Not auto-killed: only known-safe background helpers are auto-killed"
        echo "  (allowlist: $CPU_AUTOKILL_PATTERNS)."
        echo ""
        echo "Your options (the kit will not auto-kill GUI apps or unknown processes):"
        echo "  1. Inspect what it's doing: ps -o pid,pcpu,etime,command -p $CPU_NOTIFY_PID"
        echo "  2. Soft stop:               kill -INT $CPU_NOTIFY_PID"
        echo "  3. Hard kill:               kill -9 $CPU_NOTIFY_PID  (loses unsaved work in that process)"
        echo "  4. Full kit health check:   yolo-health"
        echo ""
        echo "  Source: $REPO/sim-runaway-guard.sh"
      } > "$CPU_STATUS_FILE"
      # terminal-notifier: clicking opens the status file (NOT Script Editor).
      notify "yolo-guard: $CPU_NOTIFY_NAME ${CPU_NOTIFY_PCPU}% CPU · kill -9 $CPU_NOTIFY_PID" "Sustained CPU runaway (PID $CPU_NOTIFY_PID). Click to open details." "$CPU_STATUS_FILE"
      echo "$now" > "$CPU_LAST_FILE"
      echo "$(date) CPU_NOTIFY: $CPU_NOTIFY_NAME PID $CPU_NOTIFY_PID ${CPU_NOTIFY_PCPU}% status=$CPU_STATUS_FILE" >> "$LOG"
    fi
  fi

  # --- Soft memory-pressure check (notify only, never kill) ---
  # Triggers when free memory < MEM_FREE_PCT_THRESHOLD AND any AI process
  # exceeds MEM_PROC_RSS_MB_THRESHOLD. Debounced via /tmp/yolo-mem-last so we
  # don't spam every 60s.
  MEM_FREE_PCT_THRESHOLD=${YOLO_MEM_FREE_PCT_THRESHOLD:-15}
  MEM_PROC_RSS_MB_THRESHOLD=${YOLO_MEM_PROC_RSS_MB_THRESHOLD:-1500}
  MEM_NOTIFY_DEBOUNCE_SEC=${YOLO_MEM_NOTIFY_DEBOUNCE_SEC:-1800}
  MEM_LAST_FILE=${YOLO_MEM_LAST_FILE:-/tmp/yolo-mem-last}

  FREE_PCT=$(/usr/bin/memory_pressure -Q 2>/dev/null | /usr/bin/awk -F': ' '/free percentage/ {gsub("%",""); print $2; exit}')
  [ -z "$FREE_PCT" ] && FREE_PCT=100

  if [ "$FREE_PCT" -lt "$MEM_FREE_PCT_THRESHOLD" ]; then
    # Capture PID + RSS + name of the top AI memory hog (if any exceed threshold).
    TOP_HOG_LINE=$(/bin/ps -axo pid,rss,command -m | /usr/bin/awk -v t="$MEM_PROC_RSS_MB_THRESHOLD" '
      NR>1 {
        pid = $1
        rss_mb = $2/1024
        if (rss_mb >= t) {
          name = $3
          sub(".*/", "", name)
          # Case-insensitive: matches agy, claude, Claude, cursor, Cursor, antigravity, Antigravity, codex, Codex.
          if (tolower(name) ~ /agy|claude|cursor|antigravity|codex/) {
            printf "%s|%.0f|%s", pid, rss_mb, name
            exit
          }
        }
      }')
    if [ -n "$TOP_HOG_LINE" ]; then
      HOG_PID=$(echo "$TOP_HOG_LINE" | /usr/bin/cut -d'|' -f1)
      HOG_RSS=$(echo "$TOP_HOG_LINE" | /usr/bin/cut -d'|' -f2)
      HOG_NAME=$(echo "$TOP_HOG_LINE" | /usr/bin/cut -d'|' -f3)
      STATUS_FILE=${YOLO_STATUS_FILE:-/tmp/yolo-status.txt}
      LAST_NOTIFY=0
      [ -f "$MEM_LAST_FILE" ] && LAST_NOTIFY=$(/bin/cat "$MEM_LAST_FILE" 2>/dev/null || echo 0)
      if [ $((now - LAST_NOTIFY)) -ge "$MEM_NOTIFY_DEBOUNCE_SEC" ]; then
        # Self-sufficient notification via the shared notify() helper:
        # name + RSS + kill cmd in the title (shown even if the body is
        # dropped), click opens the full status file. notify() prefers
        # terminal-notifier and falls back to osascript.
        notify "yolo-guard: $HOG_NAME ${HOG_RSS}MB · kill -INT $HOG_PID" "Free mem ${FREE_PCT}%. Click to open full status." "$STATUS_FILE"
        echo "$(date) NOTIFY: yolo-guard: $HOG_NAME at ${HOG_RSS}MB (PID $HOG_PID) — Free mem ${FREE_PCT}%. To restart: kill -INT $HOG_PID. Details: $STATUS_FILE" >> "$LOG"
        # Dump a human-readable status report the user can find.
        {
          echo "yolo-guard memory pressure report"
          echo "Generated: $(date)"
          echo ""
          echo "System free memory: ${FREE_PCT}%  (threshold: <${MEM_FREE_PCT_THRESHOLD}%)"
          echo "Top AI memory hog:  $HOG_NAME"
          echo "  PID:    $HOG_PID"
          echo "  RSS:    ${HOG_RSS} MB  (threshold: >=${MEM_PROC_RSS_MB_THRESHOLD} MB)"
          echo ""
          echo "Recommended actions (your choice — the kit will not auto-kill GUI apps):"
          echo "  1. Soft restart the agent:  kill -INT $HOG_PID"
          echo "  2. Hard kill if unresponsive: kill -9 $HOG_PID  (loses unsaved work in that process)"
          echo "  3. Inspect what it's doing:  ps -o pid,pcpu,etime,command -p $HOG_PID"
          echo "  4. Full kit health check:   yolo-health"
          echo ""
          echo "Related (token-layer governance, by the same author):"
          echo "  If this agent keeps retrying the same broken approach, you're also paying"
          echo "  for those retries. ThumbGate captures one thumbs-down → blocks that exact"
          echo "  mistake on every future call. PreToolUse gates, not budget limits."
          echo "  👉 https://thumbgate.ai/?utm_source=mac-yolo-safeguards&utm_medium=status-file"
          echo ""
          echo "All other AI processes >200 MB right now:"
          /bin/ps -axo pid,rss,command -m | /usr/bin/awk '
            NR>1 {
              rss_mb = $2/1024
              if (rss_mb >= 200) {
                name = $3
                sub(".*/", "", name)
                if (tolower(name) ~ /agy|claude|cursor|antigravity|codex/) {
                  printf "  PID %-6s %5.0f MB  %s\n", $1, rss_mb, name
                }
              }
            }'
          echo ""
          echo "Hard rule (not changeable): this guard never auto-kills GUI apps."
          echo "  Source: $REPO/sim-runaway-guard.sh"
          echo "  Memory: $HOME/.claude/projects/..."
        } > "$STATUS_FILE"
        echo "$now" > "$MEM_LAST_FILE"
        echo "$(date) MEM_NOTIFY: free=${FREE_PCT}% hog=$HOG_NAME(PID $HOG_PID) ${HOG_RSS}MB status=$STATUS_FILE" >> "$LOG"
      fi
    fi
  fi
  exit 0
fi

# --- Fire: shut down sims ---
echo "$(date) RUNAWAY: $REASON — shutting down simulators" >> "$LOG"
/usr/bin/xcrun simctl shutdown all >> "$LOG" 2>&1
/usr/bin/killall -9 Simulator >> "$LOG" 2>&1
echo "$(date) shutdown complete" >> "$LOG"

echo "$now $REASON" >> "$FIRES_LOG"

# --- Escalation: count fires within window, quit suspect apps if N+ ---
cutoff=$((now - ESCALATE_WINDOW_SEC))
recent_fires=$(/usr/bin/awk -v c=$cutoff '$1 >= c' "$FIRES_LOG" 2>/dev/null | /usr/bin/wc -l | /usr/bin/tr -d ' ')

# Trim old entries to bound file size.
/usr/bin/awk -v c=$cutoff '$1 >= c' "$FIRES_LOG" > "${FIRES_LOG}.tmp" 2>/dev/null && /bin/mv "${FIRES_LOG}.tmp" "$FIRES_LOG"

if [ "$recent_fires" -ge "$ESCALATE_AFTER_FIRES" ]; then
  echo "$(date) ESCALATE: $recent_fires fires in last ${ESCALATE_WINDOW_SEC}s" >> "$LOG"
  if [ -n "$SUSPECT_APPS" ]; then
    # Opt-in only via YOLO_SUSPECT_APPS env var. Default is empty (no auto-quit).
    quit_any=0
    for app in $(echo "$SUSPECT_APPS" | /usr/bin/tr '|' '\n'); do
      if /usr/bin/pgrep -fl "$app" >/dev/null 2>&1; then
        echo "$(date) ESCALATE: quitting '$app' (opt-in via YOLO_SUSPECT_APPS)" >> "$LOG"
        /usr/bin/osascript -e "tell application \"$app\" to quit" 2>/dev/null
        /bin/sleep 5
        /usr/bin/pkill -9 -f "$app" 2>/dev/null
        quit_any=1
      fi
    done
    if [ "$quit_any" = "1" ]; then
      notify "yolo-guard escalated" "Quit opt-in app(s) after $recent_fires runaways in 10 min"
      : > "$FIRES_LOG"
    else
      # Loud alert dialog instead of a quiet notification.
      /usr/bin/osascript -e "display alert \"yolo-guard: persistent runaway\" message \"$recent_fires sim runaways in 10 min. Check which app keeps booting simulators.\" as critical" 2>/dev/null &
    fi
  else
    # Default: loud alert dialog so user knows to act manually. No app gets killed.
    /usr/bin/osascript -e "display alert \"yolo-guard: persistent runaway\" message \"$recent_fires sim runaways in 10 min. Check which app keeps booting simulators (likely Antigravity IDE, Xcode, or Cursor). The guard will not auto-quit GUI apps.\" as critical" 2>/dev/null &
    echo "$(date) ESCALATE: notified user (no auto-kill — user policy)" >> "$LOG"
  fi
else
  notify "yolo-guard fired" "$REASON"
fi

exit 0
