#!/usr/bin/env bash
# scripts/handoff.sh — Sub-agent result transfer via handoff.json.
#
# Wraps tools/hermes-mobile-session-handoff.js into a simple CLI that any agent
# can use to write or read continuity state at the end/beginning of a session.
#
# Maps to HuggingFace Context Course Unit 4 (Sub-agents).
#
# Usage:
#   scripts/handoff.sh write  # prompts for goal + todos (or reads from stdin as JSON)
#   scripts/handoff.sh write --json '{"lastGoal":"fix X","openTodos":["a","b"]}'
#   scripts/handoff.sh read   # prints handoff JSON to stdout
#   scripts/handoff.sh status # shows if a handoff exists, age, goal
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HANDOFF_JS="$ROOT/tools/hermes-mobile-session-handoff.js"

if [[ ! -f "$HANDOFF_JS" ]]; then
  echo "ERROR: $HANDOFF_JS not found" >&2
  exit 2
fi

case "${1:-}" in
  read)
    node "$HANDOFF_JS" --read --json 2>/dev/null || {
      echo '{"ok": false, "error": "no session handoff on disk"}'
    }
    ;;

  status)
    if node "$HANDOFF_JS" --read --json >/tmp/handoff-status.$$ 2>/dev/null; then
      cat /tmp/handoff-status.$$
      echo
      rm -f /tmp/handoff-status.$$
    else
      echo '{"ok": false, "error": "no session handoff on disk", "exists": false}'
    fi
    ;;

  write)
    if [[ "${2:-}" == "--json" && "${3:-}" != "" ]]; then
      node "$HANDOFF_JS" --write --json "$3"
    elif [[ "${3:-}" == "--stdin" ]]; then
      node "$HANDOFF_JS" --write --stdin
    else
      # Interactive mode
      echo "Last goal (one sentence): "
      read -r last_goal
      echo "Open todos (one per line, empty line to finish): "
      todos="["
      first=true
      while true; do
        read -r todo
        if [[ -z "$todo" ]]; then
          break
        fi
        if [[ "$first" == "true" ]]; then
          todos+="\"$(echo "$todo" | sed 's/"/\\"/g')\""
          first=false
        else
          todos+=", \"$(echo "$todo" | sed 's/"/\\"/g')\""
        fi
      done
      todos+="]"
      node "$HANDOFF_JS" --write --json "{\"lastGoal\": \"$last_goal\", \"openTodos\": $todos, \"workspacePath\": \"$PWD\"}"
    fi
    ;;

  *)
    echo "Usage: $0 {write|read|status} [options]" >&2
    echo "  write --json '{\"lastGoal\":\"...\",\"openTodos\":[\"...\"]}'" >&2
    echo "  write --stdin  (JSON via stdin)" >&2
    echo "  read           (prints handoff JSON)" >&2
    echo "  status         (brief: exists? age? goal?)" >&2
    exit 2
    ;;
esac
