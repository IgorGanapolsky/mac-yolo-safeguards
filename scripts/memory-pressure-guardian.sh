#!/bin/bash
# memory-pressure-guardian.sh — keep co-located AI agents from memory-thrashing
# a 24GB Apple Silicon Mac. v2, redesigned 2026-07-13 from a verified deep-research
# pass after the v1 guard said "No agents to kill" (agents=0) while a Cursor-spawned
# Gradle daemon + an 8GB Ollama model + several agent CLIs drove load to 109 and
# swap to 21.7/22.5GB.
#
# Design (each rule cites the verified finding behind it):
# - TRIGGER: sysctl kern.memorystatus_vm_pressure_level — the kernel's own signal
#   (1=NORMAL, 2=WARN, 4=CRITICAL; those three values only) with built-in
#   rising/falling hysteresis. Free-RAM% and swap presence are NOT triggers — on
#   Apple Silicon both look alarming during healthy use. Near-total swap
#   exhaustion (>=90% of a grown swapfile set) stays as a secondary critical
#   trigger because that is exactly what the real incident looked like.
# - DETECTION: match the FULL COMMAND LINE, not the process name — agent CLIs run
#   as generic "node"/"java"/"python" and name-based detection is how v1 missed
#   everything.
# - ELECTRON RULE: never signal Electron/Chromium helper processes. SIGSTOP is
#   invisible to the app (no render-process-gone fires; it just wedges the UI)
#   and SIGTERM/SIGKILL is observed as reason:"killed" letting the app respawn
#   the helper under a new PID (exactly what Cursor did). Act on LEAF workloads
#   instead: Gradle daemons and headless agent CLIs.
# - OLLAMA: a per-request keep_alive from any client OVERRIDES server env, so a
#   model can be silently pinned; trust /api/ps, not the config. Evict actively
#   at WARN through Ollama's HTTP API. Never kill the runner: doing so corrupts
#   an in-flight Hermes turn.
# - ACTION LADDER: WARN(2) -> evict Ollama models (cheap, reversible: reload on
#   next request). CRITICAL(4) -> also SIGTERM->SIGKILL the single
#   largest-RSS leaf agent workload. Never Electron helpers, never the IDE/UI.
#
# Install (per Mac): copy to ~/.local/bin/, LaunchAgent
# com.igor.memory-pressure-guardian.plist, StartInterval=60 + RunAtLoad.
# Pair with server-side Ollama env: OLLAMA_MAX_LOADED_MODELS=1,
# OLLAMA_NUM_PARALLEL=1, OLLAMA_KEEP_ALIVE=2m (required RAM scales as
# num_parallel * num_ctx; docs.ollama.com/faq).
set -u

LOG="${MEMORY_GUARD_LOG:-$HOME/Library/Logs/memory-pressure-guardian.log}"
NTFY_TOPIC="yolo-guard-fdh8ktuw1vtxb5sb"
STREAK_FILE="${MEMORY_GUARD_STREAK_FILE:-/tmp/memory-pressure-guardian.streak}"
WARN_COOLDOWN_FILE="${MEMORY_GUARD_WARN_FILE:-/tmp/memory-pressure-guardian.lastwarn}"
CRIT_COOLDOWN_FILE="${MEMORY_GUARD_CRIT_FILE:-/tmp/memory-pressure-guardian.lastcrit}"
RECOVERY_FILE="${YOLO_MEMORY_RECOVERY_FILE:-/tmp/yolo-memory-recovery-until}"
WARN_COOLDOWN="${MEMORY_GUARD_WARN_COOLDOWN:-600}"
CRIT_COOLDOWN="${MEMORY_GUARD_CRIT_COOLDOWN:-300}"
RECOVERY_COOLDOWN="${YOLO_MEMORY_RECOVERY_SEC:-600}"
STREAK_REQUIRED="${MEMORY_GUARD_STREAK_REQUIRED:-2}" # consecutive polls before acting
OLLAMA_API="${MEMORY_GUARD_OLLAMA_API:-http://127.0.0.1:11434}"
CURL_BIN="${MEMORY_GUARD_CURL_BIN:-curl}"
SYSCTL_BIN="${MEMORY_GUARD_SYSCTL_BIN:-sysctl}"
DATE_BIN="${MEMORY_GUARD_DATE_BIN:-date}"
SLEEP_BIN="${MEMORY_GUARD_SLEEP_BIN:-sleep}"
DRY_RUN="${1:-}"

