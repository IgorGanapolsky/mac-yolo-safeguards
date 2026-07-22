#!/usr/bin/env bash
# Prevention watchdog: CDP health, SOUL no-constraints, disabled_toolsets, session token ceiling.
# Heals CDP. Never writes disabled_toolsets=[browser].
set -euo pipefail

CHECK_ONLY=0
JSON_OUT=0
HEAL=1
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1; HEAL=0 ;;
    --json) JSON_OUT=1 ;;
    --no-heal) HEAL=0 ;;
  esac
done

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "${repo_root}/scripts/hermes-interactive-chrome-gate.sh"
home="${HOME}"
soul="${HERMES_SOUL_PATH:-${home}/.hermes/SOUL.md}"
config="${HERMES_CONFIG_PATH:-${home}/.hermes/config.yaml}"
cdp_port="${HERMES_CDP_PORT:-9222}"
uid="$(id -u)"
gui_domain="gui/${uid}"
state_dir="${home}/Library/Logs"
mkdir -p "$state_dir"
state_json="${state_dir}/hermes-prevention-watchdog-state.json"

ok_cdp=0
ok_soul=0
ok_toolsets=0
ok_token_ceiling=0
ok_cdp_agent=0
actions=()
errors=()

interactive_chrome=0
if hermes_interactive_chrome_allowed; then
  interactive_chrome=1
fi

# Prefer IPv4 (hermes-agent default). Fall back to IPv6 so we do not false-alarm
# when Chrome bound [::1] only — then heal toward IPv4 via hermes-chrome-cdp.sh.
cdp_probe_ipv4() {
  curl -sf --max-time 2 "http://127.0.0.1:${cdp_port}/json/version" 2>/dev/null | grep -q webSocketDebuggerUrl
}

cdp_probe_any() {
  cdp_probe_ipv4 && return 0
  curl -sgf --max-time 2 "http://[::1]:${cdp_port}/json/version" 2>/dev/null | grep -q webSocketDebuggerUrl
}

if cdp_probe_ipv4; then
  ok_cdp=1
elif [[ "$interactive_chrome" -eq 0 ]]; then
  ok_cdp=1
else
  if cdp_probe_any; then
    errors+=("cdp_ipv4_down")
  else
    errors+=("cdp_down")
  fi
  if [[ "$HEAL" -eq 1 ]]; then
    # Prefer the heal script (reclaims non-CDP IPv4 squats) over bare kickstart.
    if [[ -x "${repo_root}/scripts/hermes-chrome-cdp.sh" ]]; then
      if bash "${repo_root}/scripts/hermes-chrome-cdp.sh"; then
        actions+=("ran_hermes-chrome-cdp.sh")
      fi
    elif launchctl print "${gui_domain}/com.hermes.chrome-cdp" >/dev/null 2>&1; then
      launchctl kickstart -k "${gui_domain}/com.hermes.chrome-cdp" 2>/dev/null || true
      actions+=("kickstart_com.hermes.chrome-cdp")
    fi
    sleep 1
    if cdp_probe_ipv4; then
      ok_cdp=1
      actions+=("cdp_healed")
    fi
  fi
fi

if [[ "$interactive_chrome" -eq 0 ]]; then
  ok_cdp_agent=1
elif launchctl print "${gui_domain}/com.hermes.chrome-cdp" >/dev/null 2>&1; then
  ok_cdp_agent=1
else
  errors+=("cdp_launchagent_missing")
  if [[ "$HEAL" -eq 1 && -x "${repo_root}/scripts/install-hermes-chrome-cdp.sh" ]]; then
    if bash "${repo_root}/scripts/install-hermes-chrome-cdp.sh" >/dev/null 2>&1; then
      actions+=("installed_chrome-cdp")
    fi
    if launchctl print "${gui_domain}/com.hermes.chrome-cdp" >/dev/null 2>&1; then
      ok_cdp_agent=1
    fi
  fi
fi

