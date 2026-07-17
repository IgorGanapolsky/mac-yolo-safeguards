#!/usr/bin/env bash
# heal-launchd-paths.sh - repair fleet LaunchAgents whose script path points at a
# DELETED git worktree (the recurring "exit 127 every interval" cruft from agents
# running install.sh inside .worktrees/*, which later get pruned).
#
# For each com.igor.* / com.hermes.* plist whose ProgramArguments script no longer
# exists:  if the same repo-relative file exists under the canonical checkout, repoint
# the plist there and reload it;  otherwise report it as orphaned (script gone
# everywhere) for --prune to disable.
#
#   heal-launchd-paths.sh            # report only (dry run)
#   heal-launchd-paths.sh --apply    # repoint fixable jobs + reload
#   heal-launchd-paths.sh --apply --prune   # also `launchctl bootout` + disable orphans
set -euo pipefail

REPO="${MAC_YOLO_REPO:-$HOME/workspace/git/igor/mac-yolo-safeguards}"
LA="$HOME/Library/LaunchAgents"
UID_N="$(id -u)"
APPLY=0; PRUNE=0
for a in "$@"; do case "$a" in --apply) APPLY=1;; --prune) PRUNE=1;; esac; done

# Map a dead path to the canonical checkout: strip everything up to and including a
# .worktrees/<name>/ segment, then re-root under $REPO. Also handles paths already
# under $REPO whose file was merely deleted.
canonical_for() {
  local p="$1" rel=""
  case "$p" in
    *"/.worktrees/"*) rel="${p#*/.worktrees/*/}" ;;
    "$REPO/"*)        rel="${p#"$REPO"/}" ;;
    *"/mac-yolo-safeguards/"*) rel="${p#*/mac-yolo-safeguards/}" ;;
    *) return 1 ;;
  esac
  [ -n "$rel" ] && printf '%s/%s\n' "$REPO" "$rel"
}

fixed=0; orphaned=0; ok=0
for plist in "$LA"/com.igor.*.plist "$LA"/com.hermes.*.plist; do
  [ -f "$plist" ] || continue
  label="$(basename "$plist" .plist)"
  # `|| true`: setenv-only plists have no script path; a failing grep under pipefail
  # must not abort the whole heal run.
  script="$(/usr/bin/plutil -p "$plist" 2>/dev/null | /usr/bin/grep -oE '"/Users/[^"]*\.(sh|js|py)"' | head -1 | tr -d '"' || true)"
  [ -n "$script" ] || continue
  [ -f "$script" ] && { ok=$((ok+1)); continue; }   # path healthy

  canon="$(canonical_for "$script" || true)"
  if [ -n "$canon" ] && [ -f "$canon" ]; then
    echo "FIXABLE  $label"
    echo "         dead: $script"
    echo "         ->    $canon"
    if [ "$APPLY" = 1 ]; then
      /usr/bin/sed -i '' "s|$script|$canon|g" "$plist"
      /bin/launchctl bootout "gui/$UID_N/$label" 2>/dev/null || true
      /bin/launchctl bootstrap "gui/$UID_N" "$plist" 2>/dev/null \
        && echo "         reloaded ✓" || echo "         reload FAILED"
    fi
    fixed=$((fixed+1))
  else
    echo "ORPHANED $label  (script gone everywhere: $script)"
    if [ "$APPLY" = 1 ] && [ "$PRUNE" = 1 ]; then
      /bin/launchctl bootout "gui/$UID_N/$label" 2>/dev/null || true
      /bin/launchctl disable "gui/$UID_N/$label" 2>/dev/null || true
      echo "         booted out + disabled"
    fi
    orphaned=$((orphaned+1))
  fi
done

echo ""
echo "summary: healthy=$ok fixable=$fixed orphaned=$orphaned  (apply=$APPLY prune=$PRUNE)"
[ "$APPLY" = 1 ] || echo "dry run — re-run with --apply (and --prune to disable orphans)"
