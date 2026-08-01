#!/usr/bin/env bash
# secret-put — store a secret in the macOS Keychain without it passing through a
# transcript, a shell history, a process list, or an environment variable.
#
# The value is read straight from the terminal with `read -s`, so it never appears
# as an argv (visible in `ps`), never lands in HISTFILE, and is never echoed. An
# agent driving this script sees only the exit code and the redacted summary.
#
#   tools/secret-put.sh PRIVATEEMAIL_SMTP_PASSWORD
#   tools/secret-put.sh PRIVATEEMAIL_SMTP_PASSWORD --account hermes-fleet
#
# Read it back:  security find-generic-password -a hermes-fleet -s NAME -w
set -euo pipefail

ACCOUNT="hermes-fleet"
NAME="${1:-}"
shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --account) ACCOUNT="$2"; shift 2 ;;
    *) echo "secret-put: unknown option $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$NAME" ]]; then
  echo "usage: tools/secret-put.sh <NAME> [--account <account>]" >&2
  echo "  e.g. tools/secret-put.sh PRIVATEEMAIL_SMTP_PASSWORD" >&2
  exit 2
fi
if [[ ! "$NAME" =~ ^[A-Z0-9_]+$ ]]; then
  echo "secret-put: NAME must be UPPER_SNAKE_CASE (got '$NAME')" >&2
  exit 2
fi

# A non-interactive caller must not be able to smuggle the value in by pipe — that
# would put it back in the transcript, which is the whole thing this avoids.
if [[ ! -t 0 ]]; then
  echo "secret-put: refusing to read a secret from a pipe or heredoc." >&2
  echo "  Run this directly in your terminal so the value is typed, not transmitted." >&2
  exit 3
fi

# `security` prompts on the terminal when -w is given as the LAST option with no value.
# Its own help says so: "Use of the -p or -w options is insecure. Specify -w as the last
# option to be prompted." Passing the value as `-w "$VALUE"` — which this script did
# originally — puts the secret in argv, where any process can read it out of `ps`, and
# also parks it in a shell variable. Prompting means the value goes keyboard ->
# security(1) without passing through bash or the process table at all.
echo "You will be prompted by security(1). The value is not read by this script." >&2
security add-generic-password -U -a "$ACCOUNT" -s "$NAME" -w

# Verify by reading back LENGTH ONLY — never print, never log, never return the value.
STORED_LEN=$(security find-generic-password -a "$ACCOUNT" -s "$NAME" -w 2>/dev/null | tr -d '\n' | wc -c | tr -d ' ')

if [[ "${STORED_LEN:-0}" -gt 0 ]]; then
  echo "stored: account=$ACCOUNT service=$NAME length=$STORED_LEN"
  exit 0
fi
echo "secret-put: store failed" >&2
exit 6
