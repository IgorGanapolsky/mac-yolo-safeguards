---
name: gitbutler-google-sso
description: >
  HARD GitButler Cloud login is Google SSO (personal Gmail via
  /igor-login-accounts; never GitHub for the GitButler Cloud account).
  BrowserOS neo first. Do not hijack daily Chrome. Do not print the access
  token. Do not click Refresh token (logs out everywhere). Trigger: GitButler
  login, app.gitbutler.com, gitbutler.com/profile, but cloud auth.
  Slash: /gitbutler-google-sso.
---

# GitButler Cloud — Google SSO

**Cloud login:** `https://app.gitbutler.com/` → **Sign in with Google**
**Profile:** `https://gitbutler.com/profile`

Identity: personal Gmail from `/igor-login-accounts`. Never GitHub for the GitButler **Cloud** account.

GitHub forge OAuth (`but config forge` / `IgorGanapolsky`) is a **different** login. GitButler Cloud identity is Google.

## Proof of a live session

**Web Cloud (Google SSO)** — `GET https://app.gitbutler.com/api/login/whoami` with `X-Auth-Token` from Keychain, HTTP 200:

- `email` matches `/igor-login-accounts` Google SSO
- `email_verified` true
- `picture` host `lh3.googleusercontent.com` (Google SSO, not GitHub)
- Profile page shows that Gmail plus **Log out** (do **not** click Refresh token)

**Desktop cache is not login.** `~/Library/Application Support/com.gitbutler.app/user.json` stores profile fields only (`access_token` is `skip_serializing`). GitButler itself says: if `gitbutler_access_token` is missing from Keychain, "login is now invalid."

**CLI/desktop Cloud token:** Keychain generic passwords, presence-only (`find-generic-password`, never `-w` in chat):

| service | account |
|---|---|
| `gitbutler_access_token` | personal Gmail (`/igor-login-accounts`) |
| `release-gitbutler_access_token` | `GitButler` (GitButler keyring-rs BuildKind, CHANNEL=release) |

Whoami (pipe only; never print the token):

```bash
security find-generic-password -s gitbutler_access_token -w \
  | python3 -c 'import sys,json,urllib.request; t=sys.stdin.read().strip();
req=urllib.request.Request("https://app.gitbutler.com/api/login/whoami", headers={"X-Auth-Token": t});
b=json.load(urllib.request.urlopen(req, timeout=20));
print("verified" if b.get("email_verified") else "unverified", "id", b.get("id"))'
```

Forge (separate from Cloud SSO): `but config forge` → GitHub OAuth **IgorGanapolsky**.

## Login procedure

1. BrowserOS neo own tab: `https://app.gitbutler.com/`
2. If login wall: **Sign in with Google** → choose the personal Gmail from `/igor-login-accounts`
3. Password only if Google challenges: Keychain `google.com` — never print
4. Stop when profile email matches that Gmail and Log out is visible
5. Do **not** click **Refresh token** (logs the desktop app out everywhere)
6. Do **not** paste the access token into chat, git, vault, skill bodies, or `security -w` argv

Token helper (local, not in this public repo): `~/.grok/skills/gitbutler-google-sso/scripts/store_cloud_token.py`.

## Fleet wall

Still never `but setup` on mac-yolo-safeguards / ThumbGate / RealEstate shared trees. Overlay: [[gitbutler-fleet-safe]] / Codex #2119 `gitbutler-route`.

## Related

- [[gitbutler-fleet-automations]]
- [[igor-login-accounts]]
- Official `but` skill: `~/.grok/skills/gitbutler`
