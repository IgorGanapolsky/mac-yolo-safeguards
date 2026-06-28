#!/bin/sh
# Add Homebrew to PATH (needed when running under launchd)
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# Smart simulator runaway guard — runs every 60s via LaunchAgent.
#
# Behavior:
#   1. Kills runaway sims if >50 simruntime procs exist, or if lower-count
#      simulator pressure crosses the configured load/memory thresholds.
#   2. CPU-runaway guard for NON-simulator processes: any user-owned process
#      pegged above the CPU threshold is reported. Known-safe background
#      helpers (the Antigravity securecoder semgrep scanner, orphaned crash
#      handlers) are auto-killed once they stay hot for N consecutive checks;
#      editors and any unknown process are notify-only (never auto-killed).
#   3. Memory-pressure guard triggers on REAL thrash (swap near-max + active
#      pageouts), not memory_pressure's misleading "free percentage". Under
#      pressure it auto-reclaims stale orphaned automation Chrome (/tmp CDP
#      profiles, no user data), unloads runaway Ollama model workers,
#      AND quits redundant secondary browsers (Chrome Canary/Beta/Dev, Chromium)
#      to protect RAM headroom for the Hermes agent fleet, then notifies about
#      remaining AI memory hogs. Hermes gateway processes are never targeted.
#   4. Posts a macOS notification on every fire so the user knows; if
#      YOLO_WEBHOOK_URL (or ~/.config/yolo-guard/webhook) is set, also pushes
#      the alert off-box (ntfy-compatible) — a thrashing Mac can't render its
#      own banners.
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
  # Off-box delivery (ntfy-compatible webhook): a thrashing Mac can't render
  # its own notification banners — push the alert to the user's phone instead.
  # Set YOLO_WEBHOOK_URL (or drop the URL in ~/.config/yolo-guard/webhook),
  # e.g. https://ntfy.sh/<your-private-topic>. Best-effort, never blocks.
  local HOOK="${YOLO_WEBHOOK_URL:-}"
  if [ -z "$HOOK" ] && [ -f "$HOME/.config/yolo-guard/webhook" ]; then
    HOOK=$(/bin/cat "$HOME/.config/yolo-guard/webhook" 2>/dev/null | /usr/bin/head -1)
  fi
  if [ -n "$HOOK" ]; then
    /usr/bin/curl -s -m 5 -H "Title: $TITLE" -d "$MSG" "$HOOK" >/dev/null 2>&1 &
  fi
  local TN
  TN=$(command -v terminal-notifier 2>/dev/null || /usr/bin/which terminal-notifier 2>/dev/null || true)
  if [ -z "$TN" ] || [ ! -x "$TN" ]; then
    if [ -x /opt/homebrew/bin/terminal-notifier ]; then
      TN=/opt/homebrew/bin/terminal-notifier
    elif [ -x /usr/local/bin/terminal-notifier ]; then
      TN=/usr/local/bin/terminal-notifier
    fi
  fi
  if [ -n "$TN" ] && [ -x "$TN" ]; then
    if [ -n "$OPEN_FILE" ]; then
      "$TN" -title "$TITLE" -message "$MSG" -execute "/usr/bin/open -a TextEdit $OPEN_FILE" -ignoreDnD >/dev/null 2>&1 || true
    else
      "$TN" -title "$TITLE" -message "$MSG" -ignoreDnD >/dev/null 2>&1 || true
    fi
  else
    # Fallback: osascript. Cram the actionable bit into the title since macOS
    # often shows ONLY the title for unregistered shell-script senders. Do not
    # rely on clicks here; osascript notifications open Script Editor.
    [ -n "$OPEN_FILE" ] && MSG="$MSG Details: $OPEN_FILE"
    /usr/bin/osascript -e "display notification \"$MSG\" with title \"$TITLE\"" 2>/dev/null || true
  fi
  echo "$(date) NOTIFY: $TITLE — $MSG" >> "$LOG"
}

