#!/usr/bin/env bash
# hermes-secret.sh — the ONLY sanctioned way an agent touches a secret in this repo.
#
# Backed by the macOS Keychain. Secrets are referenced by NAME in prompts, code, logs,
# skills, and commits. Values live in the Keychain and are read at point of use only.
#
# Usage:
#   ./scripts/hermes-secret.sh set  BLUESKY_APP_PASSWORD     # prompts; never takes value as argv
#   ./scripts/hermes-secret.sh get  BLUESKY_APP_PASSWORD     # prints value to stdout ONLY
#   ./scripts/hermes-secret.sh has  BLUESKY_APP_PASSWORD     # exit 0/1, prints nothing
#   ./scripts/hermes-secret.sh list                          # names only, never values
#   ./scripts/hermes-secret.sh rm   BLUESKY_APP_PASSWORD
#
# Design rules, all deliberate:
#   * Values are NEVER accepted as a command-line argument -- argv lands in shell history,
#     `ps` output, and CI logs. `set` reads from a silent prompt or stdin pipe.
#   * `list` prints names only. There is no command that dumps all values.
#   * `get` writes the value to stdout and nothing else, so it can be captured by a
#     variable without a stray newline or label leaking into a log.
#   * No plaintext fallback. On a host without the Keychain this refuses rather than
#     writing a secret to a dotfile.

set -uo pipefail
SERVICE="hermes-content-engine"

die() { printf '%s\n' "$1" >&2; exit 1; }

command -v security >/dev/null 2>&1 || die \
"REFUSING: no macOS Keychain on this host ($(uname -s)).
This script will not fall back to a plaintext file, an env var, or a dotfile.
On a headless host, use delegated OAuth (Buffer/Zapier) instead of a stored secret."

CMD="${1:-}"; NAME="${2:-}"

case "$CMD" in
  set)
    [[ -n "$NAME" ]] || die "usage: $0 set NAME"
    [[ $# -le 2 ]] && true || die "REFUSING: never pass a secret value as an argument."
    if [[ -t 0 ]]; then
      printf 'Value for %s (input hidden): ' "$NAME" >&2
      IFS= read -r -s VALUE; printf '\n' >&2
    else
      IFS= read -r VALUE   # piped: `printf %s "$v" | hermes-secret.sh set NAME`
    fi
    [[ -n "${VALUE:-}" ]] || die "empty value; nothing stored"
    security add-generic-password -a "$NAME" -s "$SERVICE" -w "$VALUE" -U >/dev/null 2>&1 \
      || die "keychain write failed for $NAME"
    unset VALUE
    printf 'stored: %s\n' "$NAME" >&2   # name only, never the value
    ;;
  get)
    [[ -n "$NAME" ]] || die "usage: $0 get NAME"
    security find-generic-password -a "$NAME" -s "$SERVICE" -w 2>/dev/null \
      || die "no secret named $NAME"
    ;;
  has)
    [[ -n "$NAME" ]] || die "usage: $0 has NAME"
    security find-generic-password -a "$NAME" -s "$SERVICE" -w >/dev/null 2>&1
    exit $?
    ;;
  list)
    security dump-keychain 2>/dev/null \
      | grep -A1 "\"svce\"<blob>=\"$SERVICE\"" \
      | grep -oE '"acct"<blob>="[^"]*"' | sed 's/.*="//;s/"$//' | sort -u
    ;;
  rm)
    [[ -n "$NAME" ]] || die "usage: $0 rm NAME"
    security delete-generic-password -a "$NAME" -s "$SERVICE" >/dev/null 2>&1 \
      && printf 'removed: %s\n' "$NAME" >&2 || die "no secret named $NAME"
    ;;
  *)
    sed -n '2,30p' "$0" >&2; exit 2
    ;;
esac
