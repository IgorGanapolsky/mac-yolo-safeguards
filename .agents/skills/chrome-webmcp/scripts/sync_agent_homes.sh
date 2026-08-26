#!/usr/bin/env bash
set -euo pipefail

source_dir="${1:-$HOME/.agents/skills/chrome-webmcp}"
required=(
  "SKILL.md"
  "skill-card.md"
  "test.sh"
  "assets/webmcp-kit.js"
  "scripts/lint_webmcp_manifest.py"
  "scripts/probe_webmcp.py"
  "scripts/test_manifest_lint.py"
  "scripts/test_webmcp_kit.mjs"
)
for relative_path in "${required[@]}"; do
  if [[ ! -f "$source_dir/$relative_path" ]]; then
    echo "ERROR: incomplete source skill; missing $relative_path in $source_dir" >&2
    exit 1
  fi
done

targets=(
  "$HOME/.claude/skills/chrome-webmcp"
  "$HOME/.codex/skills/chrome-webmcp"
  "$HOME/.gemini/skills/chrome-webmcp"
  "$HOME/.copilot/skills/chrome-webmcp"
  "$HOME/.cursor/skills/chrome-webmcp"
  "$HOME/.config/opencode/skills/chrome-webmcp"
  "$HOME/.codeium/windsurf/skills/chrome-webmcp"
  "$HOME/.grok/skills/chrome-webmcp"
)

for target in "${targets[@]}"; do
  mkdir -p "$target"
  rsync -a --delete --exclude '__pycache__/' "$source_dir/" "$target/"
  echo "SYNCED $target"
done
