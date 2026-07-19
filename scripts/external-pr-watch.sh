#!/usr/bin/env bash
# external-pr-watch - ping ntfy when a watched PR in an EXTERNAL repo changes state
# or gains comments/reviews. Our repo-sentinel only covers our own repos; this
# covers submissions we make elsewhere (e.g. awesome-list PRs).
#
# Watched PRs live one-per-line in $WATCHLIST as "<owner>/<repo>#<number>".
# State is remembered per-PR so we only notify on change. Merged/closed PRs are
# pruned from the watchlist automatically after a final notification.
set -euo pipefail

WATCHLIST="${EXTERNAL_PR_WATCHLIST:-$HOME/.hermes/external-pr-watchlist.txt}"
STATE_DIR="${EXTERNAL_PR_WATCH_STATE:-$HOME/.hermes/external-pr-watch}"
NTFY_TOPIC="${EXTERNAL_PR_NTFY_TOPIC:-yolo-guard-fdh8ktuw1vtxb5sb}"
GH="${GH_BIN:-/opt/homebrew/bin/gh}"
CURL="${CURL_BIN:-/usr/bin/curl}"

[ -f "$WATCHLIST" ] || exit 0
/bin/mkdir -p "$STATE_DIR"

notify() { # $1=title $2=body
  "$CURL" -fsS -m 10 -H "Title: $1" -d "$2" "https://ntfy.sh/$NTFY_TOPIC" >/dev/null 2>&1 || true
}

keep=()
while IFS= read -r line; do
  [ -n "$line" ] || continue
  case "$line" in \#*) keep+=("$line"); continue ;; esac
  repo="${line%#*}"; num="${line##*#}"
  snap="$("$GH" pr view "$num" --repo "$repo" \
      --json state,comments,reviews,mergedAt \
      --jq '{state, comments: (.comments|length), reviews: (.reviews|length)}' 2>/dev/null || true)"
  if [ -z "$snap" ]; then
    keep+=("$line")   # transient API failure — keep watching, no ping
    continue
  fi
  key="$(printf '%s' "$line" | /usr/bin/tr -c 'A-Za-z0-9' '_')"
  prev="$(/bin/cat "$STATE_DIR/$key" 2>/dev/null || true)"
  if [ "$snap" != "$prev" ] && [ -n "$prev" ]; then
    notify "PR watch: $line changed" "now: $snap (was: $prev) — https://github.com/$repo/pull/$num"
  fi
  printf '%s' "$snap" > "$STATE_DIR/$key"
  state="$(printf '%s' "$snap" | /usr/bin/sed -n 's/.*"state":"\([A-Z]*\)".*/\1/p')"
  if [ "$state" = "MERGED" ] || [ "$state" = "CLOSED" ]; then
    notify "PR watch: $line $state" "final state $state — removing from watchlist"
    /bin/rm -f "$STATE_DIR/$key"
  else
    keep+=("$line")
  fi
done < "$WATCHLIST"

tmp="$WATCHLIST.tmp.$$"
printf '%s\n' "${keep[@]:-}" > "$tmp"
/bin/mv "$tmp" "$WATCHLIST"
