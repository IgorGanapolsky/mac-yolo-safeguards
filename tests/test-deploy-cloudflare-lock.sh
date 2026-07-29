#!/usr/bin/env bash
# test-deploy-cloudflare-lock.sh — coverage for the production deploy gate.
#
# This gate shipped merged (PR #1166) with ZERO automated tests, verified only by a
# live dry-run. It decides whether production deploys happen, so a silent regression
# here is invisible until something wrong is already live.
#
# Each stage below documents: why it exists, what goes wrong without it, and how we
# measure that it works. That third question is the one the original had no answer to.
set -uo pipefail

pass=0; fail=0
ok() { echo "  [PASS] $1"; pass=$((pass+1)); }
no() { echo "  [FAIL] $1"; fail=$((fail+1)); }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/deploy-cloudflare-with-lock.sh"

[ -f "$SCRIPT" ] || { echo "missing $SCRIPT"; exit 2; }

# ---------------------------------------------------------------------------
# STAGE 1 — greenness is decided by an ALLOWLIST of terminal conclusions.
#   Why:    the deploy must not ship a broken commit.
#   Breaks: a blocklist only rejects failure/timed_out/cancelled. GitHub also emits
#           action_required, stale and startup_failure — non-null, so they escape
#           both the blocklist AND the pending test, and the gate calls them green.
#   Measure: drive the real embedded classifier with each conclusion and assert the
#           verdict, rather than reading the source and believing it.
# ---------------------------------------------------------------------------
CLS="$(mktemp)"
# Extract the embedded python classifier so it is exercised as shipped, not re-typed.
python3 - "$SCRIPT" "$CLS" <<'PY'
import re, sys
src = open(sys.argv[1]).read()
m = re.search(r"python3 -c '(.*?)'\n", src, re.S)
if not m:
    sys.exit("could not extract embedded classifier")
open(sys.argv[2], "w").write(m.group(1))
PY

if python3 -c "import py_compile,sys; py_compile.compile(sys.argv[1], doraise=True)" "$CLS" 2>/dev/null; then
  ok "embedded check-runs classifier compiles (an inert gate looks identical to a passing one)"
else
  no "embedded classifier does NOT compile — the gate would fail closed but never actually check"
fi

verdict() { # $1 = json of check_runs -> prints classifier stdout
  printf '%s' "$1" | python3 "$CLS" 2>/dev/null
}
J() { printf '{"check_runs":[%s]}' "$1"; }

out="$(verdict "$(J '{"name":"a","conclusion":"success"},{"name":"b","conclusion":"skipped"}')")"
case "$out" in green*) ok "success+skipped -> green" ;; *) no "success+skipped should be green, got: $out" ;; esac

out="$(verdict "$(J '{"name":"gate","conclusion":"action_required"}')")"
case "$out" in *"NOT GREEN"*|*"gate"*) ok "action_required BLOCKS (the blocklist bug)" ;; *) no "action_required must block, got: $out" ;; esac

out="$(verdict "$(J '{"name":"s","conclusion":"stale"}')")"
case "$out" in *"NOT GREEN"*|*"s"*) ok "stale BLOCKS" ;; *) no "stale must block, got: $out" ;; esac

out="$(verdict "$(J '{"name":"f","conclusion":"failure"}')")"
case "$out" in *"NOT GREEN"*|*"f"*) ok "failure BLOCKS" ;; *) no "failure must block, got: $out" ;; esac

out="$(verdict "$(J '{"name":"p","conclusion":null}')")"
case "$out" in *"STILL RUNNING"*) ok "pending BLOCKS (never treated as green)" ;; *) no "pending must block, got: $out" ;; esac

out="$(verdict '{"check_runs":[]}')"
case "$out" in *"no check-runs"*) ok "zero check-runs REFUSES (absence is not a pass)" ;; *) no "empty check-runs must refuse, got: $out" ;; esac
rm -f "$CLS"

