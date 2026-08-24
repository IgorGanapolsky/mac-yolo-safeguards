#!/bin/bash
# evals/check.sh — Evaluates agent test output against expected criteria
# Usage: ./evals/check.sh <eval_json_path> <result_json_path>

set -eo pipefail

EVAL_FILE="${1:-evals/sdlc-evals.json}"
RESULT_FILE="${2:-}"

if [ ! -f "$EVAL_FILE" ]; then
  echo "❌ Eval file not found: $EVAL_FILE" >&2
  exit 1
fi

node tools/agent-eval-runner.js --evals "$EVAL_FILE" ${RESULT_FILE:+--results "$RESULT_FILE"}
