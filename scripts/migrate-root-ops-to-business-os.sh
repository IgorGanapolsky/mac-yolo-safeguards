#!/bin/sh
# Move legacy private ops *.md / *.tsv from repo root into the private ops dir.
set -eu
umask 077

REPO="${MAC_YOLO_REPO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
DEST="${MAC_YOLO_OPS_DIR:-$REPO/business_os/revenue}"
cd "$REPO"

mkdir -p "$DEST"
chmod 700 "$DEST"
moved=0
duplicates=0
blocked=0

for f in *.md *.tsv; do
  [ -f "$f" ] || continue
  if git check-ignore -q "$f"; then
    dest="$DEST/$f"
    if [ -e "$dest" ]; then
      if cmp -s "$f" "$dest"; then
        rm -f "$f"
        chmod 600 "$dest"
        duplicates=$((duplicates + 1))
      else
        printf 'BLOCKED divergent root artifact: %s\n' "$f" >&2
        blocked=$((blocked + 1))
      fi
    else
      mv "$f" "$dest"
      chmod 600 "$dest"
      moved=$((moved + 1))
    fi
  fi
done

printf 'Ops migration: moved=%d exact_duplicates=%d blocked=%d\n' "$moved" "$duplicates" "$blocked"

if [ "$blocked" -gt 0 ]; then
  exit 2
fi
