#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/mac-yolo-hygiene-test.XXXXXX")"
REPO="$TMP_ROOT/repo"
RECEIPT="$TMP_ROOT/latest.json"
trap 'rm -rf "$TMP_ROOT"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

mkdir -p "$REPO/scripts" "$REPO/business_os/revenue"
cp "$ROOT/scripts/migrate-root-ops-to-business-os.sh" "$REPO/scripts/"
cp "$ROOT/scripts/repo-hygiene-self-heal.sh" "$REPO/scripts/"
git -C "$REPO" init -q
git -C "$REPO" config user.email hygiene-test@example.invalid
git -C "$REPO" config user.name hygiene-test

cat > "$REPO/.gitignore" <<'EOF'
proposal-plan*.md
hermes-decision*.md
payment-readiness*.md
EOF
printf 'tracked\n' > "$REPO/README.md"
git -C "$REPO" add .gitignore README.md scripts
git -C "$REPO" commit -qm fixture

printf 'unique-root\n' > "$REPO/proposal-plan-alpha-2026-07-12.md"
printf 'same-content\n' > "$REPO/hermes-decision-2026-07-12.md"
printf 'same-content\n' > "$REPO/business_os/revenue/hermes-decision-2026-07-12.md"
printf 'root-version\n' > "$REPO/payment-readiness-all-2026-07-12.md"
printf 'archive-version\n' > "$REPO/business_os/revenue/payment-readiness-all-2026-07-12.md"

set +e
/bin/bash "$REPO/scripts/repo-hygiene-self-heal.sh" --repair --repo "$REPO" --receipt "$RECEIPT" > "$TMP_ROOT/first.log" 2>&1
first_exit=$?
set -e
[[ "$first_exit" -eq 2 ]] || fail "divergent archive should block with exit 2, got $first_exit"
[[ -f "$REPO/business_os/revenue/proposal-plan-alpha-2026-07-12.md" ]] || fail "unique artifact was not archived"
[[ ! -f "$REPO/proposal-plan-alpha-2026-07-12.md" ]] || fail "unique root artifact remained"
[[ ! -f "$REPO/hermes-decision-2026-07-12.md" ]] || fail "exact duplicate remained in root"
[[ -f "$REPO/payment-readiness-all-2026-07-12.md" ]] || fail "divergent root artifact was deleted"
grep -q '"status": "blocked"' "$RECEIPT" || fail "blocked receipt missing"

rm "$REPO/business_os/revenue/payment-readiness-all-2026-07-12.md"
/bin/bash "$REPO/scripts/repo-hygiene-self-heal.sh" --repair --repo "$REPO" --receipt "$RECEIPT" > "$TMP_ROOT/second.log"
[[ ! -f "$REPO/payment-readiness-all-2026-07-12.md" ]] || fail "repairable artifact remained in root"
grep -q 'root_after=0' "$TMP_ROOT/second.log" || fail "repair did not report clean root"
grep -q '"status": "pass"' "$RECEIPT" || fail "pass receipt missing"
[[ "$(stat -f '%Lp' "$REPO/business_os/revenue")" == "700" ]] || fail "archive directory mode is not 700"
[[ "$(stat -f '%Lp' "$REPO/business_os/revenue/payment-readiness-all-2026-07-12.md")" == "600" ]] || fail "archive file mode is not 600"

/bin/bash "$REPO/scripts/repo-hygiene-self-heal.sh" --repair --repo "$REPO" --receipt "$RECEIPT" > "$TMP_ROOT/third.log"
grep -q 'root_before=0 root_after=0' "$TMP_ROOT/third.log" || fail "second repair was not idempotent"
[[ -f "$REPO/README.md" ]] || fail "tracked root file was touched"

echo "PASS repo hygiene: divergent overwrite blocked, content preserved, repair idempotent"
