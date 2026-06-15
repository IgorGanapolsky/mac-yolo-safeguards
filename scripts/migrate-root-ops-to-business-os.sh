#!/bin/sh
# Move legacy private ops *.md / *.tsv from repo root into business_os/revenue/.
set -eu

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$REPO/business_os/revenue"
cd "$REPO"

mkdir -p "$DEST"
moved=0

for f in *.md *.tsv; do
  [ -f "$f" ] || continue
  if git check-ignore -q "$f"; then
    dest="$DEST/$f"
    if [ -e "$dest" ]; then
      rm -f "$f"
      printf 'removed duplicate root %s (already in business_os/revenue)\n' "$f"
    else
      mv "$f" "$dest"
      printf 'moved %s -> business_os/revenue/\n' "$f"
    fi
    moved=$((moved + 1))
  fi
done

printf 'Ops migration: %d root artifact(s) relocated or removed\n' "$moved"
