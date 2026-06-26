#!/usr/bin/env bash
# Install Hermes Goal Cell runtime locally and on peer Macs.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node_bin="$(command -v node)"
objective="Make one verified revenue action today for the AI Automation Workflow Reliability Diagnostic."
template="money"
remote_hosts=()
local_only=0

usage() {
  cat <<'EOF'
Usage:
  bash scripts/install-hermes-goal-cells.sh [--objective TEXT] [--template money|diagnostic|runtime|content] [--remote HOST ...] [--local-only]

Installs the Andrew-Ng-style Hermes Goal Cell primitive:
one goal, one source pack, a 1-10 high-context team, <=5 actions,
one verifier, and a ThumbGate side-effect boundary.
EOF
}

while (($#)); do
  case "$1" in
    --objective)
      shift
      [[ $# -gt 0 ]] || { echo "--objective requires text" >&2; exit 2; }
      objective="$1"
      ;;
    --template)
      shift
      [[ $# -gt 0 ]] || { echo "--template requires a value" >&2; exit 2; }
      template="$1"
      ;;
    --remote)
      shift
      [[ $# -gt 0 ]] || { echo "--remote requires a host" >&2; exit 2; }
      remote_hosts+=("$1")
      ;;
    --local-only)
      local_only=1
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
  shift
done

if [[ -z "${node_bin}" ]]; then
  echo "node not found in PATH" >&2
  exit 1
fi

install_local() {
  mkdir -p "${HOME}/.hermes/bin" "${HOME}/.hermes/goal-cells"
  cp "${repo_root}/tools/hermes-goal-cells.js" "${HOME}/.hermes/bin/hermes-goal-cells.js"
  chmod +x "${HOME}/.hermes/bin/hermes-goal-cells.js"
  "${node_bin}" "${HOME}/.hermes/bin/hermes-goal-cells.js" --apply --json --template "${template}" --objective "${objective}" \
    | node -e 'let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { const j = JSON.parse(s); console.log(JSON.stringify({id:j.id, sourcePackKey:j.sourcePackKey, teamSize:j.teamSize, maxActions:j.maxActions, sourcePackFound:j.sourcePackFound}, null, 2)); });'
  echo "local: Hermes Goal Cell installed"
}

install_remote() {
  local host="$1"
  local remote_home
  local remote_node
  remote_home="$(ssh -o BatchMode=yes -o ConnectTimeout=8 "${host}" 'printf "%s" "$HOME"')"
  remote_node="$(ssh -o BatchMode=yes -o ConnectTimeout=8 "${host}" 'command -v node')"
  if [[ -z "${remote_node}" ]]; then
    echo "${host}: node not found; cannot install goal cells" >&2
    return 1
  fi
  ssh -o BatchMode=yes -o ConnectTimeout=8 "${host}" 'mkdir -p ~/.hermes/bin ~/.hermes/goal-cells'
  rsync -a "${repo_root}/tools/hermes-goal-cells.js" "${host}:${remote_home}/.hermes/bin/hermes-goal-cells.js"
  ssh -o BatchMode=yes -o ConnectTimeout=8 "${host}" "chmod +x '${remote_home}/.hermes/bin/hermes-goal-cells.js' && '${remote_node}' '${remote_home}/.hermes/bin/hermes-goal-cells.js' --apply --json --template '${template}' --objective '${objective}'" \
    | node -e 'let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => { const j = JSON.parse(s); console.log(JSON.stringify({id:j.id, sourcePackKey:j.sourcePackKey, teamSize:j.teamSize, maxActions:j.maxActions, sourcePackFound:j.sourcePackFound}, null, 2)); });'
  echo "${host}: Hermes Goal Cell installed"
}

install_local

if (( local_only == 0 )); then
  if ((${#remote_hosts[@]} == 0)); then
    remote_hosts=(macmini)
  fi
  for host in "${remote_hosts[@]}"; do
    if ssh -o BatchMode=yes -o ConnectTimeout=8 "${host}" 'hostname >/dev/null' 2>/dev/null; then
      install_remote "${host}"
    else
      echo "${host}: unreachable; local Goal Cell still installed" >&2
    fi
  done
fi
