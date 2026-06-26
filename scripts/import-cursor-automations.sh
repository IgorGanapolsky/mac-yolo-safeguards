#!/usr/bin/env bash
# Lists Cursor Automation YAML drafts and prints import steps (no cloud API from shell).
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dir="${repo_root}/.cursor/automations"

if [[ ! -d "$dir" ]]; then
  echo "No .cursor/automations/ directory" >&2
  exit 1
fi

echo "Cursor Automation drafts in ${dir}:"
for f in "$dir"/*.yaml "$dir"/*.yml; do
  [[ -f "$f" ]] || continue
  echo "  - $(basename "$f")"
done

echo ""
echo "Agent backlog: import via Cursor /automate or Agents editor when API available."
echo "Local Mac jobs: bash scripts/install-agent-automations.sh"
