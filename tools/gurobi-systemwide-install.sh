#!/usr/bin/env bash
# System-wide Gurobi (gurobipy) install for Igor's Mac fleet.
# AE Fabrizio Ellis 2026-08-12: free pip first; full trial when size-limited.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="${GUROBI_VENV:-$HOME/.hermes/gurobi-venv}"
DEST="${GUROBI_HOME:-$HOME/.hermes/gurobi}"
LOCAL_BIN="${HOME}/.local/bin"
PY_CANDIDATES=(
  /opt/homebrew/bin/python3.14
  /opt/homebrew/bin/python3.13
  /opt/homebrew/bin/python3.12
  /opt/homebrew/bin/python3
  python3
)

pick_python() {
  local c
  for c in "${PY_CANDIDATES[@]}"; do
    if command -v "$c" >/dev/null 2>&1 || [[ -x "$c" ]]; then
      if "$c" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
        echo "$c"
        return 0
      fi
    fi
  done
  echo "python3"
}

BASE_PY="$(pick_python)"
mkdir -p "$DEST/bin" "$DEST/evals" "$DEST/logs" "$LOCAL_BIN"

if [[ ! -x "$VENV/bin/python" ]]; then
  echo "[gurobi-install] creating venv at $VENV with $BASE_PY"
  "$BASE_PY" -m venv "$VENV"
fi

# shellcheck disable=SC1091
source "$VENV/bin/activate"
python -m pip install --upgrade pip wheel setuptools >/dev/null
python -m pip install --upgrade 'gurobipy>=13.0.0'

# Sync fleet library + CLI + MCP into durable home install (independent of worktree)
install -m 0644 "$ROOT/tools/gurobi_fleet_lib.py" "$DEST/gurobi_fleet_lib.py"
install -m 0755 "$ROOT/tools/gurobi-fleet-optimize.py" "$DEST/gurobi-fleet-optimize.py"
install -m 0755 "$ROOT/tools/gurobi-mcp-server.py" "$DEST/gurobi-mcp-server.py"

cat >"$DEST/bin/gurobi-fleet" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
export PYTHONPATH="$HOME/.hermes/gurobi${PYTHONPATH:+:$PYTHONPATH}"
exec "$HOME/.hermes/gurobi-venv/bin/python" "$HOME/.hermes/gurobi/gurobi-fleet-optimize.py" "$@"
EOF
cat >"$DEST/bin/gurobi-mcp" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
export PYTHONPATH="$HOME/.hermes/gurobi${PYTHONPATH:+:$PYTHONPATH}"
exec "$HOME/.hermes/gurobi-venv/bin/python" "$HOME/.hermes/gurobi/gurobi-mcp-server.py" "$@"
EOF
chmod +x "$DEST/bin/gurobi-fleet" "$DEST/bin/gurobi-mcp"

ln -sfn "$DEST/bin/gurobi-fleet" "$LOCAL_BIN/gurobi-fleet"
ln -sfn "$DEST/bin/gurobi-mcp" "$LOCAL_BIN/gurobi-mcp"
ln -sfn "$VENV/bin/python" "$LOCAL_BIN/gurobi-python"

cat >"$DEST/env.sh" <<'EOF'
# Gurobi system-wide (pip gurobipy size-limited free license)
export GUROBI_VENV="$HOME/.hermes/gurobi-venv"
export GUROBI_HOME="$HOME/.hermes/gurobi"
export PATH="$HOME/.hermes/gurobi/bin:$HOME/.local/bin:$PATH"
export PYTHONPATH="$HOME/.hermes/gurobi${PYTHONPATH:+:$PYTHONPATH}"
alias gurobi-eval='gurobi-fleet evaluate --json'
EOF

# Idempotent zshrc hook
ZSHRC="${HOME}/.zshrc"
HOOK='[ -f "$HOME/.hermes/gurobi/env.sh" ] && source "$HOME/.hermes/gurobi/env.sh"'
if [[ -f "$ZSHRC" ]] && ! grep -Fq 'hermes/gurobi/env.sh' "$ZSHRC"; then
  printf '\n# Gurobi fleet (system-wide, 2026-08-12)\n%s\n' "$HOOK" >>"$ZSHRC"
  echo "[gurobi-install] appended env hook to ~/.zshrc"
fi

# Global Grok skill mirror (agents load ~/.grok/skills)
GROK_SKILL="${HOME}/.grok/skills/gurobi-optimizer-integrator"
if [[ -d "$ROOT/.agents/skills/gurobi-optimizer-integrator" ]]; then
  mkdir -p "$GROK_SKILL"
  cp -f "$ROOT/.agents/skills/gurobi-optimizer-integrator/SKILL.md" "$GROK_SKILL/SKILL.md"
fi

# Repo-local bins stay worktree-relative for in-repo agents
chmod +x "$ROOT/bin/gurobi-fleet" "$ROOT/bin/gurobi-mcp" 2>/dev/null || true

echo "[gurobi-install] running evaluation suite..."
export PYTHONPATH="$DEST${PYTHONPATH:+:$PYTHONPATH}"
EVAL_OUT="$DEST/evals/latest.json"
"$VENV/bin/python" "$DEST/gurobi-fleet-optimize.py" evaluate --json | tee "$EVAL_OUT"
ok="$("$VENV/bin/python" -c 'import json,sys; print(json.load(open(sys.argv[1])).get("ok"))' "$EVAL_OUT")"
if [[ "$ok" != "True" && "$ok" != "true" ]]; then
  echo "[gurobi-install] EVAL FAILED" >&2
  exit 1
fi

echo "[gurobi-install] OK"
echo "  venv:    $VENV"
echo "  home:    $DEST"
echo "  PATH:    $LOCAL_BIN/gurobi-fleet → $DEST/bin/gurobi-fleet"
echo "  MCP:     $DEST/bin/gurobi-mcp"
echo "  eval:    $EVAL_OUT"
