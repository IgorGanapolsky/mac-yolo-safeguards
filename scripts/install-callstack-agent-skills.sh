#!/usr/bin/env bash
# Install Callstack agent-skills into .cursor/skills for Cursor Agent.
# https://github.com/callstackincubator/agent-skills
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKILLS_ROOT="$ROOT/.cursor/skills"
VENDOR="$SKILLS_ROOT/callstack-agent-skills"
RULES_SRC="$VENDOR/.cursor/rules"
RULES_DST="$ROOT/.cursor/rules"
TARBALL_URL="https://github.com/callstackincubator/agent-skills/archive/refs/heads/main.tar.gz"

mkdir -p "$SKILLS_ROOT"

if [[ ! -d "$VENDOR/skills" ]]; then
  echo "=== Downloading callstackincubator/agent-skills ==="
  tmp="$(mktemp -d)"
  curl -fsL "$TARBALL_URL" | tar -xz -C "$tmp"
  rm -rf "$VENDOR"
  mv "$tmp/agent-skills-main" "$VENDOR"
  rm -rf "$tmp"
fi

echo "=== Linking skills into .cursor/skills/ ==="
for skill_dir in "$VENDOR/skills"/*; do
  name="$(basename "$skill_dir")"
  ln -sfn "callstack-agent-skills/skills/$name" "$SKILLS_ROOT/$name"
  echo "  linked $name"
done

if [[ -d "$RULES_SRC" ]]; then
  echo "=== Installing Cursor rules (.mdc) ==="
  mkdir -p "$RULES_DST"
  for rule in "$RULES_SRC"/*.mdc; do
    cp -f "$rule" "$RULES_DST/callstack-$(basename "$rule")"
  done
fi

echo "=== Done: Callstack agent-skills at $VENDOR ==="
echo "Skills: type / in Agent chat to invoke (e.g. react-native-best-practices)"

# agent-device CLI + skills (separate package: callstack/agent-device)
if [[ "${SKIP_AGENT_DEVICE:-0}" != "1" ]]; then
  echo "=== Also installing Callstack agent-device CLI ==="
  bash "$ROOT/scripts/install-agent-device.sh"
fi
