#!/bin/bash
# dg-query.sh — Query the Dayglass server (or local SQLite) for real-time data.
#
# Usage:
#   dg-query.sh active-window   # Print "App — Title" of frontmost user window
#   dg-query.sh frame-stale     # Print seconds since last captured frame
#   dg-query.sh health          # Print Dayglass /api/health/mac JSON
#
# Falls back from HTTP API → dayglass-windowlist binary → nothing.
# Environment: DG_SERVER, DG_SQLITE, DG_QUERY_TIMEOUT (see sim-runaway-guard.sh).
set -euo pipefail

DG_SERVER="${DG_SERVER:-http://127.0.0.1:3333}"
DG_SQLITE="${DG_SQLITE:-$HOME/.dayglass/dayglass.sqlite}"
DG_QUERY_TIMEOUT="${DG_QUERY_TIMEOUT:-3}"

cmd="${1:-}"
case "$cmd" in
  active-window)
    # Prefer HTTP API, fall back to the local binary.
    if command -v curl >/dev/null 2>&1; then
      result=$(curl -s --max-time "$DG_QUERY_TIMEOUT" "$DG_SERVER/api/status" 2>/dev/null \
        | python3 -c '
import sys, json
try:
    d = json.load(sys.stdin)
    w = d.get("active_window") or {}
    app = (w.get("app_name") or "").strip()
    title = (w.get("window_title") or "").strip()
    if app:
        print(f"{app} — {title}" if title and title != app else app)
except Exception:
    pass
' 2>/dev/null)
      if [ -n "$result" ]; then
        printf '%s\n' "$result"
        exit 0
      fi
    fi
    # Fallback: dayglass-windowlist binary
    dg_bin="$HOME/.dayglass/bin/dayglass-windowlist"
    if [ -x "$dg_bin" ]; then
      "$dg_bin" 2>/dev/null | awk -F'\t' '
        NR > 1 {
          app=$1; title=$2
          if (app != "" && app != "Window Server" && app != "Dock" && app != "Finder" && app != "SecurityAgent") {
            print app (title != "" && title != app ? " — " title : "")
            exit
          }
        }'
      exit 0
    fi
    ;;
  frame-stale)
    if [ -f "$DG_SQLITE" ] && command -v sqlite3 >/dev/null 2>&1; then
      sqlite3 "$DG_SQLITE" 2>/dev/null <<'SQL'
.mode list
SELECT CAST((julianday('now') - julianday(last_seen_at)) * 86400 AS INTEGER)
FROM frames ORDER BY id DESC LIMIT 1;
SQL
      exit 0
    fi
    echo "0"
    ;;
  health)
    if command -v curl >/dev/null 2>&1; then
      curl -s --max-time "$DG_QUERY_TIMEOUT" "$DG_SERVER/api/health/mac" 2>/dev/null || echo '{"error":"dayglass server not reachable"}'
    else
      echo '{"error":"curl not available"}'
    fi
    ;;
  ""|help|-h|--help)
    echo "Usage: dg-query.sh {active-window|frame-stale|health}"
    echo "  active-window  — Print 'App — Title' of the frontmost user window"
    echo "  frame-stale    — Print seconds since the last captured frame"
    echo "  health         — Print Dayglass /api/health/mac JSON"
    exit 0
    ;;
  *)
    echo "Unknown command: $cmd" >&2
    echo "Usage: dg-query.sh {active-window|frame-stale|health}" >&2
    exit 1
    ;;
esac