# --- Auto-configure adb reverse port forwarding for Hermes Mobile ---
if command -v adb >/dev/null 2>&1; then
  adb devices 2>/dev/null | grep -v "List" | grep "device" | awk '{print $1}' | while read -r serial; do
    if [ -n "$serial" ]; then
      if ! adb -s "$serial" reverse --list 2>/dev/null | grep -q "tcp:8642"; then
        if adb -s "$serial" reverse tcp:8642 tcp:8642 >/dev/null 2>&1; then
          echo "$(date) AUTO-PORT-FORWARD: reversed tcp:8642 tcp:8642 for device $serial" >> "$LOG"
          notify "yolo-guard: USB forwarding active" "Automatically forwarded port 8642 via adb reverse to your mobile device ($serial)."
        fi
      fi
      if ! adb -s "$serial" reverse --list 2>/dev/null | grep -q "tcp:8765"; then
        if adb -s "$serial" reverse tcp:8765 tcp:8765 >/dev/null 2>&1; then
          echo "$(date) AUTO-PORT-FORWARD: reversed tcp:8765 tcp:8765 for device $serial" >> "$LOG"
        fi
      fi
    fi
  done
fi

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

SIM_PROC_HARD_LIMIT=${YOLO_SIM_PROC_HARD_LIMIT:-350}
SIM_LOAD_THRESHOLD=${YOLO_SIM_LOAD_THRESHOLD:-150}
BOOTED_SIM_LOAD_THRESHOLD=${YOLO_BOOTED_SIM_LOAD_THRESHOLD:-40}
BOOTED_SIM_CPU_THRESHOLD=${YOLO_BOOTED_SIM_CPU_THRESHOLD:-95}
BOOTED_SIM_SUSTAINED_FIRES=${YOLO_BOOTED_SIM_SUSTAINED_FIRES:-5}
BOOTED_SIM_STATE_FILE=${YOLO_BOOTED_SIM_STATE_FILE:-/tmp/yolo-booted-sim-state}

REASON=""
if [ "$SIM_COUNT" -gt "$SIM_PROC_HARD_LIMIT" ]; then
  REASON="simruntime process ceiling exceeded (sim_procs=$SIM_COUNT limit=$SIM_PROC_HARD_LIMIT)"
elif [ "$SIM_COUNT" -gt 0 ]; then
  if [ "$LOAD_INT" -gt "$SIM_LOAD_THRESHOLD" ]; then
    REASON="CPU runaway (load=$LOAD threshold=$SIM_LOAD_THRESHOLD sim_procs=$SIM_COUNT)"
  elif [ "$SIM_MEM" -gt 50 ]; then
    REASON="memory hog (sim_mem=${SIM_MEM}% sim_procs=$SIM_COUNT)"
  fi
fi

