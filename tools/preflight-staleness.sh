#!/usr/bin/env bash
# preflight-staleness - before you act on a target, prove you are looking at the LIVE
# one. Every check answers "is the thing I am about to reason about actually the thing
# that is running?"
#
# Earned from four failures in a single session (2026-07-28), all the same bug class:
#
#   1. Edited com.igor.ollama-serve.plist to change Ollama's config. That job was not
#      running -- Ollama.app was serving :11434. The edit did nothing.
#   2. Edited a launchd plist and expected it to take effect. launchd holds the OLD
#      definition until the job is reloaded, so it kept resetting the value back.
#   3. Read "branch is 0 commits behind main" from a STALE origin/main ref, concluded a
#      red CI check was "external, not mine". It was 1 behind and missing the fix.
#   4. Ran a CI check locally against stale node_modules instead of a fresh lockfile
#      install, got a pass, and reported the CI failure as a flake. It was real.
#
# Usage:
#   preflight-staleness.sh launchd <label>     # is the on-disk plist what is loaded?
#   preflight-staleness.sh port <port>         # which job/app actually owns this port?
#   preflight-staleness.sh git [base]          # is this branch behind its base?
#   preflight-staleness.sh node <dir>          # does node_modules match the lockfile?
#   preflight-staleness.sh all [base]          # git + node in the current repo
#
# Exit: 0 fresh / 1 STALE (act on this) / 2 could not determine (never treat as fresh).
set -uo pipefail

say()  { printf '  %s\n' "$1"; }
fresh(){ say "FRESH: $1"; return 0; }
stale(){ say "STALE: $1"; return 1; }
dunno(){ say "UNKNOWN: $1"; return 2; }

check_launchd() {
  local label="${1:-}"
  [[ -n "$label" ]] || { dunno "no label given"; return 2; }
  local plist="$HOME/Library/LaunchAgents/$label.plist"
  [[ -f "$plist" ]] || { dunno "$label: no plist at $plist"; return 2; }

  launchctl print "gui/$(id -u)/$label" >/dev/null 2>&1 \
    || { stale "$label: plist exists but the job is NOT loaded -- editing it changes nothing"; return 1; }

  # Compare BOTH the arguments and the environment launchd is holding. Comparing only
  # ProgramArguments misses the case that motivated this tool: OLLAMA_MAX_QUEUE lives in
  # EnvironmentVariables, so an env-only plist edit would have reported FRESH.
  local loaded ondisk loaded_env ondisk_env
  loaded="$(launchctl print "gui/$(id -u)/$label" 2>/dev/null \
            | awk '/arguments = \{/{f=1;next} f&&/\}/{f=0} f{gsub(/^[ \t]+|[ \t]+$/,"");print}')"
  # ^[[:space:]]*environment, NOT plain /environment/: launchctl prints an "inherited
  # environment" block FIRST (the whole session env). Matching that compared the session
  # against the plist and reported every job stale. The job's own block uses " => ".
  loaded_env="$(launchctl print "gui/$(id -u)/$label" 2>/dev/null \
            | awk '/^[[:space:]]*environment = \{/{f=1;next} f&&/^[[:space:]]*\}/{f=0} f{gsub(/^[ \t]+|[ \t]+$/,"");print}' \
            | sed 's/ *=> */=/' | sort)"
  ondisk_env="$(/usr/libexec/PlistBuddy -c 'Print :EnvironmentVariables' "$plist" 2>/dev/null \
            | sed -n 's/^ *\(.*\)$/\1/p' | grep -vE '^(Dict[[:space:]]*\{|\{|\})$' | grep -v '^$' \
            | sed 's/ = /=/' | sort)"
  # PlistBuddy wraps the list in "Array {" ... "}". Strip the wrapper, not just bare
  # braces -- missing "Array {" made this report every healthy job as STALE.
  ondisk="$(/usr/libexec/PlistBuddy -c 'Print :ProgramArguments' "$plist" 2>/dev/null \
            | sed -n 's/^ *\(.*\)$/\1/p' | grep -vE '^(Array[[:space:]]*\{|\{|\})$' | grep -v '^$')"
  if [[ -z "$loaded" ]]; then dunno "$label: could not read loaded arguments"; return 2; fi
  # Env comparison is a SUBSET check, not equality: launchd injects its own keys
  # (XPC_SERVICE_NAME, OSLogRateLimit) that never appear in the plist. The question is
  # "does launchd hold what the plist specifies", so every on-disk pair must be present
  # loaded; extra injected keys are irrelevant.
  local env_ok=1 pair
  while IFS= read -r pair; do
    [[ -z "$pair" ]] && continue
    printf '%s\n' "$loaded_env" | grep -qxF "$pair" || env_ok=0
  done <<< "$ondisk_env"

  if [[ "$(printf '%s' "$loaded" | tr -d '[:space:]')" == "$(printf '%s' "$ondisk" | tr -d '[:space:]')" \
     && "$env_ok" == "1" ]]; then
    # A current definition does NOT mean this job is the one doing the work. On the
    # mini com.igor.ollama-serve reports FRESH while Ollama.app actually serves :11434 --
    # editing that plist changed nothing. Ownership is a separate question.
    fresh "$label: loaded definition matches the plist on disk"
    say "  NOTE: fresh definition != this job owns the service. Confirm with: $0 port <port>"
    return 0
  fi
  stale "$label: launchd is running a DIFFERENT definition than the plist on disk -- reload it (bootout + bootstrap)"
  return 1
}

