#!/usr/bin/env bash
# Install fleet xurl skill override: OAuth completion is Mac-agent work (terminal+browser),
# never phone-user terminal homework. Local ~/.hermes/skills takes precedence over bundled.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${REPO_ROOT}/hermes-local-skills/social-media/xurl/SKILL.md"
DEST="${HOME}/.hermes/skills/social-media/xurl/SKILL.md"

if [[ ! -f "${SRC}" ]]; then
  echo "missing source: ${SRC}" >&2
  exit 1
fi

mkdir -p "$(dirname "${DEST}")"
cp "${SRC}" "${DEST}"
chmod 644 "${DEST}"
echo "installed ${DEST}"
