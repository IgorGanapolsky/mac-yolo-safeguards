# Vellum.ai August 2026 teardown — competitor steal for Grok Bot

**Researched:** 2026-08-18  
**Question:** Is Vellum our competitor?  
**Answer:** **Yes, in the personal-assistant / persistent-teammate category.**  
`docs.vellum.ai` is a *second*, older product (enterprise LLMOps). Do not collapse the two.

## Dual product (live the same day)

| Surface | What it is | Competes with |
|---------|------------|---------------|
| [vellum.ai](https://www.vellum.ai) + [github.com/vellum-ai/vellum-assistant](https://github.com/vellum-ai/vellum-assistant) | MIT personal AI: 8 memory types, own identity, CES credential process, Mac/iOS/web/voice/email/Telegram/Slack, hatch + doctor | **Grok Bot**, Hermes Agent, OpenClaw, Claude Cowork |
| [docs.vellum.ai](https://docs.vellum.ai) | Prompts, visual workflows, quantitative evals, deployments | LangSmith / Braintrust style LLMOps — complementary steal |

They advertise [import from Hermes](https://www.vellum.ai/import) (also ChatGPT, Claude, OpenClaw): inventory identity/memory/skills/schedules, **approve what lands**.

## Pricing (vellum.ai/pricing, 2026-08-18)

| Plan | Price | Computer | Storage | Credits | Platform fee |
|------|-------|----------|---------|---------|--------------|
| Self-host MIT | $0 | own hardware | own disk | BYO model | none |
| Mighty | $30/mo | 1 vCPU / 2 GiB | 10 GB | $25 | $0 |
| Super | $100/mo | 2.5 vCPU / 5 GiB | 30 GB | $45 | $10 (email + subdomain + static IP) |
| Ultra | $200/mo | 4 vCPU / 8 GiB | 60 GB | $115 | $10 |

Compare-page copy from May 2026 still says “Free Base + Pro from $50”. **Live checkout is Mighty/Super/Ultra.** Use the pricing page.

Older “Pro from $50” copy remains on some comparison URLs. Treat pricing page as source of truth.

## Hosting picker (official Vellum.app, 2026-08-18 12:21)

Exact UI copy from the hatch **Hosting** screen:

- Prompt: *Choose where you want your assistant to live.*
- **Vellum Cloud** — *Always on, 24/7, even when your computer is off. Runs on Vellum's secure infrastructure.*
- **Local** (selected) — *Runs directly on your machine. Your data never leaves your computer.*

**Decision:** stay on **Local**. Cloud is Mighty $30+ and is not required for a Grok Bot alternative. The 24/7 idea is stolen as Hermes always-on (`hosting --choose hermes-always-on`), not a Vellum checkout.

`bin/vellum-bot hosting` reproduces this picker. `--choose vellum-cloud` is spend-refused unless `VELLUM_CLOUD_PAID_OK=1`.

Lockfile on this Mac is already `cloud: local`.

## Official app on Igor’s Mac (same day)

- `/Applications/Vellum.app` **0.11.3** running (Electron + bun daemon/gateway/CES/schedule/memory workers)
- Local hatch `vellum-raw-ram-wcmjzd`, lockfile `cloud: local`
- Gateway `127.0.0.1:7830` `/healthz` 200, `/readyz` `ready:true`
- Daemon `127.0.0.1:7821` version `0.11.3`
- Hatch log still has **`waitingForCredentials: true`**
- **Do not claim official Vellum is a ready Grok Bot replacement**
- Do not print `guardian-token.json` or lockfile secrets
- Do not `curl | bash` install.sh again; do not spend on Mighty/Super/Ultra unless asked

## Grok Bot overlap (docs.x.ai/grok-bot, Aug 2026)

| Axis | Vellum Assistant | Grok Bot | Hermes-native alt |
|------|------------------|----------|-------------------|
| Computer | Sandbox + optional host; Cloud VM sized by plan | Persistent cloud VM, shared across Bots | This Mac + LaunchAgents. Not a second paid VM |
| Identity | Not you; Super/Ultra email + subdomain | Named teammate | `bin/vellum-bot identity-pack` |
| Memory | 8 types + staleness + local embeddings | Durable named-bot state | `memory-map` onto Hermes banks |
| Skills | SKILL.md + TOOLS.json; hourly proactivity | task → skill → test → routine | `outcome-routine-spec` + eval-gated `promote` |
| Credentials | Separate CES process | Secure handoff; human 2FA | Keychain; doctor redacts |
| Import | Inventory then approve | Teach-a-task | `inventory` land=false; **no upload** |

## High-ROI steals implemented

1. **Honest doctor** — official hatch vs Hermes `$0` rail (`bin/vellum-bot doctor`)
2. **Identity pack** — SOUL.md / NOW.md / IDENTITY.md (assistant is not Igor)
3. **8-type memory map** — official Vellum types → Hermes banks
4. **Inventory-first import** — list skills/tools; never auto-land; never hit vellum.ai/import
5. **Eval-gated promote** — `outcome-routine-spec` + `VellumAIEngine` (LLMOps steal) before a routine is written as `PROMOTED_DRAFT`
6. **Honest hybrid hosting** — `cloud` is Hermes always-on URL, **not** `thumbgate.app`, **not** official Vellum Cloud

## What we did not rebuild

- QuickJS-WASM workflow VM
- CES container mesh
- iOS / Slack / Telegram surfaces
- Paid Vellum Cloud
- ThumbGate product IP (ECI wall)

## Verification

```bash
bin/vellum-bot doctor
bin/vellum-bot compare
node tests/test-vellum-grok-bot-alt.js
node tests/test-vellum-hybrid-engine.js
node tests/test-vellum-ai-engine.js
node tests/test-outcome-routine-spec.js
```

## Sources

- https://www.vellum.ai · https://www.vellum.ai/pricing · https://www.vellum.ai/import · https://www.vellum.ai/llms.txt
- https://www.vellum.ai/compare-assistants/vellum-vs-hermes-agent
- https://www.vellum.ai/blog/best-local-ai-assistants (2026-08-04)
- https://github.com/vellum-ai/vellum-assistant (ARCHITECTURE.md, README)
- https://docs.vellum.ai (LLMOps)
- https://docs.x.ai/grok-bot/overview · skills-routines-and-automations