check_port() {
  local port="${1:-}"
  [[ -n "$port" ]] || { dunno "no port given"; return 2; }
  local pid
  pid="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | awk 'NR==2{print $2}')"
  [[ -n "$pid" ]] || { dunno "port $port: nothing listening"; return 2; }
  local cmd ppid pcmd
  cmd="$(ps -p "$pid" -o comm= 2>/dev/null)"
  ppid="$(ps -p "$pid" -o ppid= 2>/dev/null | tr -d ' ')"
  pcmd="$(ps -p "${ppid:-1}" -o comm= 2>/dev/null)"
  say "port $port -> pid=$pid"
  say "  process: ${cmd:-?}"
  say "  parent:  ${pcmd:-?}"
  say "  ^ configure THIS process's supervisor; editing an unrelated LaunchAgent is a no-op"
  return 0
}

check_git() {
  local base="${1:-origin/main}"
  git rev-parse --git-dir >/dev/null 2>&1 || { dunno "not a git repo"; return 2; }
  # Refresh first: the classic error is reading a stale remote ref and concluding
  # "0 behind". If the refresh FAILS for a remote-qualified base, the cached ref may be
  # arbitrarily old, so return UNKNOWN -- trusting it recreates the very bug this checks.
  if [[ "$base" == */* ]]; then
    if ! git fetch -q "${base%%/*}" "${base#*/}" 2>/dev/null && ! git fetch -q 2>/dev/null; then
      dunno "could not refresh $base -- cached ref may be stale; refusing to report fresh"
      return 2
    fi
  fi
  git rev-parse --verify "$base" >/dev/null 2>&1 || { dunno "base ref $base not found"; return 2; }
  local behind
  behind="$(git rev-list --count HEAD.."$base" 2>/dev/null)"
  [[ "$behind" =~ ^[0-9]+$ ]] || { dunno "could not count commits behind $base"; return 2; }
  (( behind == 0 )) && { fresh "up to date with $base"; return 0; }
  stale "$behind commit(s) behind $base -- CI here does NOT reflect current $base"
  return 1
}

check_node() {
  local dir="${1:-.}"
  [[ -f "$dir/package.json" ]] || { dunno "$dir: no package.json"; return 2; }
  local lock=""
  for c in package-lock.json npm-shrinkwrap.json; do [[ -f "$dir/$c" ]] && lock="$dir/$c" && break; done
  [[ -n "$lock" ]] || { dunno "$dir: no lockfile to compare against"; return 2; }
  [[ -d "$dir/node_modules" ]] || { dunno "$dir: node_modules absent (a fresh install would differ from nothing)"; return 2; }

  # Spot-check installed versions against the lockfile. A mismatch means local runs
  # are NOT reproducing what `npm ci` builds in CI.
  local out
  # Absolute-ise the lockfile BEFORE the cd, or a relative --dir makes python open
  # "<dir>/<dir>/package-lock.json", whose suppressed error looked like a healthy UNKNOWN.
  lock="$(cd "$(dirname "$lock")" && pwd)/$(basename "$lock")"
  out="$(cd "$dir" && python3 - "$lock" <<'PY' 2>/dev/null
import json, os, sys
lock = json.load(open(sys.argv[1]))
pkgs = lock.get("packages", {})
bad = 0; checked = 0
for path, meta in pkgs.items():
    if not path.startswith("node_modules/"):
        continue
    want = meta.get("version")
    if not want:
        continue
    pj = os.path.join(path, "package.json")
    checked += 1
    if not os.path.isfile(pj):
        # Locked but not installed: a partial install must never validate as fresh.
        bad += 1
        if bad <= 5:
            print(f"MISSING {path}: lockfile={want} installed=<absent>")
        continue
    try:
        have = json.load(open(pj)).get("version")
    except Exception:
        bad += 1
        if bad <= 5:
            print(f"UNREADABLE {path}")
        continue
    if have and have != want:
        bad += 1
        if bad <= 5:
            print(f"MISMATCH {path}: lockfile={want} installed={have}")
print(f"CHECKED {checked} MISMATCHED {bad}")
PY
)"
  local checked mism
  checked="$(printf '%s\n' "$out" | awk '/^CHECKED/{print $2}')"
  mism="$(printf '%s\n' "$out" | awk '/^CHECKED/{print $4}')"
  printf '%s\n' "$out" | grep -E '^(MISMATCH|MISSING|UNREADABLE)' | sed 's/^/    /'
  [[ "${checked:-0}" -gt 0 ]] || { dunno "$dir: compared 0 packages -- this check measured nothing"; return 2; }
  if [[ "${mism:-0}" -eq 0 ]]; then
    fresh "$dir: node_modules matches lockfile across $checked packages"; return 0
  fi
  stale "$dir: $mism of $checked packages differ from the lockfile -- local runs do NOT reproduce 'npm ci'"
  return 1
}

main() {
  local mode="${1:-all}"; shift || true
  case "$mode" in
    launchd) check_launchd "${1:-}" ;;
    port)    check_port "${1:-}" ;;
    git)     check_git "${1:-origin/main}" ;;
    node)    check_node "${1:-.}" ;;
    all)
      local rc=0 r
      check_git "${1:-origin/main}"; r=$?; (( r > rc )) && rc=$r
      if [[ -f package.json ]]; then check_node .; r=$?; (( r > rc )) && rc=$r; fi
      return $rc ;;
    *) echo "usage: preflight-staleness.sh {launchd <label>|port <n>|git [base]|node <dir>|all}" >&2; return 2 ;;
  esac
}

main "$@"
