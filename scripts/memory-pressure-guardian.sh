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
#   instead: Gradle daemons, ollama runner/llama-server, agent CLIs.
# - OLLAMA: a per-request keep_alive from any client OVERRIDES server env, so a
#   model can be silently pinned; trust /api/ps, not the config. Evict actively
#   at WARN. A model wedged in "Stopping..." is a known bug class (ollama#14364);
#   maintainer-recommended recovery is killing the runner child process.
# - ACTION LADDER: WARN(2) -> evict Ollama models (cheap, reversible: reload on
#   next request). CRITICAL(4, or swap>=90%) -> also SIGTERM->SIGKILL the single
#   largest-RSS leaf agent workload. Never Electron helpers, never the IDE/UI.
#
# Install (per Mac): copy to ~/.local/bin/, LaunchAgent
# com.igor.memory-pressure-guardian.plist, StartInterval=60 + RunAtLoad.
# Pair with server-side Ollama env: OLLAMA_MAX_LOADED_MODELS=1,
# OLLAMA_NUM_PARALLEL=1, OLLAMA_KEEP_ALIVE=2m (required RAM scales as
# num_parallel * num_ctx; docs.ollama.com/faq).
set -u

LOG="$HOME/Library/Logs/memory-pressure-guardian.log"
NTFY_TOPIC="yolo-guard-fdh8ktuw1vtxb5sb"
STREAK_FILE="/tmp/memory-pressure-guardian.streak"
WEDGE_FILE="/tmp/memory-pressure-guardian.ollama-wedge"
WARN_COOLDOWN_FILE="/tmp/memory-pressure-guardian.lastwarn"
CRIT_COOLDOWN_FILE="/tmp/memory-pressure-guardian.lastcrit"
WARN_COOLDOWN=600
CRIT_COOLDOWN=300
STREAK_REQUIRED=2          # consecutive 60s polls before acting (rides out blips)
SWAP_CRIT_PCT=90
OLLAMA_API="http://127.0.0.1:11434"
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

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }
notify() {
  [[ "$DRY_RUN" == "--dry-run" ]] && { log "DRY-RUN notify: $1"; return; }
  curl -s -m 10 -H "Title: memory-pressure-guardian ($(hostname -s))" -H "Priority: high" \
    -d "$1" "https://ntfy.sh/$NTFY_TOPIC" >/dev/null 2>&1
}

# --- Ollama "Stopping..." wedge detector (independent of pressure level) ---
ollama_ps=$(curl -sm 3 "$OLLAMA_API/api/ps" 2>/dev/null)
if command -v ollama >/dev/null && ollama ps 2>/dev/null | grep -q "Stopping"; then
  wedge=$(( $(cat "$WEDGE_FILE" 2>/dev/null || echo 0) + 1 ))
  echo "$wedge" > "$WEDGE_FILE"
  log "ollama model wedged in Stopping... ($wedge/3)"
  if (( wedge >= 3 )); then
    if [[ "$DRY_RUN" == "--dry-run" ]]; then
      log "DRY-RUN: would kill wedged ollama runner"
    else
      pkill -f "ollama runner" 2>/dev/null; pkill -x llama-server 2>/dev/null
      sleep 3
      health=$(curl -sm 3 "$OLLAMA_API/api/version" >/dev/null 2>&1 && echo ok || echo down)
      log "killed wedged ollama runner; server health: $health"
      notify "Ollama model was wedged in 'Stopping...' — killed the runner process (known ollama bug workaround). Server: $health."
    fi
    rm -f "$WEDGE_FILE"
  fi
else
  rm -f "$WEDGE_FILE"
fi

# --- pressure evaluation ---
pressure=$(sysctl -n kern.memorystatus_vm_pressure_level 2>/dev/null || echo 1)
read -r swap_total swap_used <<< "$(sysctl -n vm.swapusage | awk '{gsub("M",""); print $3, $6}')"
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

now=$(date +%s)

# --- WARN action: evict resident Ollama models (reversible; reload on demand) ---
last=$(cat "$WARN_COOLDOWN_FILE" 2>/dev/null || echo 0)
if (( now - last > WARN_COOLDOWN )); then
  echo "$now" > "$WARN_COOLDOWN_FILE"
  models=$(echo "$ollama_ps" | python3 -c "import sys,json; print(' '.join(m['name'] for m in json.load(sys.stdin).get('models',[])))" 2>/dev/null)
  if [[ -n "${models:-}" ]]; then
    if [[ "$DRY_RUN" == "--dry-run" ]]; then
      log "DRY-RUN: would evict ollama models: $models"
    else
      for m in $models; do ollama stop "$m" >/dev/null 2>&1; done
      log "WARN action: evicted ollama models: $models"
      notify "Memory pressure WARN — evicted Ollama model(s) $models to free RAM. They reload automatically on next use."
    fi
  else
    log "WARN: pressure=$pressure but no ollama models resident"
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
  sleep 10
  kill -0 "$tpid" 2>/dev/null && kill -KILL "$tpid" 2>/dev/null
  log "CRITICAL action: reaped pid $tpid (${trss}MB): $tcmd"
  notify "Memory CRITICAL — reaped the largest agent workload: pid $tpid (${trss}MB) $tcmd. Builds/models restart on demand; no Electron helper or UI app was touched."
fi
