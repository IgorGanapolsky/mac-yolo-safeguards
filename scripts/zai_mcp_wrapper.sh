#!/usr/bin/env bash
# Launch Z.ai Vision MCP (@z_ai/mcp-server) using Z_AI_API_KEY from the environment
# or ~/.hermes/.env (written by scripts/setup_zai_coding_plan.sh).
set -euo pipefail

HERMES_ENV="${HERMES_HOME:-$HOME/.hermes}/.env"
if [[ -z "${Z_AI_API_KEY:-}" && -f "$HERMES_ENV" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$HERMES_ENV"
  set +a
fi

if [[ -z "${Z_AI_API_KEY:-}" ]]; then
  echo "Z_AI_API_KEY is not set. Run: export Z_AI_API_KEY=<key> && ./scripts/setup_zai_coding_plan.sh" >&2
  exit 1
fi

export Z_AI_MODE="${Z_AI_MODE:-ZAI}"
exec npx -y @z_ai/mcp-server
