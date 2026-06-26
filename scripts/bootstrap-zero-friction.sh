#!/usr/bin/env bash
# One-shot: local agent jobs + session brief + Hermes phone pairing page.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

echo "=== 0/5 Callstack agent-skills (RN perf, GitHub, upgrades) ==="
bash scripts/install-callstack-agent-skills.sh

echo ""
echo "=== 1/5 LaunchAgents (CEO brief, newsletter, Hermes scan, sim guard) ==="
bash scripts/install-agent-automations.sh

echo ""
echo "=== 2/5 Agent session start (DS/ML/RAG brief) ==="
node tools/agent-session-start.js

echo ""
echo "=== 3/5 Hermes Mobile pairing (QR + adb — no phone typing) ==="
if curl -sf http://127.0.0.1:8642/health >/dev/null 2>&1; then
  node tools/hermes-mobile-pair.js --open
else
  echo "Gateway down — skip pair page. Start Hermes gateway then: bash scripts/pair-hermes-phone.sh"
fi

echo ""
echo "=== 4/5 Cursor Cloud Automations ==="
bash scripts/import-cursor-automations.sh
echo ""
echo "=== Cursor Cloud Automations (agent backlog) ==="
bash scripts/import-cursor-automations.sh
echo "Cloud automations: YAML committed in .cursor/automations/ — agent imports via Agents /automate when editor API available."
