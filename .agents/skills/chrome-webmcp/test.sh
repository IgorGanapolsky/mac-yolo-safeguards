#!/usr/bin/env bash
set -euo pipefail

skill_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
python3 "$skill_dir/scripts/test_manifest_lint.py"
node "$skill_dir/scripts/test_webmcp_kit.mjs"
python3 "$skill_dir/scripts/lint_webmcp_manifest.py" "$skill_dir/assets/manifest.example.json" --static-only
bash -n "$skill_dir/scripts/sync_agent_homes.sh"
