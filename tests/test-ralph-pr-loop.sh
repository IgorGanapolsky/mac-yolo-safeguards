#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/bin"
cat >"$TMP/bin/gh" <<'FAKE_GH'
#!/usr/bin/env bash
set -euo pipefail

echo "$*" >>"${GH_CALL_LOG:?}"

if [[ "${1:-}" == "api" ]]; then
  echo '12345678'
  exit 0
fi

if [[ "${1:-}" == "pr" && "${2:-}" == "list" ]]; then
  if [[ " $* " == *" --state merged "* ]]; then
    exit 0
  fi
  if [[ " $* " == *" --json number "* ]]; then
    echo '3'
    exit 0
  fi
  printf '101\tMERGEABLE\tBEHIND\ttrue\tfeat/a\tA\n'
  printf '102\tMERGEABLE\tBEHIND\ttrue\tfeat/b\tB\n'
  printf '103\tMERGEABLE\tBEHIND\ttrue\tfeat/c\tC\n'
  exit 0
fi

if [[ "${1:-}" == "pr" && "${2:-}" == "update-branch" ]]; then
  exit 0
fi

if [[ "${1:-}" == "pr" && "${2:-}" == "checks" ]]; then
  exit 0
fi

if [[ "${1:-}" == "pr" && "${2:-}" == "merge" ]]; then
  exit 0
fi

echo "unexpected fake gh invocation: $*" >&2
exit 3
FAKE_GH
chmod +x "$TMP/bin/gh"

run_case() {
  local name="$1"
  local budget="$2"
  local expected_updates="$3"
  local expected_deferred="$4"
  local case_dir="$TMP/$name"
  mkdir -p "$case_dir"
  : >"$case_dir/gh-calls.log"

  PATH="$TMP/bin:$PATH" \
    GH_CALL_LOG="$case_dir/gh-calls.log" \
    RALPH_LOG_DIR="$case_dir/logs" \
    RALPH_MAX_BRANCH_UPDATES_PER_CYCLE="$budget" \
    bash "$ROOT/tools/ralph-pr-loop.sh" --once >"$case_dir/stdout.log"

  local actual_updates
  actual_updates="$(grep -c '^pr update-branch ' "$case_dir/gh-calls.log" || true)"
  [[ "$actual_updates" == "$expected_updates" ]] || {
    echo "$name: expected $expected_updates branch updates, got $actual_updates" >&2
    exit 1
  }
  grep -q "branch_updates=$expected_updates deferred_branch_updates=$expected_deferred budget=$budget" "$case_dir/stdout.log"
}

run_case default 2 2 1
run_case custom 1 1 2
run_case disabled 0 0 3

if PATH="$TMP/bin:$PATH" \
  GH_CALL_LOG="$TMP/invalid-gh.log" \
  RALPH_LOG_DIR="$TMP/invalid-logs" \
  RALPH_MAX_BRANCH_UPDATES_PER_CYCLE="many" \
  bash "$ROOT/tools/ralph-pr-loop.sh" --once >"$TMP/invalid.out" 2>"$TMP/invalid.err"; then
  echo "invalid budget unexpectedly succeeded" >&2
  exit 1
fi
grep -q 'must be a non-negative integer' "$TMP/invalid.err"

echo "4 checks passed (ralph-pr-loop CI update budget)"
