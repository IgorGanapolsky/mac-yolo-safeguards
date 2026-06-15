#!/bin/sh
# Remove gitignored private ops artifacts from the repo ROOT only.
# Safe: never touches tracked files, example TSVs, or business_os/.
# Regenerate with revenue tools when needed (e.g. revenue-control-checks --date YYYY-MM-DD).
set -eu

REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"

before=0
deleted=0

for f in *; do
  [ -f "$f" ] || continue
  before=$((before + 1))
  if git check-ignore -q "$f"; then
    rm -f "$f"
    deleted=$((deleted + 1))
    printf 'removed %s\n' "$f"
  fi
done

after=0
for f in *; do
  [ -f "$f" ] && after=$((after + 1))
done

printf 'Private root cleanup: %d gitignored files removed (%d -> %d root files)\n' \
  "$deleted" "$before" "$after"
