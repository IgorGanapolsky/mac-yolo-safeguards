#!/usr/bin/env bash
# run-suite - run a shell test suite and fail if it reported success WITHOUT
# actually executing any assertions.
#
# Why (2026-07-27/28): 21 of 30 suites in tests/ end with `[ "$fail" -eq 0 ]`, which
# is also true when the suite crashed, skipped everything, or measured nothing at all.
# Exit 0 with no output is indistinguishable from "0 problems found" — that pattern
# produced six false "clean" results in one session (a `mapfile` that does not exist
# in zsh searching 0 files; `log show` returning 0 lines because it is blocked; an
# errored glob; a suppressed `ls`; a `crontab -l` with no crontab; 0-pending CI read
# as settled).
#
# This wraps a suite so a green result must be EARNED: exit 0 AND at least N assertion
# markers on stdout. Use it in CI instead of calling suites directly — it needs no
# change to the suites themselves.
#
#   run-suite.sh tests/test-foo.sh            # requires >= 1 assertion
#   run-suite.sh tests/test-foo.sh 12         # requires >= 12 assertions
#
# Exit: 0 verified / 1 the suite failed / 2 the suite was VACUOUS (ran but asserted
# nothing) — distinct on purpose, because "could not evaluate" is not "clean".
set -uo pipefail

SUITE="${1:-}"
MIN="${2:-1}"
MARKER="${RUN_SUITE_MARKER:-\[PASS\]|\[FAIL\]|^ok |^not ok }"

if [[ -z "$SUITE" ]]; then
  echo "run-suite: usage: run-suite.sh <suite.sh> [min-assertions]" >&2
  exit 2
fi
if [[ ! -f "$SUITE" ]]; then
  echo "run-suite: VACUOUS — suite not found: $SUITE (a missing suite is not a passing suite)" >&2
  exit 2
fi

out="$(bash "$SUITE" 2>&1)"; rc=$?
printf '%s\n' "$out"

count="$(printf '%s\n' "$out" | grep -cE "$MARKER" || true)"
[[ "$count" =~ ^[0-9]+$ ]] || count=0

if (( rc != 0 )); then
  echo "run-suite: FAIL $SUITE (exit=$rc, $count assertions)" >&2
  exit 1
fi
if (( count < MIN )); then
  echo "run-suite: VACUOUS $SUITE — exited 0 but only $count assertion(s) ran (expected >= $MIN)." >&2
  echo "run-suite: a suite that measures nothing must never be reported as clean." >&2
  exit 2
fi

echo "run-suite: OK $SUITE ($count assertions)"
