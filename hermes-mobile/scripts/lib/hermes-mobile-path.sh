# shellcheck shell=bash
# Resolve hermes-mobile root when scripts run via ~/.local/bin symlinks. Source only.

hermes_caller_script_path() {
  if [ -n "${BASH_SOURCE[1]:-}" ]; then
    printf '%s\n' "${BASH_SOURCE[1]}"
  else
    printf '%s\n' "${BASH_SOURCE[0]}"
  fi
}

hermes_resolve_path_dir() {
  local target="$1"
  local target_dir
  while [ -L "$target" ]; do
    target_dir="$(cd -P "$(dirname "$target")" && pwd)"
    target="$(readlink "$target")"
    case "$target" in
      /*) ;;
      *) target="$target_dir/$target" ;;
    esac
  done
  cd -P "$(dirname "$target")" && pwd
}

hermes_resolve_script_dir() {
  hermes_resolve_path_dir "$(hermes_caller_script_path)"
}

hermes_resolve_mobile_dir() {
  local candidate script_dir caller

  if [ -n "${HERMES_MOBILE_DIR:-}" ] && [ -f "${HERMES_MOBILE_DIR}/package.json" ]; then
    (cd "${HERMES_MOBILE_DIR}" && pwd)
    return 0
  fi

  caller="$(hermes_caller_script_path)"
  script_dir="$(hermes_resolve_path_dir "$caller")"
  if [ "$(basename "$script_dir")" = "lib" ]; then
    script_dir="$(dirname "$script_dir")"
  fi

  candidate="$(cd "$script_dir/.." && pwd)"
  if [ -f "$candidate/package.json" ]; then
    printf '%s\n' "$candidate"
    return 0
  fi

  for candidate in \
    "/Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards/hermes-mobile" \
    "${HOME}/workspace/git/igor/mac-yolo-safeguards/hermes-mobile"; do
    if [ -f "$candidate/package.json" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}