if [ -z "$REASON" ]; then
  # A single booted simulator app can still wedge a Mac mini even when the old
  # simruntime process-count heuristic never fires. Gate this on a booted
  # simulator, host load, simulator-app CPU, and consecutive checks.
  BOOTED_SIM_COUNT=$(/usr/bin/xcrun simctl list devices booted 2>/dev/null | /usr/bin/grep -c Booted | /usr/bin/tr -d ' ')
  [ -z "$BOOTED_SIM_COUNT" ] && BOOTED_SIM_COUNT=0
  SIM_APP_HOT_LINE=$(/bin/ps -axo pid,pcpu,command | /usr/bin/awk -v t="$BOOTED_SIM_CPU_THRESHOLD" '
    NR>1 {
      pid=$1; pcpu=$2+0
      if (pcpu >= t && $0 ~ /CoreSimulator|Simulator\.app|\.simruntime|HermesMobile\.app/) {
        printf "%s %.0f %s\n", pid, pcpu, substr($0, index($0,$3))
        exit
      }
    }')
  if [ "$BOOTED_SIM_COUNT" -gt 0 ] && [ "$LOAD_INT" -ge "$BOOTED_SIM_LOAD_THRESHOLD" ] && [ -n "$SIM_APP_HOT_LINE" ]; then
    BOOTED_SIM_STREAK=$(/bin/cat "$BOOTED_SIM_STATE_FILE" 2>/dev/null || echo 0)
    case "$BOOTED_SIM_STREAK" in (*[!0-9]*|'') BOOTED_SIM_STREAK=0 ;; esac
    BOOTED_SIM_STREAK=$((BOOTED_SIM_STREAK + 1))
    echo "$BOOTED_SIM_STREAK" > "$BOOTED_SIM_STATE_FILE"
    if [ "$BOOTED_SIM_STREAK" -ge "$BOOTED_SIM_SUSTAINED_FIRES" ]; then
      HOT_PID=$(echo "$SIM_APP_HOT_LINE" | /usr/bin/awk '{print $1}')
      HOT_CPU=$(echo "$SIM_APP_HOT_LINE" | /usr/bin/awk '{print $2}')
      REASON="booted simulator CPU runaway (load=$LOAD threshold=$BOOTED_SIM_LOAD_THRESHOLD booted=$BOOTED_SIM_COUNT pid=$HOT_PID cpu=${HOT_CPU}% threshold=$BOOTED_SIM_CPU_THRESHOLD% streak=$BOOTED_SIM_STREAK)"
    fi
  else
    echo 0 > "$BOOTED_SIM_STATE_FILE"
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
  # Notify-ignore list: macOS maintenance daemons (Spotlight, photo/media
  # analysis) routinely burn CPU and finish on their own — the runbook says
  # never to kill them, and notifying about them is pure alert fatigue (the
  # guard cried wolf about mediaanalysisd hourly for two days, burying the one
  # Cursor-runaway notification that mattered). Never killed, never notified.
  CPU_NOTIFY_IGNORE_PATTERNS=${YOLO_CPU_NOTIFY_IGNORE_PATTERNS:-mediaanalysisd|photoanalysisd|photolibraryd|mds_stores|mdworker.*|mdbulkimport|corespotlightd|spotlightknowledged|fseventsd|backupd|bird|cloudd}
  CPU_STATE_FILE=${YOLO_CPU_STATE_FILE:-/tmp/yolo-cpu-state}
  CPU_LAST_FILE=${YOLO_CPU_LAST_FILE:-/tmp/yolo-cpu-last}
  CPU_STATUS_FILE=${YOLO_CPU_STATUS_FILE:-/tmp/yolo-cpu-status.txt}

  # CodeQL-under-java can respawn under Cursor + Antigravity as two separate
  # ~100% CPU language-server workers. Each stays below the generic 150% single
  # process threshold, but together they burn enough CPU to make Screen Sharing
  # feel frozen. Kill the stateless workers when the aggregate signature is hot;
  # if that repeats, disable the local extension folders by reversible rename.
  CODEQL_CPU_PCT_THRESHOLD=${YOLO_CODEQL_CPU_PCT_THRESHOLD:-50}
  CODEQL_CPU_TOTAL_THRESHOLD=${YOLO_CODEQL_CPU_TOTAL_THRESHOLD:-150}
  CODEQL_MIN_PROCS=${YOLO_CODEQL_MIN_PROCS:-2}
  CODEQL_SUSTAINED_FIRES=${YOLO_CODEQL_SUSTAINED_FIRES:-1}
  CODEQL_DISABLE_AFTER_FIRES=${YOLO_CODEQL_DISABLE_AFTER_FIRES:-2}
  CODEQL_STATE_FILE=${YOLO_CODEQL_STATE_FILE:-/tmp/yolo-codeql-state}
  CODEQL_EXT_DIRS=${YOLO_CODEQL_EXTENSION_DIRS:-"$HOME/.cursor/extensions/github.vscode-codeql-1.17.7-universal $HOME/.antigravity-ide/extensions/github.vscode-codeql-1.17.7-universal"}
  CODEQL_HOT_LIST=$(/bin/ps -axo user,pid,pcpu,command -r | /usr/bin/awk -v u="$USER" -v t="$CODEQL_CPU_PCT_THRESHOLD" '
    NR>1 && $1==u && $0 ~ /com\.semmle\.cli2\.CodeQL/ {
      pcpu=$3+0
      if (pcpu>=t) printf "%s %d\n", $2, pcpu
    }')
  CODEQL_COUNT=$(printf '%s\n' "$CODEQL_HOT_LIST" | /usr/bin/awk 'NF>=2 {n++} END{print n+0}')
  CODEQL_TOTAL_CPU=$(printf '%s\n' "$CODEQL_HOT_LIST" | /usr/bin/awk 'NF>=2 {s+=$2} END{print s+0}')
  if [ "$CODEQL_COUNT" -ge "$CODEQL_MIN_PROCS" ] && [ "$CODEQL_TOTAL_CPU" -ge "$CODEQL_CPU_TOTAL_THRESHOLD" ]; then
    CODEQL_STREAK=$(/bin/cat "$CODEQL_STATE_FILE" 2>/dev/null || echo 0)
    case "$CODEQL_STREAK" in (*[!0-9]*|'') CODEQL_STREAK=0 ;; esac
    CODEQL_STREAK=$((CODEQL_STREAK + 1))
    echo "$CODEQL_STREAK" > "$CODEQL_STATE_FILE"
    if [ "$CODEQL_STREAK" -ge "$CODEQL_SUSTAINED_FIRES" ]; then
      printf '%s\n' "$CODEQL_HOT_LIST" | while read -r cpid ccpu; do
        [ -z "$cpid" ] && continue
        /bin/kill -9 "$cpid" 2>/dev/null || true
        echo "$(date) CODEQL_KILL: PID $cpid at ${ccpu}% CPU aggregate=${CODEQL_TOTAL_CPU}% count=$CODEQL_COUNT streak=$CODEQL_STREAK" >> "$LOG"
      done
      notify "yolo-guard: killed CodeQL workers" "Killed $CODEQL_COUNT CodeQL workers at aggregate ${CODEQL_TOTAL_CPU}% CPU (streak=$CODEQL_STREAK)."
      if [ "$CODEQL_STREAK" -ge "$CODEQL_DISABLE_AFTER_FIRES" ]; then
        for extdir in $CODEQL_EXT_DIRS; do
          if [ -d "$extdir" ]; then
            disabled="$extdir.disabled-$(date +%Y%m%d)"
            if [ ! -e "$disabled" ]; then
              /bin/mv "$extdir" "$disabled" 2>/dev/null || true
              echo "$(date) CODEQL_DISABLE: moved $extdir -> $disabled after $CODEQL_STREAK hot checks" >> "$LOG"
            fi
          fi
        done
      fi
    fi
  else
    echo 0 > "$CODEQL_STATE_FILE"
  fi

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
      # Benign macOS maintenance daemon — neither killable nor worth a notify.
      if echo "$base" | /usr/bin/grep -qiE "^($CPU_NOTIFY_IGNORE_PATTERNS)$"; then
        continue
      fi
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
      # osascript fallback is not click-actionable, so the path is in the body.
      notify "yolo-guard: inspect $CPU_NOTIFY_NAME ${CPU_NOTIFY_PCPU}% CPU" "Sustained CPU runaway (PID $CPU_NOTIFY_PID). Details: $CPU_STATUS_FILE" "$CPU_STATUS_FILE"
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

  # memory_pressure's "free percentage" counts purgeable/file cache as free, so
  # it reported 65% free while the machine sat at 372MB unused with swap 90%
  # full (2026-06-11 Cursor parallel-agents freeze — this branch never fired
  # once). The signal that actually predicts a UI freeze is swap near-max PLUS
  # active pageouts (= the compressor is thrashing right now). Gate on either.
  SWAP_PCT_THRESHOLD=${YOLO_SWAP_PCT_THRESHOLD:-80}
  SWAP_LOW_FREE_PCT_THRESHOLD=${YOLO_SWAP_LOW_FREE_PCT_THRESHOLD:-25}
  PAGEOUT_DELTA_THRESHOLD=${YOLO_PAGEOUT_DELTA_THRESHOLD:-1000}   # ~16MB paged out since last check
  PAGEOUT_STATE_FILE=${YOLO_PAGEOUT_STATE_FILE:-/tmp/yolo-pageouts-last}

  SWAP_PCT=$(/usr/sbin/sysctl -n vm.swapusage 2>/dev/null | /usr/bin/awk '
    { for (i=1;i<=NF;i++) { if ($i=="total") tot=$(i+2)+0; if ($i=="used") used=$(i+2)+0 }
      if (tot>0) printf "%d", used*100/tot; else print 0 }')
  [ -z "$SWAP_PCT" ] && SWAP_PCT=0

  PAGEOUTS=$(/usr/bin/vm_stat 2>/dev/null | /usr/bin/awk '/Pageouts/ {gsub("\\.",""); print $2; exit}')
  [ -z "$PAGEOUTS" ] && PAGEOUTS=0
  PREV_PAGEOUTS=$(/bin/cat "$PAGEOUT_STATE_FILE" 2>/dev/null || echo "$PAGEOUTS")
  case "$PREV_PAGEOUTS" in (*[!0-9]*|'') PREV_PAGEOUTS=$PAGEOUTS ;; esac
  PAGEOUT_DELTA=$((PAGEOUTS - PREV_PAGEOUTS))
  [ "$PAGEOUT_DELTA" -lt 0 ] && PAGEOUT_DELTA=0   # counter reset after reboot
  echo "$PAGEOUTS" > "$PAGEOUT_STATE_FILE"

  MEM_PRESSURE=""
  if [ "$FREE_PCT" -lt "$MEM_FREE_PCT_THRESHOLD" ]; then
    MEM_PRESSURE="free=${FREE_PCT}%"
  elif [ "$SWAP_PCT" -ge "$SWAP_PCT_THRESHOLD" ] && [ "$PAGEOUT_DELTA" -ge "$PAGEOUT_DELTA_THRESHOLD" ]; then
    MEM_PRESSURE="swap=${SWAP_PCT}% pageouts+${PAGEOUT_DELTA}/check (thrash)"
  elif [ "$SWAP_PCT" -ge "$SWAP_PCT_THRESHOLD" ] && [ "$FREE_PCT" -lt "$SWAP_LOW_FREE_PCT_THRESHOLD" ]; then
    MEM_PRESSURE="swap=${SWAP_PCT}% free=${FREE_PCT}%"
  fi

  if [ -n "$MEM_PRESSURE" ]; then
    # --- Auto-reclaim: runaway local LLM workers (known-safe kill) ---
    # Ollama's model workers hold model weights and context cache; they
    # do not hold unsaved user work. The 2026-06-15 Mac mini freeze was a
    # deepseek-r1 14b worker at 65,536 context using ~68% RAM. Under real memory
    # pressure, reclaiming that child process is safer than leaving the GUI
    # swapped out. We deliberately do NOT kill Ollama.app / `ollama serve`, so
    # later model calls can restart cleanly.
    if [ "${YOLO_RECLAIM_OLLAMA:-1}" = "1" ]; then
      OLLAMA_RSS_MB_THRESHOLD=${YOLO_OLLAMA_RSS_MB_THRESHOLD:-10000}
      OLLAMA_HOG_LINES=$(/bin/ps -axo pid,rss,command -m | /usr/bin/awk -v t="$OLLAMA_RSS_MB_THRESHOLD" '
        NR>1 {
          pid = $1
          rss_mb = $2/1024
          if (rss_mb >= t && $0 ~ /(llama-server|ollama runner)/) {
            printf "%s %.0f %s\n", pid, rss_mb, substr($0, index($0,$3))
          }
        }')
      echo "$OLLAMA_HOG_LINES" | while read -r opid orss ocmd; do
        [ -z "$opid" ] && continue
        /bin/kill -TERM "$opid" 2>/dev/null || true
        /bin/sleep 3
        if /bin/ps -p "$opid" >/dev/null 2>&1; then
          /bin/kill -KILL "$opid" 2>/dev/null || true
        fi
        notify "yolo-guard: reclaimed Ollama worker" "Killed Ollama worker PID $opid (${orss}MB) under memory pressure ($MEM_PRESSURE). Ollama service left running."
        echo "$(date) OLLAMA_RECLAIM: killed Ollama worker PID $opid ${orss}MB pressure=$MEM_PRESSURE cmd=$ocmd" >> "$LOG"
      done
    fi

    # --- Auto-reclaim: orphaned headless Android emulators (known-safe kill) ---
    # Maestro / agent-device E2E runs leave headless qemu Android emulators
    # (qemu-system-*-headless -no-window @<AVD>) alive for HOURS after the test
    # process exits. Each holds a multi-GB guest VM but no unsaved user work,
    # and they were the 2026-06-25 culprit: a 22h-orphaned Maestro emulator
    # starved RAM until Ollama could no longer load the 64k model, so the Hermes
    # agent silently stopped replying to mobile chats. Reclaim ONLY when ALL hold:
    #   (a) headless (-no-window) — an interactive emulator with a window is spared;
    #   (b) older than YOLO_EMULATOR_MAX_AGE_SEC (default 2h) — a live test's
    #       freshly-booted emulator is never touched;
    #   (c) no running maestro/agent-device process references that AVD — so an
    #       in-progress E2E run is never disrupted (multi-agent-safe).
    if [ "${YOLO_RECLAIM_ORPHAN_EMULATOR:-1}" = "1" ]; then
      EMU_MAX_AGE_SEC=${YOLO_EMULATOR_MAX_AGE_SEC:-7200}
      EMU_LINES=$(/bin/ps -axo pid,etime,command | /usr/bin/awk -v t="$EMU_MAX_AGE_SEC" '
        function etsec(e,  d,a,p,n){ d=0; if(index(e,"-")>0){split(e,a,"-");d=a[1];e=a[2]}
          n=split(e,p,":"); if(n==3)return d*86400+p[1]*3600+p[2]*60+p[3];
          else if(n==2)return d*86400+p[1]*60+p[2]; else return d*86400+p[1] }
        /qemu-system-[a-z0-9_]*/ && /-no-window/ && !/awk/ {
          pid=$1; age=etsec($2); avd="";
          for(i=1;i<=NF;i++) if($i ~ /^@/){avd=$i;break}
          if (age >= t) printf "%s %s %s\n", pid, age, avd
        }')
      LIVE_TESTS=$(/bin/ps -axo command | /usr/bin/grep -E 'agent-device|maestro' | /usr/bin/grep -v grep 2>/dev/null)
      echo "$EMU_LINES" | while read -r epid eage eavd; do
        [ -z "$epid" ] && continue
        if [ -n "$eavd" ] && printf '%s' "$LIVE_TESTS" | /usr/bin/grep -qF "$eavd"; then
          echo "$(date) EMULATOR_RECLAIM: SKIP pid=$epid avd=$eavd (live test owns it)" >> "$LOG"
          continue
        fi
        /bin/kill -TERM "$epid" 2>/dev/null || true
        /bin/sleep 3
        if /bin/ps -p "$epid" >/dev/null 2>&1; then /bin/kill -KILL "$epid" 2>/dev/null || true; fi
        notify "yolo-guard: reclaimed orphaned emulator" "Killed headless Android emulator PID $epid (${eage}s old, ${eavd:-no-avd}) under memory pressure ($MEM_PRESSURE). No active test referenced it."
        echo "$(date) EMULATOR_RECLAIM: killed PID $epid age=${eage}s avd=$eavd pressure=$MEM_PRESSURE" >> "$LOG"
      done
    fi

    # --- Auto-reclaim: stale browser-automation Chrome (known-safe kill) ---
    # Agent sessions (claude-in-chrome / CDP automation) leave orphaned Chrome
    # instances on throwaway /tmp profiles (--user-data-dir=/tmp/chrome_cdp_
    # profile_*). Their launcher is gone (main proc reparented to launchd,
    # ppid==1) and the profile holds no user data, so under real memory
    # pressure killing them is free relief — reclaimed ~12GB on 2026-06-04.
    # This is the one exception to notify-only: it is NOT a GUI app the user
    # is working in, by construction.
    if [ "${YOLO_RECLAIM_STALE_CDP:-1}" = "1" ]; then
      STALE_CDP=$(/bin/ps -axo pid,ppid,command | /usr/bin/awk '
        /\/tmp\/chrome_cdp_profile_[0-9]+/ && !/awk/ {
          if (match($0, /chrome_cdp_profile_[0-9]+/)) {
            prof = substr($0, RSTART, RLENGTH)
            if ($2 == 1) orphan[prof] = 1
          }
        }
        END { for (p in orphan) print p }')
      for prof in $STALE_CDP; do
        /usr/bin/pkill -9 -f "$prof" 2>/dev/null
        notify "yolo-guard: reclaimed stale automation Chrome" "Killed orphaned $prof under memory pressure ($MEM_PRESSURE). Throwaway profile — no user data."
        echo "$(date) CDP_RECLAIM: pkill -9 -f $prof pressure=$MEM_PRESSURE" >> "$LOG"
      done
    fi
    # --- Auto-reclaim: redundant SECONDARY browsers (known-safe kill) ---
    # This box runs an autonomous Hermes agent fleet, so nobody is watching the
    # "close tabs" banner — the notify-only path can't break a real thrash here.
    # Secondary browsers (Chrome Canary/Beta/Dev, Chromium, Edge/Brave channels)
    # are by construction NOT the user's primary browser: they restore their tabs
    # on relaunch and hold no irreplaceable state, so under genuine thrash quitting
    # them is free relief that protects RAM headroom for Hermes. The user's PRIMARY
    # "Google Chrome" and every IDE are never touched here (those stay notify-only,
    # per the never-auto-kill-GUI-apps rule). Opt out: YOLO_RECLAIM_SECONDARY_BROWSERS=0.
    if [ "${YOLO_RECLAIM_SECONDARY_BROWSERS:-1}" = "1" ]; then
      SECONDARY_BROWSERS=${YOLO_SECONDARY_BROWSERS:-"Google Chrome Canary|Google Chrome Beta|Google Chrome Dev|Chromium|Brave Browser Beta|Brave Browser Nightly|Microsoft Edge Beta|Microsoft Edge Dev|Microsoft Edge Canary"}
      echo "$SECONDARY_BROWSERS" | /usr/bin/tr '|' '\n' | while IFS= read -r app; do
        [ -z "$app" ] && continue
        # Match the main app binary so a helper alone can't trigger, and so the
        # primary "Google Chrome" never matches "Google Chrome Canary" etc.
        if /bin/ps -axo command | /usr/bin/grep -vF grep | /usr/bin/grep -qF "$app.app/Contents/MacOS/$app"; then
          RECLAIMED_MB=$(/bin/ps -axo rss,command | /usr/bin/grep -F "$app.app/" | /usr/bin/grep -vF grep | /usr/bin/awk '{s+=$1} END{printf "%d", s/1024}')
          /usr/bin/osascript -e "quit app \"$app\"" >/dev/null 2>&1
          /usr/bin/pkill -9 -f "$app.app/Contents/MacOS/" 2>/dev/null
          notify "yolo-guard: reclaimed $app" "Quit redundant secondary browser (~${RECLAIMED_MB}MB) under memory pressure ($MEM_PRESSURE) to protect Hermes headroom. Tabs restore on relaunch."
          echo "$(date) BROWSER_RECLAIM: $app ~${RECLAIMED_MB}MB pressure=$MEM_PRESSURE" >> "$LOG"
        fi
      done
    fi
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
        # dropped), status path in the body. notify() prefers terminal-notifier
        # and falls back to non-click-actionable osascript.
        notify "yolo-guard: $HOG_NAME ${HOG_RSS}MB · kill -INT $HOG_PID" "Memory pressure ($MEM_PRESSURE). Details: $STATUS_FILE" "$STATUS_FILE"
        echo "$(date) NOTIFY: yolo-guard: $HOG_NAME at ${HOG_RSS}MB (PID $HOG_PID) — Free mem ${FREE_PCT}%. To restart: kill -INT $HOG_PID. Details: $STATUS_FILE" >> "$LOG"
        # Dump a human-readable status report the user can find.
        {
          echo "yolo-guard memory pressure report"
          echo "Generated: $(date)"
          echo ""
          echo "Memory pressure:    $MEM_PRESSURE"
          echo "  (free=${FREE_PCT}% swap=${SWAP_PCT}% pageouts+${PAGEOUT_DELTA} this check)"
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
          echo "  Team hardening path: https://github.com/IgorGanapolsky/mac-yolo-safeguards/blob/main/AI-AGENT-HARDENING.md"
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

    # --- Aggregate per-app memory rollup (notify only) ---
    # The single-process check above misses apps that spread memory across many
    # small procs: e.g. Chrome/Chrome Canary at 4GB across 37 renderers, none
    # individually over MEM_PROC_RSS_MB_THRESHOLD. Sum RSS by .app bundle and
    # flag the worst aggregate hog. Notify-only (browsers/IDEs hold live tabs +
    # unsaved work — never auto-killed). Debounced separately from the per-proc
    # notify. Added 2026-06-09 after a 4GB/37-proc Chrome Canary pile was the
    # top memory consumer yet stayed invisible to the per-process check.
    MEM_APP_AGG_MB_THRESHOLD=${YOLO_MEM_APP_AGG_MB_THRESHOLD:-3000}
    MEM_APP_LAST_FILE=${YOLO_MEM_APP_LAST_FILE:-/tmp/yolo-mem-app-last}
    APP_AGG_STATUS_FILE=${YOLO_MEM_APP_STATUS_FILE:-/tmp/yolo-mem-app-status.txt}
    APP_AGG_LINE=$(/bin/ps -axo rss,command | /usr/bin/awk -v t="$MEM_APP_AGG_MB_THRESHOLD" '
      NR>1 {
        app=""
        if ($0 ~ /Google Chrome Canary\.app/) app="Chrome Canary"
        else if ($0 ~ /Google Chrome\.app/) app="Chrome"
        else if ($0 ~ /Cursor\.app/) app="Cursor"
        else if ($0 ~ /Comet\.app/) app="Comet"
        else if ($0 ~ /Antigravity/) app="Antigravity"
        else if ($0 ~ /Visual Studio Code|[Cc]ode Helper/) app="VSCode"
        else next
        mb[app]+=$1/1024; n[app]++
      }
      END{ best=""; bestmb=0; for(a in mb) if(mb[a]>bestmb){bestmb=mb[a];best=a}
           if(best!="" && bestmb>=t) printf "%s|%.0f|%d", best, bestmb, n[best] }')
    APP_AGG_ROLLUP=$(/bin/ps -axo rss,command | /usr/bin/awk '
      NR>1 {
        app=""
        if ($0 ~ /Google Chrome Canary\.app/) app="Chrome Canary"
        else if ($0 ~ /Google Chrome\.app/) app="Chrome"
        else if ($0 ~ /Cursor\.app/) app="Cursor"
        else if ($0 ~ /Comet\.app/) app="Comet"
        else if ($0 ~ /Antigravity/) app="Antigravity"
        else if ($0 ~ /Visual Studio Code|[Cc]ode Helper/) app="VSCode"
        else next
        mb[app]+=$1/1024; n[app]++
      }
      END{ for(a in mb) printf "  App:   %s | RSS: %.0f MB | Processes: %d\n", a, mb[a], n[a] }')
    if [ -n "$APP_AGG_LINE" ]; then
      AGG_APP=$(echo "$APP_AGG_LINE" | /usr/bin/cut -d'|' -f1)
      AGG_MB=$(echo "$APP_AGG_LINE" | /usr/bin/cut -d'|' -f2)
      AGG_N=$(echo "$APP_AGG_LINE" | /usr/bin/cut -d'|' -f3)
      AGG_LAST=0
      [ -f "$MEM_APP_LAST_FILE" ] && AGG_LAST=$(/bin/cat "$MEM_APP_LAST_FILE" 2>/dev/null || echo 0)
      if [ $((now - AGG_LAST)) -ge "$MEM_NOTIFY_DEBOUNCE_SEC" ]; then
        {
          echo "yolo-guard aggregate memory report"
          echo "Generated: $(date)"
          echo ""
          echo "Memory pressure:    $MEM_PRESSURE"
          echo "  (free=${FREE_PCT}% swap=${SWAP_PCT}% pageouts+${PAGEOUT_DELTA} this check)"
          echo "Heaviest app (summed across all its processes):"
          echo "  App:   $AGG_APP"
          echo "  RSS:   ${AGG_MB} MB across ${AGG_N} processes  (threshold: >=${MEM_APP_AGG_MB_THRESHOLD} MB)"
          echo ""
          echo "Matched app rollup:"
          printf '%s\n' "$APP_AGG_ROLLUP"
          echo ""
          echo "This app spreads memory across many small processes, so no single"
          echo "one trips the per-process check — closing tabs/windows or quitting"
          echo "the app is the fix. The guard will NOT auto-kill it (live tabs / unsaved work)."
          echo ""
          echo "  Source: $REPO/sim-runaway-guard.sh"
        } > "$APP_AGG_STATUS_FILE"
        notify "yolo-guard: $AGG_APP ${AGG_MB}MB across ${AGG_N} procs" "Memory pressure ($MEM_PRESSURE). Close tabs/windows. Details: $APP_AGG_STATUS_FILE" "$APP_AGG_STATUS_FILE"
        echo "$now" > "$MEM_APP_LAST_FILE"
        echo "$(date) MEM_APP_NOTIFY: $AGG_APP ${AGG_MB}MB/${AGG_N}procs free=${FREE_PCT}%" >> "$LOG"
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
