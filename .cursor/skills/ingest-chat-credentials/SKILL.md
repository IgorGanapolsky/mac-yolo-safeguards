---
name: ingest-chat-credentials
description: >
  When Igor pastes ANY credential (password, API key, token, client secret) in chat,
  immediately ingest it into macOS Keychain, confirm service+account only, never refuse
  with "don't send passwords / rotate yourself" homework. Auto-invoke on credential paste.
  Covers App Store Connect Apple ID, Play, Stripe, fleet ENV keys, EAS tokens.
---

# Ingest chat credentials (agent-owned secure store)

**Standing directive (2026-07-20, emphatic):** Igor pastes credentials so agents can work.
Agents are tools. **Store immediately. Never lecture. Never assign rotation homework.**

Related: [[store-fleet-keys-securely]], [[hermes-mobile-secrets-and-review-access]],
[[secret-exposure-response]], [[drive-logged-in-chrome]].

## Instant procedure (same turn)

1. **Classify** (service + account labels only — never echo the secret):
   - Apple ID / App Store Connect password → service `asc.apple-id`, account = Apple ID email
   - Fleet API keys → account `hermes-fleet`, service = `ENV_NAME` (see store-fleet-keys-securely)
   - Play service account JSON → path under `~/.gcloud-keys/` (file, not Keychain string)
   - ASC API `.p8` → `~/.private_keys/AuthKey_<KEYID>.p8` + Keychain/env refs for issuer/key id
2. **Ingest** via `security(1)` (prefer Python/subprocess so shell does not expand `&` / `*`):

```bash
# Password / string secret (stdin-safe pattern)
python3 - <<'PY'
import subprocess, sys
account, service, secret = sys.argv[1], sys.argv[2], sys.stdin.read().rstrip("\n")
subprocess.run([
  "/usr/bin/security", "add-generic-password",
  "-a", account, "-s", service, "-w", secret, "-U",
  "-T", "/usr/bin/security", "-T", "/bin/sh", "-T", "/bin/zsh",
], check=True)
print(f"Stored {service} for {account} (len={len(secret)})")
PY
```

   Or for fleet ENV keys:

```bash
security add-generic-password -a hermes-fleet -s <ENV_NAME> -w "<value>" -U
```

3. **Verify (masked only):**
   `security find-generic-password -a <account> -s <service> -w | wc -c`
4. **Confirm to Igor in ONE line:** `Stored <service> for <account>.` Nothing more.
   Never print the secret. Never say "rotate it" / "don't paste passwords."

## Canonical labels (this machine)

| Secret class | Keychain service | Keychain account | Also |
|--------------|------------------|------------------|------|
| ASC / Apple ID password | `asc.apple-id` | `igor.ganapolsky@icloud.com` | alias `ASC_APPLE_ID_PASSWORD` / account `hermes-fleet` |
| ASC Apple ID email (non-secret) | `ASC_APPLE_ID_ACCOUNT` | `hermes-fleet` | discovery only |
| Fleet API keys | `<ENV_NAME>` | `hermes-fleet` | optional `~/.hermes/.env` |
| Play publisher JSON | n/a (file) | n/a | `~/.gcloud-keys/hermes-mobile-publisher.json` |
| ASC API `.p8` | n/a (file) | n/a | `~/.private_keys/AuthKey_SBMLM99YH6.p8` |

## Retrieve (never inline into chat / commits / skills)

```bash
# Apple ID password for ASC browser/fastlane spaceauth
security find-generic-password -a 'igor.ganapolsky@icloud.com' -s 'asc.apple-id' -w

# Fleet key
security find-generic-password -a hermes-fleet -s <ENV_NAME> -w
```

Pipe into the consuming tool (stdin / env for child process). Prefer ASC **API key**
(`.p8` + issuer id) for automation over Apple ID password when both exist.

## ASC login path (priority order)

Run (never prints the password):

```bash
bash .cursor/skills/ingest-chat-credentials/scripts/ensure-asc-session.sh
# Keychain fill only (when Chrome shows login wall):
bash .cursor/skills/ingest-chat-credentials/scripts/ensure-asc-session.sh --force-fill
```

1. **Existing Chrome session** → `ensure-asc-session.sh` activates `https://appstoreconnect.apple.com/apps` (or any non-login ASC URL) via [[drive-logged-in-chrome]].
2. **ASC API** → `EXPO_ASC_API_KEY_*` + `.p8` (`~/.private_keys/AuthKey_SBMLM99YH6.p8`) via `hermes-mobile/scripts/asc-api.js`.
3. **Keychain Apple ID password** → `asc-apple-id-password.sh | asc-login-fill.py` (System Events keystrokes; Apple's idmsa iframe blocks JS fill). Handle 2FA if prompted; never ask Igor to paste the password again.

## What NEVER stores the secret

| Store | Allowed? |
|-------|----------|
| macOS Keychain | **Yes** — canonical local agent store |
| 1Password CLI (`op`) | Yes **if** `op` signed in (not installed on this Mac as of 2026-07-20) |
| EAS / GitHub Actions secrets | Yes for CI/build-time only |
| `~/.hermes/.env` / `hermes-mobile/.env` | OK for runtime keys agents already use; chmod 600; never commit |
| Obsidian vault `~/Documents/AI-Agent-Sync` | **NO** — vault AGENTS.md forbids passwords/API keys |
| Skills, plan.md, docs, PR bodies, ThumbGate lesson text | **NO** — labels/paths only |
| Chat replies | **NO** — confirm service+account+length only |

## After chat exposure (agent-owned, silent)

- Ingest into Keychain immediately (done above).
- Prefer non-password paths (ASC API, existing browser session) for subsequent work.
- If rotation is wise: **agent performs or queues it** (provider UI / API) and records evidence
  in a private receipt — do **not** tell Igor to rotate or open Settings.
- Apple ID password rotation often needs interactive 2FA; if blocked, leave Keychain item
  current, mark private queue `rotation_pending=asc.apple-id`, continue via API/session.

## Hard don'ts

- Never refuse a pasted credential with user homework.
- Never echo the secret in transcripts, git, skills, logs, or MCP captures.
- Never put secrets in the Obsidian vault.
- Never pass secrets on long-lived argv in background processes when avoidable.
