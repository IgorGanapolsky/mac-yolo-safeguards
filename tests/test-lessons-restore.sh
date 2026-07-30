#!/usr/bin/env bash
# Tests for tools/restore-lessons-memory-log.js — the lessons-store restore path.
# Runs the real July-26 sqlite backup through the transform into a temp dir and
# asserts the store round-trips. The live store and the backup are never touched.
# Override the backup with LESSONS_BACKUP=<path> (a missing backup fails loudly:
# a restore path you cannot exercise is exactly the silent gap that caused the
# 3-day empty-store incident).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
TOOL="$HERE/../tools/restore-lessons-memory-log.js"
BACKUP="${LESSONS_BACKUP:-$HOME/thumbgate-backup-20260726/dot-thumbgate/lessons.sqlite}"
KNOWN_ID="mem_1781185737558_rxfqv1"
KNOWN_TITLE="MISTAKE: ran rm on .env never delete .env files"
ROOT="$(mktemp -d)"; trap 'rm -rf "$ROOT"' EXIT
pass=0; fail=0
ok(){ echo "  [PASS] $1"; pass=$((pass+1)); }
no(){ echo "  [FAIL] $1"; fail=$((fail+1)); }

if [ ! -f "$BACKUP" ]; then
  echo "  [FAIL] lessons backup not found at $BACKUP — restore path is UNVERIFIED" >&2
  exit 1
fi

# 1: --dry-run prints summary + first 2 lines and writes nothing
out="$(node "$TOOL" --backup "$BACKUP" --out "$ROOT/dry.jsonl" --dry-run)" || { no "--dry-run exits 0"; }
{ echo "$out" | grep -q "DRY RUN" && echo "$out" | grep -q "27 sqlite lessons" \
  && [ "$(echo "$out" | grep -c '^  {')" = 2 ] && [ ! -e "$ROOT/dry.jsonl" ]; } \
  && ok "--dry-run prints summary + 2 lines, writes nothing" || no "--dry-run behavior"

# 2: no --out defaults to dry-run (nothing written anywhere)
out="$(cd "$ROOT" && node "$TOOL" --backup "$BACKUP")" || { no "default run exits 0"; }
{ echo "$out" | grep -q "DRY RUN" && [ -z "$(find "$ROOT" -name '*.jsonl')" ]; } \
  && ok "default (no --out) is a dry run" || no "default dry-run behavior"

# 3: real restore produces exactly 27 records
node "$TOOL" --backup "$BACKUP" --out "$ROOT/memory-log.jsonl" >/dev/null \
  && [ "$(wc -l < "$ROOT/memory-log.jsonl" | tr -d ' ')" = 27 ] \
  && ok "restore writes 27 records" || no "restore record count"

# 4: every record has non-empty title+content and category error|learning
node -e '
const fs = require("fs");
const lines = fs.readFileSync(process.argv[1], "utf8").trim().split("\n");
for (const line of lines) {
  const r = JSON.parse(line);
  if (!r.title || !r.content) throw new Error(`empty title/content on ${r.id}`);
  if (r.category !== "error" && r.category !== "learning") throw new Error(`bad category ${r.category} on ${r.id}`);
}
' "$ROOT/memory-log.jsonl" \
  && ok "every record has title, content, and category error|learning" || no "record field integrity"

# 5: the known rm-on-.env lesson round-trips with its title intact
node -e '
const fs = require("fs");
const rec = fs.readFileSync(process.argv[1], "utf8").trim().split("\n")
  .map(JSON.parse).find((r) => r.id === process.argv[2]);
if (!rec) throw new Error("known id missing");
if (rec.title !== process.argv[3]) throw new Error(`title drifted: ${rec.title}`);
if (rec.category !== "error") throw new Error(`category drifted: ${rec.category}`);
' "$ROOT/memory-log.jsonl" "$KNOWN_ID" "$KNOWN_TITLE" \
  && ok "known lesson $KNOWN_ID round-trips with title intact" || no "known-lesson round-trip"

# 6: refuses to overwrite an existing store
before="$(shasum -a 256 "$ROOT/memory-log.jsonl")"
if node "$TOOL" --backup "$BACKUP" --out "$ROOT/memory-log.jsonl" >/dev/null 2>"$ROOT/err6"; then
  no "overwrite refused"
else
  { grep -q "refusing to overwrite" "$ROOT/err6" && [ "$(shasum -a 256 "$ROOT/memory-log.jsonl")" = "$before" ]; } \
    && ok "refuses to overwrite an existing store" || no "overwrite refusal message/immutability"
fi

# 7: nonexistent backup fails loudly and writes nothing
if node "$TOOL" --backup "$ROOT/nope.sqlite" --out "$ROOT/x.jsonl" >/dev/null 2>"$ROOT/err7"; then
  no "missing backup rejected"
else
  { grep -q "backup not found" "$ROOT/err7" && [ ! -e "$ROOT/x.jsonl" ]; } \
    && ok "missing backup fails loudly, writes nothing" || no "missing-backup error"
fi

# 8: an empty lessons table is refused (never silently restore an empty store)
sqlite3 "$ROOT/empty.sqlite" "CREATE TABLE lessons (
  id TEXT PRIMARY KEY, signal TEXT NOT NULL, context TEXT, whatWentWrong TEXT,
  whatToChange TEXT, whatWorked TEXT, domain TEXT, tags TEXT, rootCause TEXT,
  importance TEXT, skill TEXT, timestamp TEXT NOT NULL, sourceFeedbackId TEXT,
  pruned INTEGER DEFAULT 0);"
if node "$TOOL" --backup "$ROOT/empty.sqlite" --out "$ROOT/y.jsonl" >/dev/null 2>"$ROOT/err8"; then
  no "empty backup rejected"
else
  { grep -q "0 lessons rows" "$ROOT/err8" && [ ! -e "$ROOT/y.jsonl" ]; } \
    && ok "empty backup refused (never restore an empty store)" || no "empty-backup refusal"
fi

echo "lessons-restore tests: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
