# Agent secret ingest — vault vs Keychain vs 1Password (July 2026)

**Run id:** `trun_74cd1f6d273647559b0e1d8dd2f60b51` (parallel-cli lite-fast)  
**Local corpus:** `~/Documents/AI-Agent-Sync/Research/secure-token-storage-july-2026/`  
**Skill:** `.cursor/skills/ingest-chat-credentials/SKILL.md` (+ `~/.claude/skills` / `~/.cursor/skills` / `~/.codex/skills` mirrors)

No secrets in this note — labels and paths only.

## Verdict for this machine

| Substrate | Use for agent credentials? | Why |
|-----------|----------------------------|-----|
| **macOS Keychain** | **Canonical yes** | Kernel-mediated store; `security(1)` agent-retrievable; already used for `hermes-fleet` ENV keys. `op` CLI not installed here. |
| **1Password CLI (`op`)** | Optional upgrade | Strong brokered refs (`op://`) when signed in; not available on this Mac as of 2026-07-20. |
| **Obsidian vault `AI-Agent-Sync`** | **Never** | Vault AGENTS.md / ORGANIZATIONAL_MEMORY forbid passwords, API keys, cookies, OTPs. |
| **EAS / GitHub Actions secrets** | CI/build only | Not a local interactive login store. |
| **Plaintext `.env` / chat / skills** | No for durable secrets | Runtime `.env` (mode 600, gitignored) OK for existing fleet patterns; never commit; never paste into skills/docs. |

## ASC / Apple ID specifically

1. Prefer **ASC API `.p8`** + issuer/key id for automation (`hermes-mobile/scripts/asc-api.js`).
2. Prefer **existing Chrome/Safari session** for UI (see `drive-logged-in-chrome`).
3. **Apple ID password** lives in Keychain as service `asc.apple-id`, account = Apple ID email; retrieve via skill helper — never Obsidian, never git.

## Agent posture when Igor pastes a credential

1. Ingest into Keychain immediately.
2. Confirm service + account only (mask value as `***`).
3. Do **not** reply with “don’t send passwords / rotate yourself.”
4. If rotation is wise after chat exposure: agent performs or queues it; no homework for Igor.

## Deep-research executive summary (parallel)

Keychain and 1Password CLI both support agent-retrievable secrets without plaintext in git. Obsidian is not a secret store. ASC API `.p8` vs Apple ID password comparison was thin in the lite run; local stack already prefers `.p8` for ASC automation and Keychain for the interactive Apple ID password.

Raw parallel output: `parallel-research/agent-asc-secret-storage-july-2026.{md,json}`.
