#!/usr/bin/env bash
# Opt-in gate for anything that launches, focuses, or drives Igor's interactive Chrome.
# Default OFF — see docs/NO-DESKTOP-HIJACK.md and AGENTS.md § No desktop hijack.

hermes_interactive_chrome_allowed() {
  [[ "${HERMES_ALLOW_INTERACTIVE_CHROME:-0}" == "1" ]]
}

hermes_interactive_chrome_block_message() {
  cat <<'EOF' >&2
BLOCKED: interactive Chrome/CDP is disabled by default (no desktop hijack).
Use CLI/API first: gh, Play Developer API, ASC API (.p8), Stripe CLI, adb, SSH,
headless Playwright in Docker/dedicated profile, background LaunchAgents with no GUI.
To opt in for one explicit Igor request in the same message: HERMES_ALLOW_INTERACTIVE_CHROME=1
EOF
}

hermes_require_interactive_chrome() {
  if hermes_interactive_chrome_allowed; then
    return 0
  fi
  hermes_interactive_chrome_block_message
  return 1
}
