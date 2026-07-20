#!/usr/bin/env bash
# Ensure agents can use App Store Connect without asking Igor for a password.
# Priority: existing Chrome session → ASC API .p8 → Keychain System Events fill.
# Never echoes the Apple ID password.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
FORCE_FILL=0
SKIP_API=0

usage() {
  cat <<'EOF'
Usage: ensure-asc-session.sh [--force-fill] [--skip-api]

  --force-fill   Skip session restore; pipe Keychain password into System Events fill
  --skip-api     Do not probe ASC API .p8 (browser-only)

Exit 0 when Chrome session or API auth is proven, or when fill was submitted.
JSON status on stdout (no secrets).
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force-fill) FORCE_FILL=1; shift ;;
    --skip-api) SKIP_API=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "{\"ok\":false,\"error\":\"unknown_arg\",\"arg\":\"$1\"}" >&2; exit 2 ;;
  esac
done

chrome_probe() {
  /usr/bin/osascript <<'APPLESCRIPT' 2>/dev/null || true
tell application "Google Chrome"
  repeat with w in windows
    set i to 0
    repeat with t in tabs of w
      set i to i + 1
      set u to URL of t
      if u starts with "https://appstoreconnect.apple.com/" and u does not contain "/login" and u does not contain "authResult=FAILED" then
        set active tab index of w to i
        set index of w to 1
        set jsResult to execute t javascript "(() => { const body=((document.body&&document.body.innerText)||'').slice(0,400); const loginWall=/Sign in to App Store Connect|Apple ID|idmsa\\.apple\\.com|authResult=FAILED/i.test(location.href+body); return JSON.stringify({url:location.href,title:document.title,loginWall:loginWall}); })()"
        return jsResult
      end if
    end repeat
  end repeat
  return ""
end tell
APPLESCRIPT
}

api_probe() {
  local hm="$REPO_ROOT/hermes-mobile"
  [[ -f "$hm/scripts/asc-api.js" ]] || return 1
  (
    cd "$hm"
    node -e '
const {loadEnv,ascGet}=require("./scripts/asc-api");
(async()=>{
  loadEnv(__dirname);
  const r=await ascGet("/v1/apps?limit=3&fields[apps]=name,bundleId");
  const apps=(r.data||[]).map(a=>({id:a.id,name:a.attributes?.name,bundle:a.attributes?.bundleId}));
  process.stdout.write(JSON.stringify({ok:true,path:"asc_api_p8",keyId:process.env.EXPO_ASC_API_KEY_ID,appCount:apps.length,apps}));
})().catch(e=>{process.stderr.write(String(e.message||e).slice(0,240)); process.exit(1);});
' 2>/dev/null
  )
}

if [[ "$FORCE_FILL" -eq 0 ]]; then
  probe="$(chrome_probe || true)"
  if [[ -n "$probe" ]]; then
    if python3 -c 'import json,sys; d=json.loads(sys.argv[1]); sys.exit(0 if d.get("loginWall") is False else 1)' "$probe" 2>/dev/null; then
      python3 -c 'import json,sys; d=json.loads(sys.argv[1]); print(json.dumps({"ok":True,"path":"chrome_session","url":d.get("url"),"title":d.get("title")}))' "$probe"
      exit 0
    fi
  fi

  if [[ "$SKIP_API" -eq 0 ]]; then
    if api_json="$(api_probe)"; then
      echo "$api_json"
      # API alone is enough for metadata/automation; still try to surface Chrome if present.
      exit 0
    fi
  fi
fi

# Keychain → System Events fill (password on stdin pipe only)
if [[ ! -x "$SCRIPT_DIR/asc-apple-id-password.sh" ]]; then
  echo '{"ok":false,"error":"missing_asc_apple_id_password_sh"}' >&2
  exit 1
fi
if [[ ! -f "$SCRIPT_DIR/asc-login-fill.py" ]]; then
  echo '{"ok":false,"error":"missing_asc_login_fill_py"}' >&2
  exit 1
fi

chmod +x "$SCRIPT_DIR/asc-login-fill.py" 2>/dev/null || true
# shellcheck disable=SC2094
fill_json="$("$SCRIPT_DIR/asc-apple-id-password.sh" | python3 "$SCRIPT_DIR/asc-login-fill.py")"
echo "$fill_json"
if python3 -c 'import json,sys; d=json.loads(sys.argv[1]); sys.exit(0 if d.get("ok") else 1)' "$fill_json"; then
  exit 0
fi
exit 1
