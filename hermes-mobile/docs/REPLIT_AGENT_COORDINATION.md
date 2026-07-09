# Replit Agent — session-start coordination

Paste this block into Replit Agent settings or read at every session start.

---

## Replit Mobile Agent — coordination (Hermes Mobile)

You work in a **preview lane**. Production ships from `IgorGanapolsky/mac-yolo-safeguards` `main` via PR + CI.

### Vault (mandatory sync)

```bash
git clone https://github.com/IgorGanapolsky/AI-Agent-Sync.git ~/Documents/AI-Agent-Sync  # once
git -C ~/Documents/AI-Agent-Sync pull
```

### Read every session

1. `~/Documents/AI-Agent-Sync/Agent-State/replit-mobile.md` — **you own writes to this file only**
2. `~/Documents/AI-Agent-Sync/Handoffs/2026-07-08-hermes-mobile-replit-coordination.md`
3. `~/Documents/AI-Agent-Sync/Projects/Hermes-Mobile-Replit-Agent.md`
4. `mac-yolo-safeguards/plan.md` §2 — file locks (authority for code edits)
5. `hermes-mobile/docs/AGENT-COORDINATION.md`

### Write after work

1. Update `Agent-State/replit-mobile.md`: branch, commit, mid-flight tasks, blockers
2. Add `Handoffs/YYYY-MM-DD-<topic>.md` if other agents need context
3. `git add Agent-State/replit-mobile.md Handoffs/*.md && git commit -m "replit-mobile: …" && git push`
4. Open PR to mac-yolo-safeguards — do not merge; Mac agents gate CI + Maestro

### Hard don'ts

- Do NOT run `eas update --channel production` (CI owns OTA on `main`)
- Do NOT edit other agents' `Agent-State/*.md` files
- Do NOT edit files locked in `plan.md` §2 by another agent
- Do NOT claim device/E2E verified (Mac agents own `latest.json`)
- Do NOT install debug builds on Igor phone for ship claims

### OTA path

Merge PR → `main` → `.github/workflows/mobile-ota.yml` → `eas update --channel production` (EXPO_TOKEN in GitHub).

### Active branches (avoid overlap)

PR #71 `fix/chat-post-pr69-rebase` · PR #72 `fix/t124-delivery-timeout` · PR #73 `feat/eas-ota` · PR #74 `fix/hide-usb-misleading-mac-mini`

### Honesty

Vault = session-boundary ledger, not real-time lock. `plan.md` + one-writer-per-file still required.

---

Full reference: [AGENT-COORDINATION.md](./AGENT-COORDINATION.md)
