#!/usr/bin/env bash
# Persist browser.cdp_url so hermes-agent / gateway use the local CDP bridge.
# WebBridge steal: after one-command connect, the agent actually talks to the browser.
set -euo pipefail

CONFIG="${HERMES_CONFIG_PATH:-${HOME}/.hermes/config.yaml}"
CDP_URL="${HERMES_BROWSER_CDP_URL:-ws://127.0.0.1:9222}"
json=0

while (($#)); do
  case "$1" in
    --config) shift; CONFIG="$1" ;;
    --url) shift; CDP_URL="$1" ;;
    --json) json=1 ;;
    --help|-h)
      echo "Usage: wire-hermes-browser-cdp.sh [--config PATH] [--url ws://127.0.0.1:9222] [--json]"
      exit 0
      ;;
    *) echo "Unknown arg: $1" >&2; exit 64 ;;
  esac
  shift
done

if [[ ! -f "$CONFIG" ]]; then
  echo "config missing: $CONFIG" >&2
  exit 1
fi

python3 - "$CONFIG" "$CDP_URL" "$json" <<'PY'
import json, re, sys, shutil
from pathlib import Path

path = Path(sys.argv[1])
url = sys.argv[2].strip()
want_json = sys.argv[3] == "1"
text = path.read_text(encoding="utf-8")

# Only mutate the browser.cdp_url key (first occurrence after a browser: block).
browser_m = re.search(r"(?m)^browser:\s*$", text)
if not browser_m:
    # Insert a minimal browser block at end
    addition = f"\nbrowser:\n  cdp_url: '{url}'\n  engine: auto\n"
    path.write_text(text.rstrip() + addition, encoding="utf-8")
    changed = True
    previous = ""
else:
    start = browser_m.end()
    # Next top-level key or EOF
    next_m = re.search(r"(?m)^[a-zA-Z_][a-zA-Z0-9_]*:\s*$", text[start:])
    end = start + next_m.start() if next_m else len(text)
    block = text[start:end]
    cdp_m = re.search(r"(?m)^([ \t]*cdp_url:\s*)([^\n]*)$", block)
    if cdp_m:
        previous = cdp_m.group(2).strip().strip("'\"")
        if previous == url or previous == url.replace("ws://", "http://"):
            changed = False
            new_block = block
        else:
            new_block = block[: cdp_m.start()] + cdp_m.group(1) + f"'{url}'" + block[cdp_m.end() :]
            changed = True
    else:
        previous = ""
        indent = "  "
        new_block = f"\n{indent}cdp_url: '{url}'" + block
        changed = True
    if changed:
        bak = path.with_suffix(path.suffix + ".bak-browser-bridge")
        shutil.copy2(path, bak)
        path.write_text(text[:start] + new_block + text[end:], encoding="utf-8")

payload = {
    "ok": True,
    "changed": changed,
    "config": str(path),
    "cdpUrl": url,
    "previous": previous,
}
if want_json:
    print(json.dumps(payload, indent=2))
else:
    print(f"browser.cdp_url={'updated' if changed else 'unchanged'} → {url}")
PY
