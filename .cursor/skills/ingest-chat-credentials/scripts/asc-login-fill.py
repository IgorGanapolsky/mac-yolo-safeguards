#!/usr/bin/env python3
"""Fill App Store Connect Apple ID login via System Events.

Reads password from stdin (pipe from asc-apple-id-password.sh). Never prints the secret.
Chrome JS fill into Apple's idmsa iframe is blocked — use keystrokes instead.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys


def applescript(source: str) -> str:
    proc = subprocess.run(
        ["/usr/bin/osascript", "-e", source],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "osascript failed").strip()
        raise RuntimeError(err)
    return (proc.stdout or "").strip()


def chrome_js(js: str) -> str:
    escaped = js.replace("\\", "\\\\").replace('"', '\\"')
    return applescript(
        'tell application "Google Chrome" to execute active tab of front window '
        f'javascript "{escaped}"'
    )


def focus_login_tab() -> str:
    return applescript(
        r'''
tell application "Google Chrome"
  activate
  repeat with w in windows
    set i to 0
    repeat with t in tabs of w
      set i to i + 1
      set u to URL of t
      if u contains "appstoreconnect.apple.com/login" or u contains "idmsa.apple.com" or u contains "appleid.apple.com" then
        set active tab index of w to i
        set index of w to 1
        return u
      end if
    end repeat
  end repeat
  open location "https://appstoreconnect.apple.com/login"
  delay 2
  return URL of active tab of front window
end tell
'''
    )


def keystroke_text(text: str) -> None:
    """Type text via System Events; secret is argv to short-lived osascript only."""
    proc = subprocess.run(
        [
            "/usr/bin/osascript",
            "-e",
            'on run argv\n'
            '  tell application "System Events" to keystroke (item 1 of argv)\n'
            "end run",
            text,
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or proc.stdout or "keystroke failed").strip())


def fill_login(account: str, password: str) -> dict:
    url = focus_login_tab()
    applescript("delay 1.2")
    applescript(
        r'''
tell application "Google Chrome" to activate
delay 0.3
tell application "System Events"
  keystroke "l" using command down
  delay 0.15
  key code 53
  delay 0.2
end tell
'''
    )
    try:
        chrome_js(
            "(() => { const i=document.querySelector('input#account_name_text_field, "
            "input[type=email], input[name=accountName]'); "
            "if(i){i.focus(); i.click(); return 'focused'} return 'no-field' })()"
        )
    except RuntimeError:
        pass

    keystroke_text(account)
    applescript('tell application "System Events" to key code 48')  # Tab
    applescript("delay 0.35")
    keystroke_text(password)
    applescript("delay 0.2")
    applescript('tell application "System Events" to key code 36')  # Return
    return {
        "ok": True,
        "path": "keychain_system_events_fill",
        "loginUrl": url,
        "account": account,
        "note": "Password typed via System Events; never logged. 2FA may still be required.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--account",
        default="",
        help="Apple ID email (default: Keychain ASC_APPLE_ID_ACCOUNT or igor.ganapolsky@icloud.com)",
    )
    args = parser.parse_args()
    account = args.account.strip()
    if not account:
        try:
            account = subprocess.check_output(
                [
                    "/usr/bin/security",
                    "find-generic-password",
                    "-a",
                    "hermes-fleet",
                    "-s",
                    "ASC_APPLE_ID_ACCOUNT",
                    "-w",
                ],
                text=True,
            ).strip()
        except subprocess.CalledProcessError:
            account = "igor.ganapolsky@icloud.com"

    password = sys.stdin.read().rstrip("\n")
    if not password:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": "empty_password_stdin",
                    "hint": "pipe: scripts/asc-apple-id-password.sh | scripts/asc-login-fill.py",
                }
            ),
            file=sys.stderr,
        )
        return 2

    try:
        result = fill_login(account, password)
    except Exception as exc:  # noqa: BLE001 — agent-facing status JSON
        print(json.dumps({"ok": False, "error": str(exc)[:400]}))
        return 1

    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
