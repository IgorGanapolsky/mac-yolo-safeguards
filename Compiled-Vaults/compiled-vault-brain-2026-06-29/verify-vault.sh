#!/usr/bin/env bash

# Exit immediately if a command exits with a non-zero status
set -e

VAULT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "🔍 Validating Obsidian Vault structure at: ${VAULT_DIR}"

REQUIRED_DIRS=(
  "Declarative-Memory"
  "Procedural-Memory"
  "Source-Traces"
  "Context-Packs"
)

REQUIRED_FILES=(
  "Declarative-Memory/agents-directives.md"
  "Procedural-Memory/simulator-rescue.md"
  "Procedural-Memory/apk-release-safety.md"
  "Source-Traces/plan-snapshot.md"
  "Source-Traces/hermes-decisions.md"
  "Context-Packs/system-summary.md"
)

# 1. Check directories
for dir in "${REQUIRED_DIRS[@]}"; do
  if [ ! -d "${VAULT_DIR}/${dir}" ]; then
    echo "❌ Error: Required directory '${dir}' is missing!"
    exit 1
  fi
  echo "✅ Directory '${dir}' exists."
done

# 2. Check files
for file in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "${VAULT_DIR}/${file}" ]; then
    echo "❌ Error: Required file '${file}' is missing!"
    exit 1
  fi
  if [ ! -s "${VAULT_DIR}/${file}" ]; then
    echo "❌ Error: Required file '${file}' is empty!"
    exit 1
  fi
  echo "✅ File '${file}' exists and has content."
done

echo "🎉 Vault structure validation SUCCESSFUL!"
exit 0
