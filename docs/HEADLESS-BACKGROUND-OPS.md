# Headless / background ops architecture

**Problem:** Agents driving Igor's interactive Google Chrome or stealing macOS focus blocks his daily work.

**Solution:** Split automation by host and interface. The MacBook Pro daily driver is **API/CLI only**. Headed browser work runs elsewhere or behind an explicit opt-in gate.

## Host roles

| Host | Role | Allowed automation |
|------|------|--------------------|
| **MacBook Pro (daily driver)** | Igor works here | `gh`, Play API, ASC API, Stripe CLI, Gmail API, `adb`, SSH client, Hermes gateway, GUI-less LaunchAgents |
| **Mac mini (100.94.135.78)** | Fleet / batch | SSH jobs, Ollama, gateway, optional isolated Chrome profile, Maestro CI |
| **Docker / VM** | Disposable browsers | Headless Playwright, CI scrapers, no cookie overlap with daily Chrome |

## Browser policy

| Profile | Path | When |
|---------|------|------|
| Daily Chrome | `~/Library/Application Support/Google/Chrome` | **Hands off** — Igor only |
| Hermes CDP profile | `~/.hermes/chrome-cdp-profile` | Only with `HERMES_ALLOW_INTERACTIVE_CHROME=1` + explicit Igor request |
| Docker Playwright | Container ephemeral profile | Default for web automation in agents |

**LaunchAgent `com.hermes.chrome-cdp`:** disabled on daily driver; not auto-installed by `install-agent-launchagents.sh` unless `HERMES_ALLOW_INTERACTIVE_CHROME=1`.

## Task matrix (prefer left column first)

| Task | Preferred | Fallback (opt-in) |
|------|-----------|-------------------|
| GitHub PR/CI/releases | `gh` | — |
| Play listing / review status | Play Developer API, `fastlane supply` | Play Console UI on Mac mini isolated profile |
| ASC metadata / review notes | ASC API (`.p8` issuer) | `ensure-asc-session.sh` only if Igor asked for Chrome |
| Stripe payment links / products | Stripe CLI, Stripe API | Chrome skill only if Igor asked |
| Gmail send / Sent verify | Gmail API, MCP | Never daily-driver Chrome |
| Hermes Mobile device proof | `adb`, Maestro, `agent-device` | — |
| Fleet gateway / pair | SSH, `hermes-mobile-pair.js`, Tailscale | — |
| Login-walled dashboard scrape | Headless Playwright in Docker | Interactive Chrome (same-message explicit ask) |
| Social post (LinkedIn/X) | API where available | Chrome on Mac mini, not daily driver |

## Agent decision flow

```
1. Is there a CLI/API for this task? → use it
2. Can SSH to Mac mini or run Docker headless? → use that
3. Did Igor explicitly ask to drive his Chrome in THIS message?
   NO → stop; report blocker
   YES → HERMES_ALLOW_INTERACTIVE_CHROME=1 for that operation only
```

## Related

- [NO-DESKTOP-HIJACK.md](./NO-DESKTOP-HIJACK.md) — gate env var, disable commands
- [AGENTS.md](../AGENTS.md) § No desktop hijack
- [BROWSER-CONTROL.md](./BROWSER-CONTROL.md) — Hermes Mobile browser tools (opt-in CDP)
