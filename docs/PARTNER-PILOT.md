# Partner Pilot

The Partner Pilot is a paid reliability package for agencies, consultants, and AI implementation teams that already ship agentic workflows for clients.

Price: `$3,000`

The goal is not to install a shell script and leave. The goal is to turn one repeated AI-agent failure pattern into a repeatable client-facing reliability motion: diagnose it, harden it, prove the guardrail works, and package the proof so you can use it in your own delivery.

## Best Fit

This is for teams that can say at least one of these is true:

- You build or resell workflows using Claude Code, Cursor, Codex, Antigravity, MCP tools, or similar agents.
- A client workflow has already hit a repeated failure: runaway local process, retry storm, bad tool call, broken generated code, token burn, or unsafe YOLO-mode behavior.
- You need a practical reliability add-on you can explain to clients without pretending every agent mistake is preventable.
- You want evidence, checklists, and rollout notes, not generic AI safety advice.

Use the free repo instead if the problem is only a one-off Mac freeze or self-serve installation.

## Scope

One Partner Pilot covers one workflow and one repeated failure pattern.

Included:

- Failure-pattern intake and root-cause hypothesis.
- Local guardrail review or install where `mac-yolo-safeguards` applies.
- ThumbGate repeated-mistake gate design where the failure is behavioral rather than purely local.
- Smoke-test plan and verification notes.
- Client-facing checklist for when this failure appears in delivery.
- Demo script for showing the reliability layer without exposing private client details.
- First rollout support for one agency or consulting workflow.

Not included:

- A guarantee that every agent mistake is preventable.
- Auto-killing GUI apps with unsaved work.
- SOC 2, procurement, or enterprise compliance artifacts.
- A broad platform buildout before one paid workflow proves the need.
- Telemetry added to the open-source guard.

## Deliverables

At the end of the pilot, you should have:

- A one-page incident/readout for the repeated failure.
- A hardening checklist for the target workflow.
- Before/after verification notes or a reason reproduction was not practical.
- A client-safe demo script.
- Handoff notes covering operation, escalation, and limits.
- A recommendation on whether this should become a repeatable offer for your clients.

## Intake

Send an email to `iganapolsky@gmail.com`, book a 20-minute triage through [Cal.com](https://cal.com/igor-g-kvqxfo/30min), or open a public-safe [paid hardening inquiry](https://github.com/IgorGanapolsky/mac-yolo-safeguards/issues/new?template=paid-hardening-inquiry.yml).

Include:

1. The agent stack you use.
2. The repeated failure pattern.
3. What one incident costs in hours, spend, delivery risk, or client trust.
4. Whether the workflow is internal or client-facing.
5. What evidence would convince you the failure is blocked or escalated.

Payment is due before implementation work starts. If the failure is real but the right fix is unclear, start with the `$499` diagnostic instead.
