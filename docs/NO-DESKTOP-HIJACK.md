# No desktop hijack (2026-07-22)

Igor's daily-driver Mac must stay usable while agents work. **Default: no interactive Chrome, no focus steal, no Computer Use.**

Canonical rule: [AGENTS.md](../AGENTS.md) § No desktop hijack.

## Opt-in gate

| Env | Default | Effect |
|-----|---------|--------|
| `HERMES_ALLOW_INTERACTIVE_CHROME` | `0` (unset) | `hermes-chrome-cdp.sh`, `install-hermes-chrome-cdp.sh`, `install-browser-bridge.sh`, `configure-browser-control.sh --apply`, and `install-agent-launchagents.sh` **do not** launch/heal/install CDP Chrome |
| `HERMES_ALLOW_INTERACTIVE_CHROME=1` | — | Allowed **only** when Igor explicitly asked for browser control in that same message |

Gate helper: `scripts/hermes-interactive-chrome-gate.sh`.

## Disable on a Mac (one-time)

```bash
launchctl bootout "gui/$(id -u)/com.hermes.chrome-cdp" 2>/dev/null || true
launchctl disable "gui/$(id -u)/com.hermes.chrome-cdp" 2>/dev/null || true
mv ~/Library/LaunchAgents/com.hermes.chrome-cdp.plist \
   ~/Library/LaunchAgents/com.hermes.chrome-cdp.plist.disabled 2>/dev/null || true
```

## Prefer (CLI/API first)

1. `gh` — PRs, checks, releases
2. Play Developer API / `fastlane supply` — Android listings
3. App Store Connect API (`.p8` issuer) — iOS metadata
4. Stripe CLI / API — payment links, products
5. Gmail API / MCP — outbound mail
6. `adb` — Hermes Mobile device proofs
7. SSH — Mac mini / fleet hosts
8. Headless Playwright in Docker or isolated profile (not Igor's daily Chrome)
9. Background LaunchAgents with **no GUI**

## Banned patterns (inventory)

Grep targets agents must not run unless Igor explicitly opted in:

| Pattern | Example locations |
|---------|-------------------|
| `drive-logged-in-chrome` | `.cursor/skills/drive-logged-in-chrome/SKILL.md`, `.claude/skills/drive-logged-in-chrome/SKILL.md`, revenue/Apollo skills |
| `osascript` + `Google Chrome` | `.cursor/skills/execute-revenue-cash-path/SKILL.md`, `scripts/install-browser-bridge.sh` (`--profile=daily`) |
| Computer Use / headed browser automation | Cursor browser MCP, `web-browsing-with-computer-use` skill, `tinker-yolo` computer loop (confirmation-gated only) |
| `com.hermes.chrome-cdp` auto-heal | `scripts/hermes-prevention-watchdog.sh` (gated), `scripts/install-agent-launchagents.sh` (gated) |

Skills marked **BANNED by default** at the top of `drive-logged-in-chrome` — read parent AGENTS.md before invoking.

- [HEADLESS-BACKGROUND-OPS.md](./HEADLESS-BACKGROUND-OPS.md) — host roles and task matrix
- [`.claude/skills/prefer-headless-background-ops/SKILL.md`](../.claude/skills/prefer-headless-background-ops/SKILL.md)
