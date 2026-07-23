# Headless / background ops architecture (July 2026)

**Problem:** Agents driving Igor's interactive Google Chrome or stealing macOS focus blocks his daily work (incidents 2026-07-14, 2026-07-22).

**Solution:** Split automation by **host**, **interface**, and **opt-in gate**. The MacBook Pro daily driver is **API/CLI only**. **Interactive Chrome on the daily driver is forbidden** unless Igor's message contains an explicit opt-in phrase (`use my Chrome`, `drive my Chrome`, etc.) and `HERMES_ALLOW_INTERACTIVE_CHROME=1`.

## Host roles (July 2026)

| Host | Tailscale / LAN | Role | Allowed automation |
|------|-----------------|------|--------------------|
| **MacBook Pro (daily driver)** | Igor's desk | Human work + agent CLI | `gh`, Play API, ASC API / `asc-cli`, Stripe CLI, Gmail API/MCP, `adb`, SSH client, Hermes gateway, GUI-less `com.igor.*` LaunchAgents |
| **Mac mini (100.94.135.78)** | Fleet host | Batch / long jobs | SSH jobs, Ollama, gateway, Maestro CI, optional isolated Chrome profile (not Igor's daily cookies) |
| **Docker / VM** | Local or CI | Disposable browsers | Headless Playwright (`mcr.microsoft.com/playwright`), CI scrapers, no cookie overlap with daily Chrome |

Agents must **never** assume the daily driver is an automation sandbox. If a task needs a browser, pick Mac mini SSH or Docker before considering any headed Chrome.

## Browser policy

| Profile | Path | When |
|---------|------|------|
| Daily Chrome | `~/Library/Application Support/Google/Chrome` | **Forbidden for agents** — Igor only |
| Hermes CDP profile | `~/.hermes/chrome-cdp-profile` | Only with `HERMES_ALLOW_INTERACTIVE_CHROME=1` + explicit Igor request in that message |
| Docker Playwright | Container ephemeral profile | **Default** for web automation in agents |

**LaunchAgent `com.hermes.chrome-cdp`:** disabled on daily driver; `install-agent-launchagents.sh` prints `SKIP com.hermes.chrome-cdp` unless `HERMES_ALLOW_INTERACTIVE_CHROME=1`. Regression: `tests/test-install-agent-launchagents-chrome-gate.js`.

### Docker Playwright (preferred browser path)

```bash
docker run --rm -v "$PWD:/work" -w /work mcr.microsoft.com/playwright:v1.52.0-jammy \
  node scripts/your-headless-scraper.js
```

Use for public pages, form scrapes, and CI. Do **not** mount Igor's `~/Library/Application Support/Google/Chrome`.

## Task → tool matrix (prefer left column first)

| Task | Preferred tool | Never on daily driver |
|------|----------------|----------------------|
| GitHub PR / CI / releases | `gh pr`, `gh run`, `gh api` | — |
| Play listing / review / tracks | Play Developer API, `fastlane supply`, `gcloud` | Play Console UI in daily Chrome |
| ASC metadata / review notes / builds | ASC API (`.p8` issuer), `asc-cli`, `xcrun altool` | `ensure-asc-session.sh` / Chrome unless Igor asked |
| Stripe payment links / products | Stripe CLI (`stripe products list`), Stripe API | `drive-logged-in-chrome` |
| Gmail send / Sent-folder verify | Gmail API, Hermes Gmail MCP | AppleScript Chrome / Gmail web |
| Hermes Mobile device proof | `adb`, Maestro, `node tools/hermes-mobile-pair.js` | — |
| Fleet gateway / pair / deploy | SSH to Mac mini, Tailscale, `hermes-mobile-pair.js` | — |
| Revenue / Apollo enrich | Apollo CLI (`/opt/homebrew/bin/apollo`), Gmail API | Apollo web UI in daily Chrome |
| Login-walled dashboard scrape | Headless Playwright in Docker; SSH to Mac mini | Interactive Chrome, Computer Use |
| Social post (LinkedIn / X / Reddit) | API where available; draft-only if blocked | Chrome tab hijack on daily driver |
| Store publish state proof | `verify-app-store-publish-state` skill, Play/iTunes HTTP checks | Play Console / ASC UI without opt-in |

## Agent decision flow

```
1. Is there a CLI/API for this task? → use it (see matrix above)
2. Can SSH to Mac mini (100.94.135.78) or run Docker headless Playwright? → use that
3. Did Igor's message contain an explicit browser opt-in ("use my Chrome", etc.)?
   NO → stop; report blocker with the CLI/API you tried
   YES → export HERMES_ALLOW_INTERACTIVE_CHROME=1 for that operation only, then gated scripts
4. After the operation → do not leave com.hermes.chrome-cdp loaded on daily driver
```

## Related

- [NO-DESKTOP-HIJACK.md](./NO-DESKTOP-HIJACK.md) — gate env var, disable commands, banned pattern inventory
- [AGENTS.md](../AGENTS.md) § No desktop hijack
- [BROWSER-CONTROL.md](./BROWSER-CONTROL.md) — Hermes Mobile browser tools (opt-in CDP)
- [`.cursor/rules/no-desktop-hijack.mdc`](../.cursor/rules/no-desktop-hijack.mdc) — alwaysApply Cursor rule
