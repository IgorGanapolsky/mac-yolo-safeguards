#!/usr/bin/env bash
# Smoke tests for ibm-yolo CLI (local only).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="$ROOT/ibm-yolo"
chmod +x "$BIN"
export IBM_YOLO_REPO="$ROOT"
export REVENUE_DIR="${REVENUE_DIR:-$HOME/workspace/git/igor/mac-yolo-safeguards/business_os/revenue}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

echo "test help"
"$BIN" --help | grep -q enterprise-sdlc

echo "test doctor"
"$BIN" --doctor | tee /tmp/ibm-yolo-doctor.txt
grep -q DOCTOR_ "$BIN" --doctor 2>/dev/null || true
if grep -q DOCTOR_OK /tmp/ibm-yolo-doctor.txt; then
  echo "doctor ok"
elif grep -q DOCTOR_FAIL /tmp/ibm-yolo-doctor.txt; then
  echo "doctor fail (may be missing revenue on CI)" >&2
  # allow fail only if no revenue dir
  if [[ ! -d "$REVENUE_DIR" ]]; then
    echo "skip hard fail — no REVENUE_DIR"
  else
    exit 1
  fi
else
  echo "doctor missing status line" >&2
  exit 1
fi

echo "test no-apply json"
if [[ -f "$ROOT/tools/hermes-hosting-market-signal.js" ]] && [[ -d "$REVENUE_DIR" ]]; then
  out="$("$BIN" --no-apply --json 2>/dev/null | head -c 2000)"
  echo "$out" | grep -q '"ok"'
  echo "json ok"
else
  echo "skip json run — tools/revenue missing"
fi

echo "PASS ibm-yolo smoke"
