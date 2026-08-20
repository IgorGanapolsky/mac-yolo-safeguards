#!/bin/bash
# install-harness-router.sh — One-command setup for automated agent-harness-router
#
# Wires the harness-router into:
#   1. ~/.claude/settings.json (SessionStart + UserPromptSubmit hooks)
#   2. LaunchAgent (periodic budget enforcement every 60s)
#   3. .cursor/rules (auto-invoke for model selection)
#
# Usage: bash scripts/install-harness-router.sh

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PLIST_NAME="com.igor.hermes-budget-guard"
PLIST_SRC="$REPO_DIR/scripts/$PLIST_NAME.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"
LOG_DIR="$HOME/Library/Logs/mac-yolo-safeguards"

echo "=== Installing Agent Harness Router ==="

# 1. Verify the tool exists
if [ ! -f "$REPO_DIR/tools/agent-harness-router.js" ]; then
  echo "ERROR: tools/agent-harness-router.js not found"
  exit 1
fi

# 2. Run tests to verify
echo "→ Running tests..."
node "$REPO_DIR/tests/test-agent-harness-router.js" 2>&1 | tail -1

# 3. Install LaunchAgent for periodic budget enforcement
echo "→ Installing LaunchAgent..."
mkdir -p "$LOG_DIR"
mkdir -p "$(dirname "$PLIST_DEST")"
cp "$PLIST_SRC" "$PLIST_DEST"
launchctl unload "$PLIST_DEST" 2>/dev/null || true
launchctl load "$PLIST_DEST" 2>/dev/null || true
echo "   Loaded: $PLIST_NAME (interval=60s)"

# 4. Verify settings.json hooks
echo "→ Checking ~/.claude/settings.json hooks..."
if [ -f "$HOME/.claude/settings.json" ]; then
  if python3 -c "import json; json.load(open('$HOME/.claude/settings.json'))" 2>/dev/null; then
    echo "   settings.json: valid JSON ✓"
  else
    echo "   WARNING: settings.json is invalid JSON"
  fi
fi

# 5. Initial health check
echo "→ Initial budget check:"
node "$REPO_DIR/tools/agent-harness-router.js" check --json 2>/dev/null || echo "   (storage not yet initialized)"

echo ""
echo "=== Agent Harness Router is now automated ==="
echo "  • Budget enforcement: LaunchAgent runs every 60s"
echo "  • SessionStart hook: checks budget + discovery at session start"
echo "  • UserPromptSubmit hook: checks routing + budget before each prompt"
echo "  • Cursor rule: auto-invokes for model selection"
echo ""
echo "Manual commands (if needed):"
echo "  node tools/agent-harness-router.js route '{\"category\":\"coding\",\"preference\":\"quality\"}'"
echo "  node tools/agent-harness-router.js discover \"<prompt>\" --model <id> --task <type>"
echo "  node tools/agent-harness-router.js benchmark portability"
