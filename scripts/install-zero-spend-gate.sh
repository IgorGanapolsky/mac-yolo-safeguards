#!/bin/sh
set -eu

repo_dir="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
action="${1:---install}"

case "$action" in
  --install|--arm|--disable|--status)
    exec node "$repo_dir/zero-spend-command-gate.js" "$action"
    ;;
  *)
    echo "usage: $0 [--install|--arm|--disable|--status]" >&2
    exit 2
    ;;
esac
