#!/usr/bin/env bash
# PreToolUse / pre-action spend gate (ERP-lite).
# Usage (stdin JSON optional):
#   echo '{"tool_name":"Bash","tool_input":{"command":"..."},"message":"..."}' | scripts/pretool-operator-spend-gate.sh
# Or:
#   HERMES_OPERATOR_MESSAGE="..." scripts/pretool-operator-spend-gate.sh --action "upgrade plan"
#
# Exit 0 ALLOW · 1 BLOCK · 2 error
# Never spends money. Logs to ~/.hermes/spend-ledger/commitments.jsonl

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="${ROOT}/tools/operator-spend-gate.js"
NODE_BIN="${NODE_BIN:-node}"

ACTION=""
MESSAGE="${HERMES_OPERATOR_MESSAGE:-${OPERATOR_MESSAGE:-}}"
JSON_OUT=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --action) ACTION="${2:-}"; shift 2 ;;
    --message) MESSAGE="${2:-}"; shift 2 ;;
    --json) JSON_OUT=1; shift ;;
    --help|-h)
      echo "Usage: pretool-operator-spend-gate.sh [--action TEXT] [--message TEXT] [--json]"
      exit 0
      ;;
    *) shift ;;
  esac
done

# If stdin has JSON, merge fields
if [[ ! -t 0 ]]; then
  INPUT="$(cat || true)"
  if [[ -n "${INPUT}" ]]; then
    PARSED="$(
      "$NODE_BIN" -e '
        let s=""; process.stdin.on("data",d=>s+=d); process.stdin.on("end",()=>{
          try {
            const j=JSON.parse(s||"{}");
            const tool=j.tool_name||j.toolName||"";
            const inp=typeof j.tool_input==="string"?j.tool_input:JSON.stringify(j.tool_input||j.toolInput||{});
            const msg=j.message||j.operatorMessage||j.user_message||"";
            const action=[tool,inp].filter(Boolean).join(" ");
            process.stdout.write(JSON.stringify({action, message: msg}));
          } catch { process.stdout.write(JSON.stringify({action:"",message:""})); }
        });
      ' <<<"$INPUT"
    )"
    if [[ -z "$ACTION" ]]; then
      ACTION="$(
        "$NODE_BIN" -e 'const j=JSON.parse(process.argv[1]); process.stdout.write(j.action||"")' "$PARSED"
      )"
    fi
    if [[ -z "$MESSAGE" ]]; then
      MESSAGE="$(
        "$NODE_BIN" -e 'const j=JSON.parse(process.argv[1]); process.stdout.write(j.message||"")' "$PARSED"
      )"
    fi
  fi
fi

ARGS=("$GATE" "check" "--action" "${ACTION}" "--message" "${MESSAGE}")
if [[ "$JSON_OUT" -eq 1 ]]; then ARGS+=(--json); fi
exec "$NODE_BIN" "${ARGS[@]}"
