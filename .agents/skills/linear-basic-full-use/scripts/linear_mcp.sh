#!/usr/bin/env bash
# Linear remote MCP with PAT from ~/.config/linear/api_key (never from chat).
set -euo pipefail
KEY_FILE="${HOME}/.config/linear/api_key"
if [[ ! -f "$KEY_FILE" ]]; then
  echo "linear_mcp: missing $KEY_FILE" >&2
  exit 1
fi
KEY="$(tr -d '[:space:]' < "$KEY_FILE")"
if [[ -z "$KEY" ]]; then
  echo "linear_mcp: empty PAT" >&2
  exit 1
fi
exec npx -y mcp-remote https://mcp.linear.app/mcp --header "Authorization: Bearer ${KEY}"
