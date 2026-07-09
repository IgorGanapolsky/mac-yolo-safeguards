# Hermes Mobile — Agent coordination

Cross-agent coordination for Hermes Mobile spans **two layers**: repo-local task locks and vault-wide session memory.

## Two-layer model (July 2026)

| Layer | Location | Purpose | Real-time? |
|-------|----------|---------|------------|
| **Task locks** | `mac-yolo-safeguards/plan.md` §2 | Who may edit which code files | No — claim before edit |
| **Session ledger** | `~/Documents/AI-Agent-Sync` vault | Handoffs, agent state, fleet health | No — session-boundary sync |
| **Product health** | `hermes-mobile/docs/proofs/continuous/latest.json` | E2E + unit proof | Updated by Mac LaunchAgent |

Industry pattern (Turnfile, pi-ensemble, FCoP 3.0, OACP): filesystem as message bus, append-only handoffs, one-writer-per-file. **Vault reduces collisions; it does not eliminate git races.**

## Agent roster

| Agent | State file | Code repo | Primary role |
|-------|------------|-----------|--------------|
| Cursor | *(via sync brief)* | mac-yolo-safeguards | Mac IDE, CI, E2E, release |
| Claude Code | `Agent-State/claude-code.md` | mac-yolo-safeguards | Gateway, tools, deep fixes |
| Codex | Handoffs + plan.md | mac-yolo-safeguards | Mobile UX, chat recovery |
| Gemini | plan.md §2 | mac-yolo-safeguards | GatewayContext (T-1) |
| Antigravity | `Agent-State/antigravity.md` | mac-yolo-safeguards | Maestro, UX |
| Hermes | `Agent-State/Hermes.md` | `~/.hermes` | Gateway operator |
| **Replit** | `Agent-State/replit-mobile.md` | Replit clone (preview) | Phone dev/preview → PR |

## Replit Agent lane

Replit runs on Igor's phone in a **separate git clone**. It is the dev/preview lane — not production ship.

**Read first (Replit + all agents):**

1. `~/Documents/AI-Agent-Sync/Handoffs/2026-07-08-hermes-mobile-replit-coordination.md`
2. `~/Documents/AI-Agent-Sync/Projects/Hermes-Mobile-Replit-Agent.md`
3. `hermes-mobile/docs/REPLIT_AGENT_COORDINATION.md` (this repo)
4. `plan.md` §0–§2

**Vault bootstrap (Replit or new machine):**

```bash
git clone https://github.com/IgorGanapolsky/AI-Agent-Sync.git ~/Documents/AI-Agent-Sync
bash ~/Documents/AI-Agent-Sync/scripts/bootstrap_central_vault.sh  # optional on Mac
```

## Protocol — before edit

1. `git -C ~/Documents/AI-Agent-Sync pull`
2. Read `Agent-State/latest.json`, `Agent-State/current-handoff.md`, newest `Handoffs/`
3. Read your agent's `Agent-State/<agent>.md` (Replit: `replit-mobile.md`)
4. Read `plan.md` §2 — **do not edit locked files**
5. `node tools/agent-session-start.js` (Mac agents)

## Protocol — after edit

1. Update your vault state file (one-writer-per-file)
2. Add `Handoffs/YYYY-MM-DD-<topic>.md` for cross-agent handoffs
3. Mark task progress in `plan.md`
4. Run verification (`npm test`, E2E kickstart on Mac — see [AGENTS.md](../AGENTS.md))
5. Regenerate fleet packet:

```bash
node tools/agent-sync-brief.js --vault ~/Documents/AI-Agent-Sync
```

6. Commit vault: `git -C ~/Documents/AI-Agent-Sync add <your-files> && git commit && git push`

## OTA coordination

- **Production OTA:** CI on `main` — `.github/workflows/mobile-ota.yml` (see [OTA_UPDATES.md](./OTA_UPDATES.md))
- **Replit:** may edit client `expo-updates` config; **cannot** run `eas update --channel production`
- Merge Replit PRs to `main`; CI publishes OTA automatically

## Phone / device policy

- Production dogfood: release APK via `npm run android:phone` (Mac agents)
- Gateway: Mac mini over Tailscale — not USB-only paths for ship claims
- See [PRODUCTION-PHONE-ONLY.md](./PRODUCTION-PHONE-ONLY.md)

## Related docs

- [OBSIDIAN.md](../../OBSIDIAN.md) — vault index
- [REPLIT_AGENT_COORDINATION.md](./REPLIT_AGENT_COORDINATION.md) — Replit session-start block
- [AGENTS.md](../AGENTS.md) — verification contract
- Vault: `Projects/mac-yolo-safeguards/Start Here.md`
