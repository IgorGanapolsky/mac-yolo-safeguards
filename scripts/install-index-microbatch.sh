#!/usr/bin/env bash
# Compatibility entrypoint. One installer and one LaunchAgent own grepai.
set -euo pipefail

repo_root="${HERMES_REPO:-$(cd "$(dirname "$0")/.." && pwd)}"
export HERMES_RECONCILER_REPO="${HERMES_RECONCILER_REPO:-$repo_root}"
exec bash "$repo_root/tools/install-fleet-repo-intelligence.sh"
