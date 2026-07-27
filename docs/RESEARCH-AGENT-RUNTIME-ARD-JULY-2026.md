# ThumbGate agent runtime and ARD decision — July 2026

## Verdict

The highest-return change is not a new data platform. It is making the existing D1 control plane enforce the runtime guarantees already promised to users: renewable leases, hard expiry, content-free audit timing, a server-side authentication boundary, and standards-based public capability discovery.

ThumbGate should keep transactional routing in Cloudflare D1. Snowflake can become a sanitized analytics sink after external usage creates enough events to justify it. Spark and Databricks add cost and operational surface without solving today's correctness, privacy, or revenue bottleneck.

## Evidence translated into product decisions

| Evidence | ThumbGate implication | Action |
|---|---|---|
| [The New Stack: The Agent Runtime Application Server](https://thenewstack.io/agent-runtime-application-server/) emphasizes durable state, resume, isolation, identity, egress control, tools, and auditability for long-running agents. The article is sponsored by Microsoft Azure, so its product framing is not treated as independent benchmarking. | A 150-second local task cannot safely rely on a non-renewable 90-second lease. Runtime identity must be enforced in D1, not inferred from UI state. | Renew every 30 seconds; reject renewal and completion after expiry; clear lease authority on completion; audit route/generation/duration without prompt or result content. |
| [Google's ARD announcement](https://developers.googleblog.com/announcing-the-agentic-resource-discovery-specification/) defines a domain-owned `/.well-known/ai-catalog.json` handoff to native protocols. | ThumbGate can be discoverable without exposing chats, tokens, local gateway URLs, or private task endpoints. | Publish one ARD 1.0 catalog entry pointing to public documentation and current plan discovery only. Do not invent a DID or trust attestation. |
| The [official ARD 1.0 JSON schema](https://github.com/ards-project/ard-spec/blob/main/spec/schemas/ai-catalog.schema.json) requires `specVersion`, `entries`, a namespaced `urn:air` identifier, media type, and exactly one of `url` or embedded `data`. | Discovery must be machine-valid rather than a marketing-shaped JSON file. | Add a contract test for the official required fields, URN/media-type constraints, 2–5 representative queries, and public-safe contents. |
| The user-supplied July 21 InfoQ newsletter highlighted concrete user actions as implicit labels, production telemetry/evals, relational JSON/vector storage, and repo-bound context stores. The directly verified [InfoQ context-store article](https://www.infoq.com/articles/ai-speed-context-store-architecture/) recommends versioned specs, tests, and fitness functions alongside code. | ThumbGate's thumbs are valuable only when private, durable, organization-scoped, and connected to lessons. Architecture claims need executable tests. | Keep feedback in D1; use feedback rate and corrected outcomes as model/eval labels; encode authentication, fencing, and discovery as CI contracts. |

## Data-platform decision gate

| Platform | Use now? | Trigger to reconsider |
|---|---:|---|
| Cloudflare D1 | Yes | Remains the transactional source for sessions, devices, tasks, leases, feedback, and audit events. |
| DuckDB/local Python | Yes | Use for bounded product/revenue analysis and offline experiments while event volume is small. |
| Snowflake | Later, narrow scope | Add a least-privilege read/write pipeline for sanitized Gold analytics when external customers and recurring analysis justify the warehouse. Never export raw prompts, responses, session tokens, keys, or device credentials. |
| Spark/Databricks | No | Reconsider only with sustained distributed-scale ingestion/transforms (roughly 10+ GB/day), funded enterprise integration requirements, distributed streaming, or distributed ML training that a single process cannot handle. |

## Security incident finding (2026-07-21 16:04 ET)

The screenshot showing chats at `/dashboard` was rendered with an existing valid browser session. A cache-bypassed no-cookie production probe returned `401 {"error":"sign in required"}` from both `/api/threads` and `/api/tasks`, and the anonymous dashboard HTML contained none of the visible chat titles or account names. However, `/dashboard` itself still returned a client shell with HTTP 200 and relied on client API redirects. That ambiguity is removed by a server-side dashboard layout that redirects anonymous requests before any private client shell renders, including nested lessons routes.

## Success metrics

- Security: anonymous dashboard redirect rate is 100%; private workspace APIs stay 401 without a session.
- Reliability: renewal succeeds before expiry; stale renewal/completion returns 409; no completion can clear a newer generation.
- Privacy: runtime audit metadata contains route, generation, lease expiry, and duration only—never prompt/result content or authority tokens.
- Product learning: thumbs coverage, downvote-note rate, subsequent success rate, and cloud/local outcome rate can be analyzed from organization-scoped facts.
- Revenue: measure external paid subscriptions and net margin separately from owner/internal purchases; infrastructure readiness is not revenue proof.
