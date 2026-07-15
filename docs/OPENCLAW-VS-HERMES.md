# OpenClaw vs Hermes — high-ROI positioning

**Audience:** operators, content, and agents deciding whether “run OpenClaw with Ollama” improves this fleet.

**Verdict:** OpenClaw matches the *shape* of a personal always-on messaging agent (Telegram/WhatsApp → Gateway → Ollama). This repo already ships that shape as **Hermes + Ollama + zero-spend + Hermes Mobile**. Installing OpenClaw *on top* of Hermes is usually a reliability regression, not an upgrade.

## What OpenClaw is good at (steal the bar)

| OpenClaw pitch (KDnuggets / Ollama blog) | Hermes equivalent |
|---|---|
| One command: `ollama launch openclaw` | `bash scripts/hermes-local-launch.sh --install` |
| Messaging as UI (Telegram, etc.) | Hermes Telegram gateway + **Hermes Mobile** |
| Always-on Gateway daemon | Hermes gateway / supervised LaunchAgents |
| Local Ollama models | `custom:ollama-local-64k` + zero-spend profiles |
| ≥64k context for agent tool schemas | Enforced: Hermes Agent hard min 64k; `qwen3.5:9b-hermes-64k` |

Use OpenClaw articles as a **UX benchmark** (“first local agent hour should feel one-command”), not as a second stack to co-install.

## What OpenClaw does *not* give you (our wedge)

| Gap | Why it matters |
|---|---|
| Phone **approve/deny before execute** | Hermes Mobile Leash — risky shell/file tools pause for a human |
| Fail-closed **zero paid spend** | `~/.hermes/NO_PAID_SPEND` + command gate (exit 73) |
| **Economic router** + route receipts | Cost/latency/approval policy, not “whatever the TUI picked” |
| Multi-Mac key/profile discipline | Pair scripts + per-host API keys |
| OS-level freeze / simulator runaway guard | This kit’s LaunchAgents |
| ThumbGate cross-session memory | Lessons and prevention rules across agents |

OpenClaw’s happy path also steers many users toward **Ollama cloud models + `ollama signin` + bundled web search** — fine for hobbyists, opposite of a zero-spend fleet.

## Hard rule: one Telegram owner

**Never** run OpenClaw Gateway and Hermes Gateway against the **same Telegram bot token**.

Symptoms of dual ownership:

- Telegram “polling conflict” / 409 conflicts
- Random which agent answers
- Missed approve/deny cards while the wrong daemon holds updates

Isolation if you truly need both products:

1. **Separate bot tokens** (and ideally separate chat IDs)
2. **Separate hosts** (e.g. OpenClaw only on a disposable VM; Hermes on operator Macs)
3. **No shared tool cwd** into production repos without Leash

Detection: `node tools/hermes-local-launch.js --status` fails closed when both process trees look active.

## Product / GTM angle (public-safe)

- **Always-on messaging agents** (OpenClaw-class, hosted Hermes, MyClaw) create demand for control and hard stops — not less of them.
- Hermes Mobile line: *Approve or deny your AI agent’s risky commands before they run — from your phone.*
- Vendor-neutral phrasing: *any agent behind **your** Hermes gateway* — do **not** claim native OpenClaw gating until reproduced end-to-end.
- Store metadata: category keywords only; no competitor trademarks in title (see ASO docs).

Market capture tool:

```sh
node tools/hermes-hosting-market-signal.js --preset openclaw-local --demo --json
```

## Operator checklist (this Mac)

```sh
# One-command local path (status only)
bash scripts/hermes-local-launch.sh --status

# Enable zero-spend + Hermes-safe 64k profile when ready
bash scripts/hermes-local-launch.sh --install

# Phone control plane when a device is on USB
node tools/hermes-mobile-pair.js
```

Related:

- [HERMES-ZERO-SPEND.md](./HERMES-ZERO-SPEND.md)
- [HERMES-HOSTED-RELIABILITY.md](./HERMES-HOSTED-RELIABILITY.md)
- [HERMES-ECONOMIC-ROUTER.md](./HERMES-ECONOMIC-ROUTER.md)
- hermes-mobile content: `hermes-mobile/docs/CONTENT-ENGINE-REVENUE-V1.md`