# leaf agent workloads we may reap under REAL critical pressure — full-command-line
# match (v1 matched the process NAME; agent CLIs are generic node/java/python).
# NOTE (2026-07-14 fix): llama-server / ollama runner REMOVED — SIGKILLing the
# model mid-inference corrupts the run and breaks hermes-yolo. Ollama memory is
# reclaimed GRACEFULLY by the WARN action (`ollama stop`), never by SIGKILL.
AGENT_RE='GradleDaemon|org\.gradle|claude( |$)|codex|opencode|agy |hermes_cli|node .*(agent|mcp)'
# never signal these: Electron/Chromium helpers (respawn/wedge), UI apps, transports,
# and — critically — the fleet's own inference/gateway processes it depends on.
NEVER_RE='Helper|Renderer|\.app/Contents/(Frameworks|MacOS)|WindowServer|screensharing|sshd|Tailscale|tailscaled|Terminal|ghostty|Finder|Dock|llama-server|ollama|Ollama|litellm|gateway run|grep -E'

log() { echo "$("$DATE_BIN" '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }
notify() {
  [[ "$DRY_RUN" == "--dry-run" ]] && { log "DRY-RUN notify: $1"; return; }
  "$CURL_BIN" -s -m 10 -H "Title: memory-pressure-guardian ($(hostname -s))" -H "Priority: high" \
    -d "$1" "https://ntfy.sh/$NTFY_TOPIC" >/dev/null 2>&1
}

ollama_ps=$("$CURL_BIN" -sm 3 "$OLLAMA_API/api/ps" 2>/dev/null)

# --- pressure evaluation ---
pressure=$("$SYSCTL_BIN" -n kern.memorystatus_vm_pressure_level 2>/dev/null || echo 1)
read -r swap_total swap_used <<< "$("$SYSCTL_BIN" -n vm.swapusage | awk '{gsub("M",""); print $3, $6}')"
swap_pct=0
[[ -n "$swap_total" ]] && swap_pct=$(awk -v u="$swap_used" -v t="$swap_total" 'BEGIN{print (t>0)? int(u*100/t) : 0}')

crit=0; warn=0
# CRITICAL only on the KERNEL's own level-4 signal. 2026-07-14 fix: swap% alone
# was a false trigger — these 24GB boxes sit at ~95% swap under NORMAL kernel
# pressure (level 1), so `swap_pct >= 90` reaped processes constantly. Swap is
# kept only as a corroborating gate: it must accompany kernel WARN, never stand
# alone. Kernel level 4 = jetsam imminent = the only true "reap now".
(( pressure >= 4 )) && crit=1
(( pressure >= 2 )) && warn=1

if (( !warn && !crit )); then
  echo 0 > "$STREAK_FILE"
  exit 0
fi

streak=$(( $(cat "$STREAK_FILE" 2>/dev/null || echo 0) + 1 ))
echo "$streak" > "$STREAK_FILE"
log "pressure=$pressure swap=${swap_pct}% streak=$streak/$STREAK_REQUIRED"
(( streak < STREAK_REQUIRED )) && exit 0

now=$("$DATE_BIN" +%s)

# --- WARN action: evict resident Ollama models (reversible; reload on demand) ---
last=$(cat "$WARN_COOLDOWN_FILE" 2>/dev/null || echo 0)
if (( now - last > WARN_COOLDOWN )); then
  models=$(echo "$ollama_ps" | python3 -c "import sys,json; print(' '.join(m['name'] for m in json.load(sys.stdin).get('models',[])))" 2>/dev/null)
  if [[ -n "${models:-}" ]]; then
    if [[ "$DRY_RUN" == "--dry-run" ]]; then
      log "DRY-RUN: would evict ollama models: $models"
    else
      evicted=""; failed=""
      for m in $models; do
        code=$("$CURL_BIN" -s -m 30 -o /dev/null -w "%{http_code}" \
          -H "Content-Type: application/json" \
          -d "{\"model\":\"$m\",\"keep_alive\":0}" "$OLLAMA_API/api/generate" 2>/dev/null || echo 000)
        if [[ "$code" == "200" ]]; then evicted="$evicted $m"; else failed="$failed $m($code)"; fi
      done
      if [[ -n "$evicted" ]]; then
        recovery_until=$((now + RECOVERY_COOLDOWN))
        echo "$recovery_until" > "$RECOVERY_FILE"
        echo "$now" > "$WARN_COOLDOWN_FILE"
        log "WARN action: evicted ollama models:${evicted}; recovery cooldown until $recovery_until"
        notify "Memory pressure WARN — evicted Ollama model(s)$evicted to free RAM. Reload is paused for ${RECOVERY_COOLDOWN}s."
      fi
      [[ -n "$failed" ]] && log "WARN action: Ollama HTTP unload failed:$failed"
    fi
  else
    log "WARN: pressure=$pressure but no ollama models resident"
    [[ "$DRY_RUN" == "--dry-run" ]] || echo "$now" > "$WARN_COOLDOWN_FILE"
  fi
fi

(( !crit )) && exit 0

# --- CRITICAL action: SIGTERM->SIGKILL the largest leaf agent workload ---
last=$(cat "$CRIT_COOLDOWN_FILE" 2>/dev/null || echo 0)
(( now - last <= CRIT_COOLDOWN )) && exit 0
echo "$now" > "$CRIT_COOLDOWN_FILE"

# target preference: (1) batch leaves (builds/models — restart on demand, no
# session state), then (2) HEADLESS agent CLIs (tty=??). A terminal-attached
# agent CLI is someone's live session — never reap it, notify instead.
BATCH_RE='GradleDaemon|org\.gradle'
# exclude our own scan pipeline (ps/grep/awk) so the guard never reaps itself
candidates=$(ps -axo pid=,rss=,tty=,command= | grep -E "$AGENT_RE" | grep -vE "$NEVER_RE" \
  | grep -vE "memory-pressure-guardian|grep -E|ps -axo")
target=$(echo "$candidates" | grep -E "$BATCH_RE" | sort -k2 -rn | head -1)
[[ -z "$target" ]] && target=$(echo "$candidates" | awk '$3=="??"' | sort -k2 -rn | head -1)
if [[ -z "$target" ]]; then
  log "CRITICAL: pressure=$pressure swap=${swap_pct}% — only interactive/user processes remain; notifying only"
  notify "Memory CRITICAL (pressure=$pressure, swap=${swap_pct}%) — no batch or headless agent to reap; the hogs are interactive apps or live sessions. Check Activity Monitor."
  exit 0
fi
tpid=$(echo "$target" | awk '{print $1}')
trss=$(echo "$target" | awk '{print int($2/1024)}')
tcmd=$(echo "$target" | awk '{$1=$2=$3=""; print}' | cut -c1-120)

if [[ "$DRY_RUN" == "--dry-run" ]]; then
  log "DRY-RUN: would SIGTERM->SIGKILL pid $tpid (${trss}MB): $tcmd"
else
  kill -TERM "$tpid" 2>/dev/null
  "$SLEEP_BIN" 10
  kill -0 "$tpid" 2>/dev/null && kill -KILL "$tpid" 2>/dev/null
  log "CRITICAL action: reaped pid $tpid (${trss}MB): $tcmd"
  notify "Memory CRITICAL — reaped the largest agent workload: pid $tpid (${trss}MB) $tcmd. Builds/models restart on demand; no Electron helper or UI app was touched."
fi
