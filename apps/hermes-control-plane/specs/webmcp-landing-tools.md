# Spec: WebMCP landing tools

In-repo template for the fleet's spec-driven-feature discipline (Tessl-derived, adopted 2026-08-27). Behaviors below are pinned by the Verification test; a change to one is a deliberate change to both files in one PR.

## Intent

Let browser AI agents (Chrome 149+ WebMCP origin trial) answer "what does this site offer?" and "is the service up?" directly from the thumbgate.app landing page, without scraping — so an agent-assisted visitor can be qualified by their agent instead of bouncing.

## Behaviors

1. Exactly two WebMCP tools are exposed: `get_hermes_offer` and `get_service_status`.
2. Both tools are read-only (`annotations.readOnlyHint: true`); neither books, buys, nor submits anything.
3. `get_hermes_offer` states the hosted-Hermes offer using the landing's own claims, including the recurring price form `$10/month` (never a bare one-time-looking `$10`).
4. `get_service_status` reads only the same-origin `/api/health` endpoint and degrades to a plain string on failure — it never throws into the page.
5. Registration is feature-detected on `document.modelContext`; in any browser without WebMCP the component renders nothing and does nothing.
6. No `toolautosubmit`, no `executeTool`, no write-capable tool surface exists on the landing.

## Non-goals

- No checkout, booking, or form-submission tools (human confirmation stays in the funnel).
- No parallel credential flow for agents; sensitive actions stay behind the existing session.
- No behavior for visitors without WebMCP — zero visual or SSR impact.

## Verification

`tests/webmcp-steal.test.mjs` (node --test) asserts every Behavior, including that this spec file itself names the tool surface and price form. Library truth source: Chrome WebMCP docs as captured 2026-08-26 (imperative API on `document.modelContext`).
