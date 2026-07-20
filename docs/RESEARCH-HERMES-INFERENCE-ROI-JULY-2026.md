# Leash: inference, agent-framework, and competitive ROI — July 2026

Research run: `trun_4f230ab7c8f043bc924830a82ef48623`

Source packet: the supplied two-page Together AI marketing email, SHA-256
`9f9455e41b03866768bd257c8a30f9e0328ee3ba4f6820473074890123d3471d`

The email's personal mailbox headers are deliberately excluded. Its claims are
vendor marketing until verified against current primary sources.

## Decision

The companies featured in the email are not Leash competitors:

- Cursor, Decagon, and Hedra are applications that consume inference.
- Together AI is a potential inference supplier.
- Cloudflare, Fly.io, WorkOS, and Stripe are infrastructure suppliers.

The important correction is that **CloudCLI is a direct competitor** outside
the email's comparison set. Its open-source UI and hosted product provide
cross-device sessions, persistent cloud environments, mobile access, terminals,
files, Git, and multiple coding-agent CLIs. As checked on July 20, its public
site starts at EUR 7/month and the GitHub repository reports more than 12,000
stars. Leash cannot win by being only another session viewer or generic cloud
development environment.

Leash's defensible wedge is governed continuity: signed local pairing, explicit
offline policy, expiring fenced leases, runaway-session intervention, an audit
trail, and the ability to control the same task from Hermes Mobile. The promise
is not merely "the environment stays on"; it is "exactly one approved executor
continues, and the user can inspect or stop it."

## What Strands Agents changes

Strands is an open-source Python and TypeScript agent SDK, not a control-plane
substitute. Its documented hooks, execution limits, context managers, MCP
support, interrupts, tracing, OpenTelemetry support, structured output, and eval
tools make it a strong future **Leash adapter target**.

The lowest-cost integration is a small Strands hook/exporter that sends
content-free lifecycle events to Leash:

1. map agent and tool-call IDs to a Leash run;
2. export start, tool request, tool result, interrupt, completion, and failure;
3. let Leash enforce budgets, kill rules, and approvals before destructive tool
   calls;
4. preserve Strands' model/provider choice; and
5. use the existing Leash dashboard and Hermes Mobile control surface.

This broadens the addressable market beyond Hermes without adding Strands as a
core runtime dependency. It is deferred until `leash.dev` is public and the
first Hermes customer path is proven.

## Verified supplier claims

The following are vendor-reported results, verified on the vendors' own current
pages but not independently audited:

| Source | Reported result | Leash implication |
| --- | --- | --- |
| Together AI / Cursor | Real-time, low-latency coding inference and a reported 31% TPS advantage over the next-fastest OSS engine | Buy optimized inference after demand; do not build an engine |
| Together AI / Decagon | Under 400 ms latency and 6x lower cost per turn versus GPT-5 mini | Measure P95 before promising interactive SLOs |
| Together AI / Hedra | 60% lower infrastructure cost, 3x inference speed, and 300x scale | Dedicated capacity is a later paid-tier optimization, not launch scope |
| Cloudflare | Control-plane/data-plane pattern for Durable Objects | Rent state coordination; keep execution isolated and fenced |
| Stripe | Product-to-feature entitlements and webhook-driven provisioning | Enforce cloud access server-side |
| Fly.io | API-controlled Machines with regional lifecycle management | Suitable managed runner substrate after a real failover passes |

## ROI ranking and implementation status

| Rank | Mechanism | Status in this branch | Proof required before marketing |
| ---: | --- | --- | --- |
| 1 | Free web control, paid cloud continuation | Implemented server-side | Stripe checkout and signed webhook on rotated credentials |
| 2 | Dependency health and structured failure | D1 health endpoint implemented | Public health check on the custom domain |
| 3 | Self-healing reconnect and fenced recovery | Existing connector/lease design; production runner currently degraded | Kill the local machine and observe one cloud completion |
| 4 | First-party funnel analytics | Content-free counters implemented | Production events visible without prompts, emails, IPs, cookies, or user agents |
| 5 | P95 completion latency | Computed from task timestamps in dashboard | Representative production sample |
| 6 | Workload-specific SLOs and TTFT | Deferred | Paid usage and workload data |
| 7 | Dedicated inference | Deferred | Sustained paid load justifies reserved capacity |
| 8 | Strands lifecycle adapter | Deferred | Public Leash path plus at least one integration request |
| 9 | Voice and video | Rejected for launch | Paying demand and measured unit economics |

The current price presentation is $0/month for web control and $29/month for
100 managed cloud continuations. That is a hypothesis, not evidence of
willingness to pay.

## July 20 operational truth

- `leash.dev` is the selected public domain and `Leash by ThumbGate` is the
  selected public brand.
- The direct Cloudflare Worker/D1 target, health probe, analytics counters,
  entitlement checks, and latency display are implemented locally.
- The old generated Sites hostname is owner-only to contain the personal-name
  exposure and is only a rollback artifact.
- `leash.dev` is not yet routed to the Worker.
- The Fly runner reports degraded health after a one-sided token rotation and
  has not completed a real task. It is not self-healed.
- WorkOS and Stripe credentials exposed in chat are not production inputs; new
  rotated credentials are required before activation.
- No public checkout or captured Leash revenue is verified.

## Sources

- [Strands Agents SDK](https://strandsagents.com/)
- [CloudCLI product and pricing](https://cloudcli.ai/)
- [CloudCLI open-source repository](https://github.com/siteboon/claudecodeui)
- [Together AI / Cursor](https://www.together.ai/customers/cursor)
- [Together AI / Decagon](https://www.together.ai/customers/decagon)
- [Together AI / Hedra](https://www.together.ai/customers/hedra)
- [Cloudflare control-plane/data-plane pattern](https://developers.cloudflare.com/reference-architecture/diagrams/storage/durable-object-control-data-plane-pattern)
- [Stripe Entitlements](https://docs.stripe.com/billing/entitlements)
- [Fly Machines](https://fly.io/docs/machines)
- [WorkOS Audit Logs](https://workos.com/audit-logs)
