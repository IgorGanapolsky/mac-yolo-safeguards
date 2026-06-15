# AI Agent Reliability Hardening

This is the paid implementation path for teams already using autonomous coding agents and paying for repeat failures in time, tokens, broken local machines, or client trust.

> [!IMPORTANT]
> **API Billing Protection (June 15, 2026):** Starting June 15, Anthropic is shifting programmatic and CLI agent usage to standard API rate charges, removing subscription-capped protections. Without execution guardrails, a stuck loop or retry storm will directly deplete your API credit pool or hit your credit card for hundreds of dollars in minutes.

The free `mac-yolo-safeguards` kit protects a single Mac from a narrow class of runaway CPU and memory simulator loops. Paid hardening is for the larger system: what failed, why it repeated, which guardrail blocks it next time, and how the team proves that the fix works.

## Who this is for

- Founders using Claude Code, Cursor, Codex, Antigravity, or similar agents daily.
- AI automation agencies shipping agentic workflows for clients.
- Dev teams that have already seen runaway local processes, repeated hallucinated fixes, token loops, or unsafe YOLO-mode behavior.
- Consultants who need a repeatable reliability layer before deploying AI-agent workflows for customers.

## Offers

| Offer | Price | Scope | Proof delivered |
|---|---:|---|---|
| Agent Reliability Diagnostic | $499 | One failure pattern, one repo or workflow, one written readout. | Root-cause summary, risk map, and prioritized hardening plan. |
| AI Agent Hardening Sprint | $1,500 | Install and tune Mac guardrails plus ThumbGate memory gates for one real workflow. | Working guardrails, smoke-test evidence, and handoff notes. |
| [Partner Pilot](./PARTNER-PILOT.md) | $3,000 | Turn one agency or consulting workflow into a repeatable reliability package. | Sprint deliverables plus client checklist, demo script, and first rollout support. |

## What gets hardened

- Local runaway protection: LaunchAgent, CPU/memory thresholds, simulator shutdown, and health check.
- Agent behavior memory: ThumbGate captures known bad decisions and blocks repeat failures through MCP-compatible gates.
- Evidence trail: before/after commands, failure reproduction where practical, and verification notes.
- Operator workflow: what to do when a guard fires, who owns escalation, and what should never be auto-killed.

## What is out of scope

- No promise that every AI-agent mistake can be prevented.
- No blanket auto-killing of GUI apps with unsaved work.
- No telemetry added to the open-source guard.
- No speculative enterprise platform buildout before a paid workflow proves demand.

## Intake

Email `iganapolsky@gmail.com`, book through [Cal.com](https://cal.com/igor-g-kvqxfo/30min), or open a public-safe [paid hardening inquiry](https://github.com/IgorGanapolsky/mac-yolo-safeguards/issues/new?template=paid-hardening-inquiry.yml) with:

1. Which agent stack you use.
2. The failure mode you want stopped.
3. Whether the failure cost time, API spend, data safety, client trust, or machine stability.
4. Whether you need a one-time fix, a team rollout, or a client-facing package.

## How paid work starts

Qualified buyers are routed with the [Sales Close Kit](./SALES-CLOSE-KIT.md):

- $499 diagnostic when the failure is real but the fix is not yet obvious.
- $1,500 sprint when one repeated failure pattern needs guardrails and proof.
- $3,000 [partner pilot](./PARTNER-PILOT.md) when an agency or consultant needs a repeatable client package.

Payment is due before implementation work starts. The free repo remains available for anyone who only needs self-serve installation.

## Revenue math

The business target is $300/day after tax. Low-price SaaS alone needs hundreds of active users to reach that. This offer ladder is designed to reach the target with a small number of qualified buyers:

| Offer | Monthly closes needed for target |
|---|---:|
| $499 diagnostic | about 29 |
| $1,500 sprint | about 10 |
| $3,000 partner pilot | about 5 |

The SaaS layer remains useful, but it should attach to paid hardening work until the top-of-funnel is large enough for product-led growth.
