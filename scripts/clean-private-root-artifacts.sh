#!/bin/sh
# Remove gitignored private ops artifacts from repo ROOT (legacy) and report ops dir size.
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

ops_count=0
if [ -d business_os/revenue ]; then
  ops_count="$(find business_os/revenue -maxdepth 1 -type f | wc -l | tr -d ' ')"
fi

printf 'Private root cleanup: %d gitignored files removed (%d -> %d root files); business_os/revenue has %s files\n' \
  "$deleted" "$before" "$after" "$ops_count"
