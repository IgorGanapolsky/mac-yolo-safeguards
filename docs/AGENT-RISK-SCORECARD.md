# AI Agent Risk Scorecard — free 5-minute self-assessment

Score how exposed your setup is to the three ways autonomous coding agents actually hurt people:
a frozen machine, a surprise bill, and an action you can't take back.

Answer 12 questions. **No = 0, Partial = 1, Yes = 2.** Add it up (max 24). Bands and next steps at the bottom.

**Interactive version** (auto-scores + gap analysis + copyable share block):
[right-click and save this file](https://raw.githubusercontent.com/IgorGanapolsky/mac-yolo-safeguards/main/docs/funnel/agent-risk-scorecard.html),
then open it in any browser — it's a single HTML file that works offline and sends nothing anywhere.
([view source](./funnel/agent-risk-scorecard.html))

Why these 12 questions: they're the failure classes documented across 2026's agent incidents — from the
[Moltbook exposure](https://www.wiz.io/blog/exposed-moltbook-database-reveals-millions-of-api-keys) (1.5M API tokens leaked from an app whose founder "didn't write one line of code") to
[Georgia Tech's count of 74 confirmed AI-linked CVEs through March 2026](https://news.research.gatech.edu/2026/04/13/bad-vibes-ai-generated-code-vulnerable-researchers-warn) —
plus the runaway-loop and token-burn patterns this repo's guards were built from.

## A. Runaway control

1. **Automatic kill:** If an agent enters an infinite retry/edit loop right now, does anything stop it automatically — a timeout, loop detector, or watchdog? (Not: "I notice when the fan spins up.")
2. **Resource limits:** Do agent processes run under hard CPU/memory limits (ulimits, containers, memory-pressure guards) so one runaway can't freeze the machine?
3. **One-command stop:** Can you kill every running agent with one documented, tested command — without hunting PIDs?

## B. Spend & token burn

4. **Hard budget cap:** Is there a cap that stops an agent mid-run when it exceeds a token/dollar limit — not just a dashboard you check after the fact?
5. **Purchase gating:** Are purchases, subscription changes, and checkout flows hard-blocked for agents, so an agent cannot complete a payment on its own?
6. **Cost receipts:** Do you review per-run cost receipts (model, tokens, dollars) at least weekly?

## C. Action gating & blast radius

7. **Destructive-action gates:** Are deletes, force-pushes, prod deploys, and mass sends gated behind approval — or can YOLO mode reach them directly?
8. **Scoped credentials:** Does the agent run with least-privilege, per-task credentials rather than your full personal GitHub/cloud/email tokens?
9. **Contained blast radius:** If an agent goes rogue in one project, is it sandboxed (worktree, container, separate user) so it can't touch unrelated repos and data?

## D. Recovery & evidence

10. **Reconstructable runs:** When a run misbehaves, do your logs/receipts let you reconstruct what happened — commands run, files touched, cost incurred?
11. **Verification gate:** Must agent work pass a smoke test or verification gate before it ships (merge, deploy, publish)?
12. **Deterministic guards:** After an incident, do you install a mechanical guard against that failure class — not just "prompt it better next time"?

## Your score

| Score | Band | What it means |
|---|---|---|
| 0–9 | **Exposed** | You're one bad loop away from a frozen machine or a surprise bill. Start with the free kit in this repo today — it exists for exactly this. |
| 10–15 | **At Risk** | Some walls are up, but at least one failure class has a clear path through. Fix your lowest-scoring category first. |
| 16–20 | **Guarded** | Solid posture. The gaps left are the specific ones — worth a targeted look rather than a rebuild. |
| 21–24 | **Hardened** | You're ahead of nearly everyone. Nothing here to sell you — share your setup; the ecosystem needs the example. |

**Your weakest category is the one to fix first.** On a tie, fix in order A → B → C → D:
a runaway freezes you today, spend leaks bleed you weekly, gating failures are rarer but irreversible, and recovery gaps only bite after the others already have.

## Next steps (matched to score, not upsold)

- **Free, right now:** the guards in this repo — runaway-kill, timeouts, resource limits, spend gates. [Start at the README](../README.md). If your failures cost less than $1,500, use the free kit and keep your money.
- **$499 Diagnostic Call** — 20-min live review of your lowest-scoring category, root-cause triage readout, recommended prevention rules, no installation. [Book via Stripe](https://buy.stripe.com/9B69ATbmI4r4aK5eOD3sI3k) or [pick a slot first](https://cal.com/igor-g-kvqxfo/30min).
- **$1,500 AI Agent Hardening Sprint** — one recurring failure pattern, root-caused, guardrails installed, smoke test + before/after evidence at the end. [Details](./AI-AGENT-HARDENING.md) · [Stripe](https://buy.stripe.com/4gM28r1M8g9M3hD0XN3sI38).
- **Public-safe intake:** [open a paid hardening inquiry](https://github.com/IgorGanapolsky/mac-yolo-safeguards/issues/new?template=paid-hardening-inquiry.yml) or email [iganapolsky@gmail.com](mailto:iganapolsky@gmail.com).

*Posting your score somewhere? The interactive version generates a copyable results block with your per-category breakdown.*
