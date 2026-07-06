# Hermes DOM Action Contract

This is the Page-Agent-inspired browser-control layer Hermes can reuse across local Browser skill work, Chrome skill work, Playwright scripts, and future MCP wiring.

It does not install Alibaba Page Agent, use its demo LLM, or require a Chrome extension. It adapts the high-ROI pattern:

- dehydrate the live page into a compact list of interactive elements
- keep only labels and safe attributes
- translate a natural-language command into a structured action plan
- generate a deterministic in-page JavaScript executor
- gate credential, payment, submit, destructive, and external-navigation actions

## Tool

```bash
node tools/hermes-dom-action-contract.js dehydrate page.html --json
node tools/hermes-dom-action-contract.js plan page.html "Click Log In" --json
node tools/hermes-dom-action-contract.js inject page.html "Type test@example.com in Email Address"
```

The generated JavaScript is intended for an already-controlled page context, such as Browser/Chrome evaluation, a local WebView, or a Playwright `page.evaluate` bridge.

## Safety Rules

- Form values are never exposed in dehydrated output. Non-empty values become `<redacted>`.
- Passwords, tokens, API keys, OTPs, card fields, auth fields, and similar names are marked `credential`.
- Submit, publish, send, save, login, payment, checkout, transfer, destructive, and external-navigation actions require approval unless the caller explicitly allows the risk.
- Generated JavaScript matches elements by exact attribute equality instead of interpolating raw CSS selectors.
- Action results do not echo typed values.

## Why This Helps Hermes

The current Hermes setup often has to operate browser UIs where APIs are missing, stale, or unavailable. Screenshot-heavy control is expensive and brittle. Raw HTML is too noisy and can leak sensitive state. This contract gives Hermes a smaller and safer interface:

1. Inspect a sanitized page map.
2. Choose from indexed targets.
3. Produce an auditable action plan.
4. Refuse risky actions until approval is explicit.
5. Execute inside the page only after the plan is accepted.

## Upstream Research

- Alibaba Page Agent repository: https://github.com/alibaba/page-agent
- Page Agent MCP package notes: https://github.com/alibaba/page-agent/tree/main/packages/mcp
- MarkTechPost summary provided by Igor: https://www.marktechpost.com/2026/07/02/meet-alibabas-page-agent-a-javascript-in-page-gui-agent-that-controls-web-interfaces-with-natural-language-through-the-dom/

The upstream project also supports an optional Chrome extension and MCP server. Hermes should treat that as a later integration option, not the default. The default path should remain local, dependency-light, and approval-gated.

## Verification

```bash
node tests/test-hermes-dom-action-contract.js
```

The focused test covers attribute parsing, text cleanup, value masking, hidden-input removal, href redaction, action planning, approval gates, JS generation, and the research-adaptation brief.