# ---------------------------------------------------------------------------
# STAGE 2 — the deployment is created with required_contexts: [] explicitly.
#   Why:    this repo is Actions-only. GitHub's combined COMMIT STATUS is therefore
#           permanently {state:"pending", statuses:[]}.
#   Breaks: omit the field and GitHub gates the deployment on that combined status,
#           so every locked deploy dies with `409 Commit status checks failed`. The
#           lock then never acquires and every real deploy bypasses this script —
#           which is the exact uncoordinated-deploy hazard it exists to prevent.
#   Measure: assert the POST body carries a real empty array.
# ---------------------------------------------------------------------------
if grep -q '"required_contexts": *\[\]' "$SCRIPT"; then
  ok "deployment POST sends required_contexts: [] (the 409 that made the lock unacquirable)"
else
  no "required_contexts: [] missing — locked deploys will 409 forever"
fi

if grep -q 'gh api -X POST .*deployments.*--input' "$SCRIPT"; then
  ok "body is sent via --input (so [] stays a JSON array, not a dropped -f field)"
else
  no "deployment body not sent via --input; -f cannot express an empty array"
fi

# ---------------------------------------------------------------------------
# STAGE 3 — the gate checks the LOCAL checkout, not a remote branch name.
#   Why:    `npm run build:cloudflare` builds the working tree.
#   Breaks: verifying remote main proves nothing about the artifact. An agent running
#           this from a feature worktree is told "main is green" and ships its own
#           unreviewed code to production.
#   Measure: the script must resolve HEAD and gate on that SHA.
# ---------------------------------------------------------------------------
if grep -q 'rev-parse HEAD' "$SCRIPT"; then
  ok "gate resolves the local HEAD SHA (not a moving branch ref)"
else
  no "gate does not resolve local HEAD — a green main could authorise unchecked code"
fi

# ---------------------------------------------------------------------------
# STAGE 4 — a dirty tree is refused.
#   Why:    a dirty tree is not any reviewed commit.
#   Breaks: on 2026-07-28 the shared working tree held UNCOMMITTED edits to
#           auth/callback, billing/webhook and pairing/approve. Deploying from it
#           would have pushed unreviewed auth and payment code to production.
#   Measure: run the real script in a dirty temp repo and require a non-zero exit
#           whose message names the dirt.
# ---------------------------------------------------------------------------
TMP="$(mktemp -d)"
git -C "$TMP" init -q 2>/dev/null
mkdir -p "$TMP/apps/hermes-control-plane" "$TMP/scripts"
cp "$SCRIPT" "$TMP/scripts/" 2>/dev/null
echo "x" > "$TMP/apps/hermes-control-plane/seed.txt"
git -C "$TMP" add -A >/dev/null 2>&1
git -C "$TMP" -c user.email=t@t -c user.name=t commit -qm seed >/dev/null 2>&1
# Fixture name deliberately avoids the word the assertion matches, so a
# passing grep can only come from the refusal MESSAGE, not the filename.
echo "uncommitted" > "$TMP/apps/hermes-control-plane/pending-edit.txt"

out="$(cd "$TMP" && DEPLOY_LOCK_DRY_RUN=1 GH_TOKEN=invalid bash scripts/deploy-cloudflare-with-lock.sh 2>&1)"; code=$?
if [ "$code" -ne 0 ] && printf '%s' "$out" | grep -q 'working tree is dirty'; then
  ok "dirty working tree REFUSES the deploy and names the dirt"
else
  no "dirty tree not refused (exit=$code): $(printf '%s' "$out" | head -1)"
fi
rm -rf "$TMP"

# ---------------------------------------------------------------------------
# STAGE 5 — the lock is a real mutual exclusion, not decoration.
#   Why:    many agents deploy this repo concurrently from their own machines.
#   Breaks: two simultaneous deploys leave the browser loading assets from one build
#           while the worker serves routes from another.
#   Measure: the script must look for an active lock and refuse rather than race.
# ---------------------------------------------------------------------------
if grep -q 'refusing to race it' "$SCRIPT"; then
  ok "an already-held lock refuses instead of racing"
else
  no "no concurrent-deploy refusal found"
fi

if grep -qE '^[[:space:]]*trap .*resolve_lock' "$SCRIPT"; then
  ok "lock is released on failure and on signals (a crash must not wedge deploys)"
else
  no "lock has no failure/signal release — one crash blocks every future deploy"
fi

echo "=== deploy-lock: $pass passed, $fail failed ==="
[ "$fail" -eq 0 ]
