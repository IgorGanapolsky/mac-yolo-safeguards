# Hermes agent access policy — July 2026

Date: 2026-07-20
Task: `T-HERMES-AGENT-ACCESS-20260720`

## Decision

Keep Tailscale as the private transport boundary and add authorization inside the existing Hermes protocol server. Each bearer maps to an explicit actor (`human`, `service`, `pipeline`, or `agent`), account, bounded scope set, and optional expiry. Every allowed or denied scoped request produces a bounded, secret-free decision receipt.

This is intentionally a small policy layer in `packages/hermes-protocol`; it does not add a new proxy, identity vendor, search cluster, or mobile/native dependency.

## Why this is the highest-ROI change

1. Network reachability is not application authorization. A tailnet limits who can reach Hermes, but Hermes must still decide which actor may read, write, or delete a thread.
2. The protocol is already the shared mutation boundary used by mobile and web. Enforcing scopes there prevents policy drift between clients.
3. Structured decision receipts provide the minimum useful evidence for access incidents without persisting bearer tokens, request bodies, chat content, or headers.
4. Legacy `Map<bearerToken, accountId>` callers remain valid, so the policy can land without a coordinated migration.

## Policy contract

| Concern | Contract |
| --- | --- |
| Actor identity | `actor_type` plus stable `actor_id` |
| Tenant boundary | Required `account_id`; the server continues to overwrite client-supplied account IDs |
| Read access | `threads:read` |
| Mutation access | `threads:write` |
| Tombstone/delete access | `threads:delete` |
| Expiry | ISO-8601 `expires_at`; checked on every scoped request |
| Malformed grant | Fail closed with 401 |
| Missing scope | Fail closed with 403 |
| Receipt retention | In-memory bounded ring; 500 decisions by default |
| Receipt privacy | No bearer, authorization header, request body, thread content, or query value |
| Telemetry callback | Best-effort only; callback failure cannot change the authorization result |

## Primary-source findings

- Tailscale recommends least-privilege access controls, removal of unused clients and keys, tests for access policy, and auditability of actor, target, and time. That supports keeping Tailscale as transport while enforcing actor-level permissions in Hermes.
- Tailscale OAuth clients use scoped access and their access tokens expire after one hour. Hermes grants therefore also need explicit scopes and runtime expiry rather than treating possession of a long-lived bearer as unlimited authority.
- OpenTelemetry's HTTP semantic conventions define stable request method and server attributes and warn that capturing request headers may record sensitive values. Hermes receipts retain only a normalized method/path and actor/policy result; they deliberately exclude headers and content.
- OpenTelemetry's GenAI agent conventions provide a future export vocabulary, but are still evolving. This change exposes a callback instead of hard-wiring a telemetry vendor or unstable agent schema.

## Sources

- Tailscale, *Best practices to secure your tailnet*, validated 2026-01-20: <https://tailscale.com/docs/reference/best-practices/security>
- Tailscale, *OAuth clients*: <https://tailscale.com/docs/features/oauth-clients>
- Tailscale, *Changelog*: <https://tailscale.com/changelog>
- OpenTelemetry, *Semantic conventions for HTTP spans*: <https://opentelemetry.io/docs/specs/semconv/http/http-spans/>
- OpenTelemetry, *Semantic conventions for GenAI agent spans*: <https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/>

## Verification required before merge

- Protocol coverage gate passes.
- Protocol two-client HTTP E2E passes under concurrent writers, ambiguous acknowledgements, restart, deletion, and cross-account denial.
- Dashboard coverage and Playwright E2E pass without changing the dashboard.
- Public API surface remains intentional and legacy bearer configuration remains compatible.

## Explicit non-goals

- No claim that Tailscale itself is always available.
- No replacement for provider-side audit logs or production log export.
- No secrets persisted in receipts.
- No mobile OTA or native store build in this task.