# grep -E (not rg): self-hosted mac-mini-hermes runner PATH omits Homebrew ripgrep.
if [[ -f "$soul" ]]; then
  if grep -Eiq 'No constraints|NO-CONSTRAINTS|NOT ALLOWED to invent' "$soul" 2>/dev/null; then
    ok_soul=1
  else
    errors+=("soul_missing_no_constraints")
  fi
  if grep -Eiq 'Browser Session Safety Lock' "$soul" 2>/dev/null; then
    ok_soul=0
    errors+=("soul_has_browser_safety_lock")
  fi
else
  errors+=("soul_missing")
fi

if [[ -f "$config" ]]; then
  if python3 - "$config" <<'PY'
import re, sys
text = open(sys.argv[1], encoding="utf-8", errors="replace").read()
m = re.search(r"disabled_toolsets\s*:\s*(\[[^\]]*\]|(?:\n(?:[ \t]+-[ \t]*.+\n?)+))", text)
if not m:
    sys.exit(0)
block = m.group(1)
if re.search(r"(?i)(^|[\[\s,-])browser([\]\s,]|$)", block):
    sys.exit(1)
sys.exit(0)
PY
  then
    ok_toolsets=1
  else
    ok_toolsets=0
    errors+=("disabled_toolsets_includes_browser")
  fi
else
  errors+=("config_missing")
fi

ceiling="${HERMES_MAX_SESSION_INPUT_TOKENS:-}"
if [[ -n "$ceiling" && "$ceiling" != "0" ]]; then
  ok_token_ceiling=1
elif grep -Eilq 'HERMES_MAX_SESSION_INPUT_TOKENS|MAX_SESSION_INPUT_TOKENS' \
  "${home}/.hermes/hermes-agent/agent/conversation_loop.py" \
  "${home}/Library/LaunchAgents/ai.hermes.gateway.plist" 2>/dev/null; then
  ok_token_ceiling=1
else
  errors+=("session_token_ceiling_unproven")
fi

all_ok=0
if [[ "$ok_cdp" -eq 1 && "$ok_soul" -eq 1 && "$ok_toolsets" -eq 1 && "$ok_token_ceiling" -eq 1 && "$ok_cdp_agent" -eq 1 ]]; then
  all_ok=1
fi

ACTIONS_CSV=$(IFS=,; echo "${actions[*]-}")
ERRORS_CSV=$(IFS=,; echo "${errors[*]-}")

python3 - "$state_json" "$all_ok" "$ok_cdp" "$ok_cdp_agent" "$ok_soul" "$ok_toolsets" "$ok_token_ceiling" "$ACTIONS_CSV" "$ERRORS_CSV" <<'PY'
import json, sys
path = sys.argv[1]
payload = {
  "ok": sys.argv[2] == "1",
  "cdp": sys.argv[3] == "1",
  "cdpLaunchAgent": sys.argv[4] == "1",
  "soulNoConstraints": sys.argv[5] == "1",
  "toolsetsOk": sys.argv[6] == "1",
  "tokenCeiling": sys.argv[7] == "1",
  "actions": [a for a in sys.argv[8].split(",") if a],
  "errors": [e for e in sys.argv[9].split(",") if e],
}
with open(path, "w", encoding="utf-8") as f:
    json.dump(payload, f, indent=2)
    f.write("\n")
PY

if [[ "$JSON_OUT" -eq 1 ]]; then
  cat "$state_json"
else
  echo "=== Hermes prevention watchdog ==="
  echo "cdp=${ok_cdp} cdpLaunchAgent=${ok_cdp_agent} soul=${ok_soul} toolsets=${ok_toolsets} tokenCeiling=${ok_token_ceiling}"
  if ((${#actions[@]})); then echo "actions: ${actions[*]}"; fi
  if ((${#errors[@]})); then echo "errors: ${errors[*]}"; fi
fi

[[ "$all_ok" -eq 1 ]] && exit 0 || exit 1
