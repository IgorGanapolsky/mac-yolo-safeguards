#!/usr/bin/env bash
# Install Callstack agent-device CLI + Cursor/Claude skills for Hermes Mobile.
# Upstream: https://github.com/callstack/agent-device
# Docs: https://oss.callstack.com/agent-device/docs/agent-setup
#
# Pins to the same major/minor as hermes-mobile/package.json (devDependency).
# Do NOT run `npx -y agent-device@latest` from agents — use this script or the
# project-local `./node_modules/.bin/agent-device` binary.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HM="$ROOT/hermes-mobile"
PIN="${AGENT_DEVICE_VERSION:-0.19.3}"
NPM_GLOBAL_BIN="${NPM_CONFIG_PREFIX:-$HOME/.npm-global}/bin"
SKILLS_ROOT="$ROOT/.cursor/skills"
MCP_EXAMPLE="$ROOT/.cursor/mcp.json.example"
MCP_LOCAL="$ROOT/.cursor/mcp.json"

echo "=== agent-device install (pin $PIN) ==="

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js required (agent-device needs Node 22+)." >&2
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "$NODE_MAJOR" -lt 22 ]]; then
  echo "ERROR: Node.js 22+ required (found $(node -v))." >&2
  exit 1
fi

# Prefer a stable global binary for agent terminals; also keep project-local.
echo "=== npm install -g agent-device@$PIN ==="
npm install -g "agent-device@$PIN"

export PATH="$NPM_GLOBAL_BIN:$PATH"
if ! command -v agent-device >/dev/null 2>&1; then
  # Common alternate prefixes
  for candidate in \
    "$HOME/.npm-global/bin/agent-device" \
    "$HOME/.local/bin/agent-device" \
    "/usr/local/bin/agent-device" \
    "/opt/homebrew/bin/agent-device"; do
    if [[ -x "$candidate" ]]; then
      export PATH="$(dirname "$candidate"):$PATH"
      break
    fi
  done
fi

AGENT_BIN="$(command -v agent-device || true)"
if [[ -z "$AGENT_BIN" ]]; then
  echo "ERROR: agent-device not on PATH after global install." >&2
  echo "Add $NPM_GLOBAL_BIN to PATH, then re-run." >&2
  exit 1
fi

echo "Binary: $AGENT_BIN"
"$AGENT_BIN" --version

# Project-local install when hermes-mobile node_modules exists / package.json pins it.
if [[ -f "$HM/package.json" ]]; then
  if ! rg -q '"agent-device"' "$HM/package.json"; then
    echo "WARN: hermes-mobile/package.json missing agent-device pin — skipping local npm install."
  elif [[ ! -x "$HM/node_modules/.bin/agent-device" ]]; then
    echo "=== hermes-mobile local npm install (agent-device) ==="
    (cd "$HM" && npm install --no-fund --no-audit)
  else
    echo "Local binary OK: $HM/node_modules/.bin/agent-device"
  fi
fi

# Cursor skills from the installed package (version-matched with CLI).
PKG_ROOT=""
if command -v npm >/dev/null 2>&1; then
  GROOT="$(npm root -g 2>/dev/null || true)"
  if [[ -n "$GROOT" && -d "$GROOT/agent-device/skills" ]]; then
    PKG_ROOT="$GROOT/agent-device"
  fi
fi
if [[ -z "$PKG_ROOT" && -x "$HM/node_modules/.bin/agent-device" ]]; then
  PKG_ROOT="$HM/node_modules/agent-device"
fi

mkdir -p "$SKILLS_ROOT"
if [[ -d "$PKG_ROOT/skills" ]]; then
  echo "=== Linking skills into .cursor/skills/ ==="
  for skill_dir in "$PKG_ROOT/skills"/*; do
    [[ -d "$skill_dir" ]] || continue
    name="$(basename "$skill_dir")"
    dest="$SKILLS_ROOT/$name"
    rm -rf "$dest"
    mkdir -p "$dest"
    cp -R "$skill_dir/." "$dest/"
    echo "  installed $name -> $dest"
  done
else
  echo "WARN: could not locate packaged skills under agent-device; CLI still usable."
fi

# Optional MCP: merge agent-device into .cursor/mcp.json when missing.
if [[ -f "$MCP_EXAMPLE" ]]; then
  if [[ ! -f "$MCP_LOCAL" ]]; then
    echo "=== Creating .cursor/mcp.json from example + agent-device ==="
    ROOT="$ROOT" AGENT_BIN="$AGENT_BIN" node <<'NODE'
const fs = require('fs');
const path = require('path');
const root = process.env.ROOT;
const example = JSON.parse(fs.readFileSync(path.join(root, '.cursor/mcp.json.example'), 'utf8'));
const bin = process.env.AGENT_BIN;
example.mcpServers = example.mcpServers || {};
example.mcpServers['agent-device'] = { command: bin, args: ['mcp'] };
fs.writeFileSync(path.join(root, '.cursor/mcp.json'), JSON.stringify(example, null, 2) + '\n');
console.log('Wrote .cursor/mcp.json with agent-device MCP (stdio).');
NODE
  elif ! rg -q '"agent-device"' "$MCP_LOCAL"; then
    echo "NOTE: .cursor/mcp.json exists without agent-device — add manually:"
    echo "  \"agent-device\": { \"command\": \"$AGENT_BIN\", \"args\": [\"mcp\"] }"
  else
    echo "MCP: agent-device already configured in .cursor/mcp.json"
  fi
fi

echo "=== agent-device doctor ==="
"$AGENT_BIN" doctor || {
  echo "WARN: doctor reported issues — fix device toolchain before dogfooding." >&2
}

echo "=== Done ==="
echo "Invoke: agent-device help workflow"
echo "Hermes proof: bash hermes-mobile/scripts/agent-device-connection-proof.sh"
echo "Matrix: hermes-mobile/docs/AGENT-DEVICE.md"
