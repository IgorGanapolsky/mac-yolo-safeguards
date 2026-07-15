# Hosted Hermes / always-on agents — reliability gap

**Positioning (high-ROI, public-safe):** Hosted agent platforms (e.g. “Hermes always online, finishes the job in your channels”) solve **uptime and delivery**. They do **not** replace **OS-level and loop-level enforcement** when the agent is still burning tokens, thrashing a Mac, or failing silently on real work.

**Same class, local messaging agents:** OpenClaw-style stacks (`ollama launch openclaw` → Telegram/WhatsApp Gateway → Ollama) also sell always-on channel delivery. They fill the “terminal AI walked away” gap; they still do **not** replace phone approve/deny, zero-spend command gates, or Mac freeze guards. See [OPENCLAW-VS-HERMES.md](./OPENCLAW-VS-HERMES.md).

## The shift

| What platforms sell | What still breaks |
|---------------------|-------------------|
| No install, no Docker, agent online | Runaway tool loops and retry storms |
| Schedule / channel delivery | Load spikes (simulators, daemons) freezes the machine |
| Model credits / Max plans | API spend climbs with nothing useful shipped |
| “Pick an agent for the job” | No proof ledger of what was blocked or fixed |
| One-command local messaging agent (OpenClaw + Ollama) | Dual Telegram gateways, unsupervised tool exec, cloud model bleed |

## Our offer (same ladder)

| Offer | When |
|-------|------|
| [Agent Reliability Diagnostic ($499)](./AI-AGENT-HARDENING.md) | One repeated failure pattern after going always-on |
| [Hardening Sprint ($1,500)](./AI-AGENT-HARDENING.md) | Guardrails + smoke proof on one workflow |
| [Partner Pilot ($3,000)](./PARTNER-PILOT.md) | Agency packaging reliability next to hosted Hermes / multi-agent delivery |

Free OSS base: this repo’s Mac freeze guard + health check. Paid work is for teams that already pay for failures in time, tokens, or client trust.

## One-line CTA

> Hosted Hermes finishes work. We stop the unfinished-and-still-running class of failures — load spikes, token loops, no hard stop.

OpenClaw-class local agents:

> Always-on Telegram agents are great. Approve-before-execute + hard stops on the Mac are still a different layer.

Intake: [paid hardening inquiry](https://github.com/IgorGanapolsky/mac-yolo-safeguards/issues/new?template=paid-hardening-inquiry.yml) · [book 20-min triage](https://cal.com/igor-g-kvqxfo/30min) · `iganapolsky@gmail.com`

## One-command local path (this fleet)

```sh
bash scripts/hermes-local-launch.sh --status
bash scripts/hermes-local-launch.sh --install   # zero-spend + Hermes-safe 64k profile
```

Market signal capture:

```sh
node tools/hermes-hosting-market-signal.js --preset openclaw-local --demo --json
```
