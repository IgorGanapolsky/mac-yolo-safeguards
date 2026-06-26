#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

platform="${1:-android}"
output_dir="${HERMES_BUNDLE_EXPORT_DIR:-$repo_root/.bundle-export}"
max_kb="${HERMES_BUNDLE_MAX_KB:-8192}"

echo "Analyzing Hermes Mobile JS bundle (platform=$platform, max=${max_kb}KB)..."

rm -rf "$output_dir"
mkdir -p "$output_dir"

npx expo export --platform "$platform" --output-dir "$output_dir" --dump-sourcemap 2>&1

bundle_path=""
for candidate in \
  "$output_dir/_expo/static/js/$platform/"*.hbc \
  "$output_dir/_expo/static/js/$platform/index.js" \
  "$output_dir/bundles/$platform-"*.js; do
  if compgen -G "$candidate" > /dev/null; then
    bundle_path="$(ls $candidate 2>/dev/null | head -1)"
    break
  fi
done

if [[ -z "$bundle_path" || ! -f "$bundle_path" ]]; then
  bundle_path="$(find "$output_dir" \( -name '*.hbc' -o -name 'index.js' \) -not -path '*/node_modules/*' | head -1)"
fi

if [[ -z "$bundle_path" || ! -f "$bundle_path" ]]; then
  echo "Could not locate exported bundle under $output_dir" >&2
  exit 1
fi

bundle_kb=$(( ($(stat -f%z "$bundle_path" 2>/dev/null || stat -c%s "$bundle_path") + 1023) / 1024 ))
echo "Bundle: $bundle_path (${bundle_kb}KB)"

map_file="${bundle_path}.map"
if [[ -f "$map_file" ]]; then
  echo ""
  echo "Top modules (source-map-explorer):"
  npx source-map-explorer "$bundle_path" "$map_file" --gzip --only-mapped 2>/dev/null | head -40 || true
fi

if (( bundle_kb > max_kb )); then
  echo "FAIL: bundle ${bundle_kb}KB exceeds budget ${max_kb}KB (set HERMES_BUNDLE_MAX_KB to override)" >&2
  exit 1
fi

echo "Bundle size OK (${bundle_kb}KB <= ${max_kb}KB)"
