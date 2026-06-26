#!/usr/bin/env bash
# Wire Z.ai GLM Coding Plan into Hermes (Remote Mac chat) + ~/.hermes/.env for MCP wrapper.
# Requires Z_AI_API_KEY in the environment (create at https://z.ai → API Keys).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
ENV_FILE="${HERMES_HOME}/.env"
MARKER="# --- zai-coding-glm (managed by mac-yolo-safeguards) ---"
PROVIDER="zai-coding-glm"
CODING_BASE="https://api.z.ai/api/coding/paas/v4"

if [[ -z "${Z_AI_API_KEY:-}" ]]; then
  echo "Set Z_AI_API_KEY first (Z.ai dashboard → API Keys), then re-run:" >&2
  echo "  export Z_AI_API_KEY='your-key'" >&2
  echo "  $ROOT/scripts/setup_zai_coding_plan.sh" >&2
  exit 1
fi

if ! command -v hermes >/dev/null 2>&1; then
  echo "hermes CLI not found — install Hermes Agent first." >&2
  exit 1
fi

mkdir -p "$HERMES_HOME"

if [[ -f "$ENV_FILE" ]] && grep -q '^Z_AI_API_KEY=' "$ENV_FILE"; then
  echo "Z_AI_API_KEY already present in $ENV_FILE (not overwriting)."
else
  {
    echo ""
    echo "$MARKER"
    echo "Z_AI_API_KEY=${Z_AI_API_KEY}"
  } >>"$ENV_FILE"
  echo "Added Z_AI_API_KEY to $ENV_FILE"
fi

hermes config set "providers.${PROVIDER}.name" "Z.ai GLM Coding Plan"
hermes config set "providers.${PROVIDER}.api" "$CODING_BASE"
hermes config set "providers.${PROVIDER}.base_url" "$CODING_BASE"
hermes config set "providers.${PROVIDER}.transport" "chat_completions"
hermes config set "providers.${PROVIDER}.default_model" "glm-5.2"
hermes config set "providers.${PROVIDER}.model" "glm-5.2"
hermes config set "providers.${PROVIDER}.context_length" "1000000"
hermes config set "providers.${PROVIDER}.discover_models" "true"
hermes config set "providers.${PROVIDER}.api_key" "env:Z_AI_API_KEY"

chmod +x "$ROOT/scripts/zai_mcp_wrapper.sh"

echo ""
echo "Hermes provider ${PROVIDER} configured."
echo ""
echo "Optional — use GLM on Remote Mac chat (Hermes Mobile):"
echo "  hermes config set model.provider custom:${PROVIDER}"
echo "  hermes config set model.default glm-5.2"
echo "  # restart Hermes gateway after changing default model"
echo ""
echo "Cursor IDE (GLM Coding Plan quota):"
echo "  Models → Add custom model → OpenAI protocol"
echo "  Base URL: $CODING_BASE"
echo "  Model name: GLM-5.2 (uppercase in Cursor)"
echo ""
echo "Cursor MCP (Vision / UI diff / screenshot OCR):"
echo "  Reload Cursor — project .cursor/mcp.json launches zai-vision via scripts/zai_mcp_wrapper.sh"
echo ""
echo "For web-search + web-reader MCP, copy headers from .cursor/mcp.json.example into ~/.cursor/mcp.json"
