#!/usr/bin/env bash
# Guarded repair for private generated artifacts that leak into the repo root.
set -euo pipefail
umask 077

mode="check"
repo=""
receipt=""

usage() {
  cat <<'EOF'
Usage: repo-hygiene-self-heal.sh [--check|--repair] [--repo PATH] [--receipt PATH]

The repair path only relocates gitignored root *.md/*.tsv artifacts. It never
touches tracked files and refuses to overwrite a different same-name archive.
EOF
}

while (($# > 0)); do
  case "$1" in
    --check) mode="check" ;;
    --repair) mode="repair" ;;
    --repo)
      shift
      [[ $# -gt 0 ]] || { echo "--repo requires a path" >&2; exit 2; }
      repo="$1"
      ;;
    --receipt)
      shift
      [[ $# -gt 0 ]] || { echo "--receipt requires a path" >&2; exit 2; }
      receipt="$1"
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

script_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo="${repo:-$script_root}"
repo="$(cd "$repo" && pwd)"
ops_dir="${MAC_YOLO_OPS_DIR:-$repo/business_os/revenue}"
receipt="${receipt:-$HOME/.local/state/mac-yolo-safeguards/repo-hygiene-latest.json}"

git -C "$repo" rev-parse --is-inside-work-tree >/dev/null

repo_key="$(printf '%s' "$repo" | cksum | awk '{print $1}')"
lock_dir="${TMPDIR:-/tmp}/mac-yolo-repo-hygiene-${UID}-${repo_key}.lockdir"

acquire_lock() {
  if mkdir "$lock_dir" 2>/dev/null; then
    printf '%s\n' "$$" > "$lock_dir/pid"
    return 0
  fi

  local owner=""
  [[ -f "$lock_dir/pid" ]] && owner="$(sed -n '1p' "$lock_dir/pid")"
  if [[ "$owner" =~ ^[0-9]+$ ]] && kill -0 "$owner" 2>/dev/null; then
    echo "hygiene_status=busy owner_pid=$owner"
    exit 0
  fi

  rm -rf "$lock_dir"
  mkdir "$lock_dir"
  printf '%s\n' "$$" > "$lock_dir/pid"
}

count_root_artifacts() {
  local count=0 file
  shopt -s nullglob
  for file in "$repo"/*.md "$repo"/*.tsv; do
    [[ -f "$file" ]] || continue
    if git -C "$repo" check-ignore -q -- "${file#$repo/}"; then
      count=$((count + 1))
    fi
  done
  printf '%d\n' "$count"
}

acquire_lock
trap 'rm -rf "$lock_dir"' EXIT

before="$(count_root_artifacts)"
status="pass"
exit_code=0

if [[ "$mode" == "repair" ]]; then
  set +e
  migration_output="$(MAC_YOLO_REPO_ROOT="$repo" MAC_YOLO_OPS_DIR="$ops_dir" /bin/sh "$repo/scripts/migrate-root-ops-to-business-os.sh" 2>&1)"
  migration_exit=$?
  set -e
  printf '%s\n' "$migration_output"
  if (( migration_exit != 0 )); then
    status="blocked"
    exit_code=$migration_exit
  fi
  if [[ -d "$ops_dir" ]]; then
    chmod 700 "$ops_dir"
    find "$ops_dir" -maxdepth 1 -type f -exec chmod 600 {} +
  fi
elif (( before > 0 )); then
  status="needs_repair"
  exit_code=1
fi

after="$(count_root_artifacts)"
if (( after > 0 )) && [[ "$status" == "pass" ]]; then
  status="blocked"
  exit_code=2
fi

archive_files=0
if [[ -d "$ops_dir" ]]; then
  archive_files="$(find "$ops_dir" -maxdepth 1 -type f | wc -l | tr -d ' ')"
fi
dirty_entries="$(git -C "$repo" status --short | wc -l | tr -d ' ')"
head_sha="$(git -C "$repo" rev-parse --short=12 HEAD)"
checked_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

mkdir -p "$(dirname "$receipt")"
cat > "$receipt" <<EOF
{
  "schema": "mac-yolo-repo-hygiene/v1",
  "checkedAt": "$checked_at",
  "mode": "$mode",
  "status": "$status",
  "head": "$head_sha",
  "rootIgnoredArtifactsBefore": $before,
  "rootIgnoredArtifactsAfter": $after,
  "archiveFiles": $archive_files,
  "gitStatusEntries": $dirty_entries
}
EOF
chmod 600 "$receipt"

printf 'hygiene_status=%s mode=%s root_before=%s root_after=%s archive_files=%s receipt=%s\n' \
  "$status" "$mode" "$before" "$after" "$archive_files" "$receipt"
exit "$exit_code"
