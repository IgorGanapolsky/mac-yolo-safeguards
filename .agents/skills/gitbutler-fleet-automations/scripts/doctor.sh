#!/usr/bin/env bash
# Prove GitButler automations wiring for this fleet. Never prints tokens.
set -euo pipefail
fail=0
say() { printf '%s\n' "$*"; }
need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    say "FAIL missing command: $1"
    fail=1
    return
  fi
  say "OK command $1 $($1 --version 2>/dev/null | head -1)"
}

need but
need git

ver="$(but --version 2>/dev/null | awk '{print $2}')"
say "CLI $ver"

if python3 - <<'PY'
import subprocess, sys
r = subprocess.run(["but", "skill", "check"], capture_output=True, text=True, timeout=40)
sys.stdout.write(r.stdout)
sys.stderr.write(r.stderr)
sys.exit(0 if r.returncode == 0 and "All skills are up to date" in (r.stdout + r.stderr) else 1)
PY
then
  say "OK but skill check"
else
  say "FAIL but skill check"
  fail=1
fi

for p in \
  "$HOME/.grok/skills/gitbutler/SKILL.md" \
  "$HOME/.grok/skills/gitbutler-fleet-safe/SKILL.md" \
  "$HOME/.grok/skills/gitbutler-fleet-automations/SKILL.md" \
  "$HOME/.grok/skills/gitbutler-google-sso/SKILL.md" \
  "$HOME/.claude/skills/gitbutler-automations/SKILL.md"
do
  if [[ -f "$p" ]]; then
    say "OK skill $p"
  else
    say "FAIL missing $p"
    fail=1
  fi
done

SAFE="$HOME/.grok/skills/gitbutler-fleet-safe/scripts/assert_but_setup_safe.sh"
if [[ -x "$SAFE" ]] || [[ -f "$SAFE" ]]; then
  if bash "$SAFE" "$HOME/workspace/git/igor/ThumbGate" >/tmp/but-safe-tg.out 2>&1; then
    say "FAIL ThumbGate primary was allowed for but setup"
    fail=1
  else
    say "OK ThumbGate primary REFUSE ($(head -1 /tmp/but-safe-tg.out))"
  fi
  if bash "$SAFE" "$HOME/workspace/git/igor/mac-yolo-safeguards" >/tmp/but-safe-my.out 2>&1; then
    say "FAIL mac-yolo primary was allowed for but setup"
    fail=1
  else
    say "OK mac-yolo primary REFUSE ($(head -1 /tmp/but-safe-my.out))"
  fi
  if bash "$SAFE" "$HOME/workspace/git/igor/RealEstate" >/tmp/but-safe-re.out 2>&1; then
    say "FAIL RealEstate shared was allowed for but setup"
    fail=1
  else
    say "OK RealEstate shared REFUSE ($(head -1 /tmp/but-safe-re.out))"
  fi
else
  say "FAIL missing assert_but_setup_safe.sh"
  fail=1
fi

if security find-generic-password -s "gitbutler_access_token" -w >/dev/null 2>&1 \
  || security find-generic-password -s "com.gitbutler.app-gitbutler_access_token" -w >/dev/null 2>&1 \
  || security find-generic-password -s "release-gitbutler_access_token" -w >/dev/null 2>&1; then
  say "OK GitButler Keychain token present (not printed)"
else
  say "WARN GitButler Keychain token not found under known service names"
fi

python3 - <<'PY'
import subprocess
r = subprocess.run(["but", "agent", "setup", "--print"], capture_output=True, text=True, timeout=20)
text = r.stdout + r.stderr
ok = "gitbutler-agent-setup:start" in text and r.returncode == 0
print("OK agent setup --print" if ok else "FAIL agent setup --print")
raise SystemExit(0 if ok else 1)
PY
agent_rc=$?
if [[ "$agent_rc" -ne 0 ]]; then
  fail=1
fi

say "doctor_exit=$fail"
exit "$fail"
