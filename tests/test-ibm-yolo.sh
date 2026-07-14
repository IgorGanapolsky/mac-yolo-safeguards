#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="$ROOT/ibm-yolo"
INSTALLER="$ROOT/scripts/install-ibm-yolo.sh"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/test-ibm-yolo.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

STUB="$TMP_DIR/bob"
CAPTURE="$TMP_DIR/args"
cat >"$STUB" <<'EOF'
#!/usr/bin/env bash
if [[ "${1:-}" == "--version" ]]; then
  echo "1.0.6-test"
  exit 0
fi
printf '%s\n' "$@" >"$IBM_BOB_CAPTURE"
exit "${IBM_BOB_EXIT:-0}"
EOF
chmod 0755 "$STUB" "$BIN" "$INSTALLER"

export IBM_BOB_BIN="$STUB"
export IBM_BOB_CAPTURE="$CAPTURE"

echo "test: doctor identifies official provider contract"
doctor_json="$($BIN --doctor --json)"
node -e '
  const value = JSON.parse(process.argv[1]);
  if (!value.ok || value.provider !== "IBM" || value.product !== "Bob Shell") process.exit(1);
  if (value.version !== "1.0.6-test" || value.fallback !== false) process.exit(1);
  if (value.invocation[1] !== "--yolo") process.exit(1);
' "$doctor_json"

echo "test: native --yolo is injected and arguments are preserved"
$BIN "audit this repo" --output-format json
arguments=()
while IFS= read -r argument; do
  arguments+=("$argument")
done <"$CAPTURE"
[[ "${arguments[0]}" == "--yolo" ]]
[[ "${arguments[1]}" == "audit this repo" ]]
[[ "${arguments[2]}" == "--output-format" ]]
[[ "${arguments[3]}" == "json" ]]

echo "test: explicit yolo is not duplicated"
$BIN --yolo "keep one"
[[ "$(grep -c '^--yolo$' "$CAPTURE")" -eq 1 ]]

echo "test: contradictory approval modes fail closed"
set +e
$BIN --approval-mode default >/dev/null 2>"$TMP_DIR/approval.err"
approval_exit=$?
set -e
[[ "$approval_exit" -eq 2 ]]
grep -q "refusing approval mode" "$TMP_DIR/approval.err"

set +e
$BIN --approval-mode=default >/dev/null 2>"$TMP_DIR/approval-equals.err"
approval_equals_exit=$?
set -e
[[ "$approval_equals_exit" -eq 2 ]]
grep -q "refusing approval mode" "$TMP_DIR/approval-equals.err"

echo "test: Bob exit status is preserved"
set +e
IBM_BOB_EXIT=17 $BIN "expected failure" >/dev/null 2>&1
bob_exit=$?
set -e
[[ "$bob_exit" -eq 17 ]]

echo "test: installer deploys the wrapper without network or Bob reinstall"
TEST_HOME="$TMP_DIR/home"
HOME="$TEST_HOME" IBM_YOLO_HOME="$TEST_HOME" IBM_BOB_BIN="$STUB" IBM_BOB_CAPTURE="$CAPTURE" \
  bash "$INSTALLER" --skip-bob-install --no-remote >"$TMP_DIR/install.out"
[[ -L "$TEST_HOME/.local/bin/ibm-yolo" ]]
grep -q 'IBM_YOLO_INSTALL_OK' "$TMP_DIR/install.out"
HOME="$TEST_HOME" IBM_BOB_BIN="$STUB" "$TEST_HOME/.local/bin/ibm-yolo" --doctor | grep -q 'IBM_YOLO_OK'

echo "test: no alternate-provider or revenue-script fallback exists"
if rg -qi 'grok|glm|qwen|hermes-hosting-market-signal|business_os|revenue_dir' "$BIN"; then
  echo "FAIL: ibm-yolo contains a non-IBM fallback" >&2
  exit 1
fi

bash -n "$BIN"
bash -n "$INSTALLER"
grep -q 'HOME/.npm-global/bin' "$INSTALLER"
! grep -q 'installer="$(fetch_official_installer)"' "$INSTALLER"
echo "PASS: ibm-yolo official IBM Bob contract"
