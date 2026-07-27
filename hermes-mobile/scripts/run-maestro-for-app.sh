#!/usr/bin/env bash
# Run an Android Maestro flow against one explicit application id.
#
# The source flow tree also serves iOS, whose bundle id remains
# com.iganapolsky.hermesmobile. To keep that shared tree intact, Android runs
# receive a temporary copy with every exact legacy appId declaration replaced.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HERMES_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_FLOW="${1:-}"
shift || true

TARGET_APP_ID="${HERMES_MOBILE_ANDROID_PACKAGE:-com.iganapolsky.hermesmobile.paid}"
SOURCE_ROOT="$HERMES_DIR/.maestro"

if [[ -z "$SOURCE_FLOW" ]]; then
  echo "Usage: $(basename "$0") <.maestro/flow.yaml> [maestro-test-options...]" >&2
  exit 2
fi

case "$TARGET_APP_ID" in
  *[!A-Za-z0-9._]*|'')
    echo "Invalid Android application id: $TARGET_APP_ID" >&2
    exit 2
    ;;
esac

if [[ "$SOURCE_FLOW" = /* ]]; then
  SOURCE_PATH="$SOURCE_FLOW"
else
  SOURCE_PATH="$HERMES_DIR/$SOURCE_FLOW"
fi

case "$SOURCE_PATH" in
  "$SOURCE_ROOT"/*.yaml) ;;
  *)
    echo "Flow must be a YAML file under $SOURCE_ROOT: $SOURCE_FLOW" >&2
    exit 2
    ;;
esac

if [[ ! -f "$SOURCE_PATH" ]]; then
  echo "Maestro flow not found: $SOURCE_PATH" >&2
  exit 2
fi

TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/hermes-maestro-app.XXXXXX")"
trap 'rm -rf "$TEMP_ROOT"' EXIT
cp -R "$SOURCE_ROOT/." "$TEMP_ROOT/"

TARGET_APP_ID="$TARGET_APP_ID" node - "$TEMP_ROOT" <<'NODE'
const fs = require('fs');
const path = require('path');

const root = process.argv[2];
const target = process.env.TARGET_APP_ID;
const legacyLine = /^appId: com\.iganapolsky\.hermesmobile$/gm;
let replacements = 0;

for (const entry of fs.readdirSync(root)) {
  if (!entry.endsWith('.yaml')) continue;
  const file = path.join(root, entry);
  const source = fs.readFileSync(file, 'utf8');
  const updated = source.replace(legacyLine, () => {
    replacements += 1;
    return `appId: ${target}`;
  });
  fs.writeFileSync(file, updated);
}

if (replacements === 0) {
  console.error('No Maestro appId declarations were parameterized.');
  process.exit(1);
}
console.log(`Maestro appId: ${target} (${replacements} flow declarations)`);
NODE

RELATIVE_FLOW="${SOURCE_PATH#"$SOURCE_ROOT"/}"
TEMP_FLOW="$TEMP_ROOT/$RELATIVE_FLOW"

if grep -R -n -E '^appId: com\.iganapolsky\.hermesmobile$' "$TEMP_ROOT" >/dev/null; then
  echo "Legacy free-package appId survived Android flow parameterization" >&2
  exit 1
fi

maestro test "$@" "$TEMP_FLOW"
