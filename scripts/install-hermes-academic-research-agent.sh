#!/bin/zsh
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
label="com.igor.hermes-academic-research-agent"
template="$repo_root/$label.plist"
target="$HOME/Library/LaunchAgents/$label.plist"
private_root="$HOME/.hermes/research-rag"
domain="gui/$(id -u)"
node_bin="${HERMES_ACADEMIC_NODE_BIN:-$(command -v node || true)}"

case "$node_bin" in
  /*) ;;
  *)
    print -u2 "Hermes academic research installer requires an absolute Node executable path"
    exit 1
    ;;
esac
if [[ ! -x "$node_bin" ]]; then
  print -u2 "Hermes academic research Node executable is not runnable: $node_bin"
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents" "$private_root/logs"
chmod 700 "$private_root" "$private_root/logs"

/usr/bin/sed \
  -e "s|__REPO_ROOT__|$repo_root|g" \
  -e "s|__HOME__|$HOME|g" \
  -e "s|__NODE_BIN__|$node_bin|g" \
  "$template" > "$target"
chmod 600 "$target"
/usr/bin/plutil -lint "$target"

/bin/launchctl bootout "$domain/$label" >/dev/null 2>&1 || true
/bin/launchctl bootstrap "$domain" "$target"
/bin/launchctl enable "$domain/$label"
/bin/launchctl kickstart -k "$domain/$label"

for _ in {1..20}; do
  if /bin/launchctl print "$domain/$label" >/dev/null 2>&1; then
    break
  fi
  /bin/sleep 0.1
done

/bin/launchctl print "$domain/$label" | /usr/bin/grep -E 'state =|last exit code =|program =|path ='
