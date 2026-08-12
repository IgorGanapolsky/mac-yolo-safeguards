#!/bin/bash
# LaunchAgent entry — never read ~/Documents (TCC). Vault write still targeted by script via HOME path.
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export HOME="/Users/igorganapolsky"
cd /tmp || true
export LINEAR_API_KEY="$(/usr/bin/security find-generic-password -s LINEAR_API_KEY -w 2>/dev/null || true)"
if [ -z "${LINEAR_API_KEY:-}" ] && [ -f "$HOME/.config/linear/api_key" ]; then
  LINEAR_API_KEY="$(/bin/cat "$HOME/.config/linear/api_key" 2>/dev/null || true)"
  export LINEAR_API_KEY
fi
SCRIPT="/Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards/tools/hilltown_triple_bus_drift.py"
exec /opt/homebrew/bin/python3 "$SCRIPT" --ensure-project --quiet
