---
name: webmcp-agent-readiness
description: >
  Design and audit WebMCP tools plus recurring agent-journey evaluations for
  quote, booking, support, and commerce flows. Use for WebMCP, agent readiness,
  agent mystery shopping, or structured browser tool conversion work.
---

# WebMCP agent readiness

Use WebMCP as a progressive enhancement for one valuable customer journey, not
as a claim that an entire site is agent-ready. WebMCP is still a draft and its
Chrome implementation is an origin trial, so keep authored contracts, observed
browser support, journey execution, and real conversion outcomes separate.

## Build or audit a journey

1. Name one falsifiable journey such as “qualify and prepare a consultation.”
2. Expose the smallest tool set needed for that journey. Prefer declarative
   form annotations for ordinary forms and the imperative API only when state
   or custom JavaScript behavior requires it.
   Use the current `document.modelContext` API; `navigator.modelContext` is
   deprecated. Register with an `AbortSignal` and abort it on unmount.
3. Keep the readiness manifest separate from the browser API. Standard tool
   fields live under `tools`; ThumbGate safety policy lives under `policies`.
4. Mark reads with `readOnlyHint=true`. Mark untrusted returned content with
   `untrustedContentHint=true`. Require confirmation for bookings, purchases,
   form submissions, and other consequential actions.
   Reject undeclared inputs in the handler as well as the schema, propagate the
   invocation `AbortSignal` to network work, return structured `content`, omit
   PII, and do not add cross-origin `exposedTo` entries without a specific need.
5. Run the static gate before browser work:

```bash
node tools/webmcp-agent-readiness.js \
  --manifest path/to/webmcp-readiness.json \
  --static-only --json
```

6. Capture runtime evidence only from a dedicated test browser/profile or an
   available WebMCP-aware DevTools/inspector path. Do not enable flags or attach
   automation to Igor's daily Chrome profile. If no runtime path is available,
   report `STATIC_READY`; do not promote it to `READY`.
7. Bind evidence to the manifest SHA and evaluate the complete tool order. For
   each call, also match arguments and enforce duration, tool-call, cost, and
   unnecessary-step budgets. For a production preview, stop before the side
   effect. Execute consequential actions only in an authorized sandbox.

```bash
node tools/webmcp-agent-readiness.js \
  --manifest path/to/webmcp-readiness.json \
  --runtime path/to/webmcp-runtime.json \
  --artifact path/to/raw-browser-capture.jsonl \
  --out /tmp/webmcp-readiness-report.json --json
```

Read [references/manifest.md](references/manifest.md) when authoring the
manifest or runtime-evidence shape.

ThumbGate's checked-in contract is `config/thumbgate-webmcp-readiness.json`;
its mounted runtime tools live in `apps/hermes-control-plane/lib/webmcp-tools.ts`.

## Interpret the result

- `BLOCKED`: the authored tool, policy, or journey contract is unsafe or invalid.
- `UNVERIFIED`: static checks passed, but fresh matching runtime proof did not.
- `STATIC_READY`: static-only gate passed; this is not observed browser success.
- `READY`: fresh evidence matches the exact manifest and every journey passes.

Never infer leads, bookings, purchases, or revenue from `READY`. Those require
their own provider-visible receipts.

## Sources

- https://developer.chrome.com/docs/ai/webmcp
- https://developer.chrome.com/docs/ai/webmcp/evals
- https://developer.chrome.com/docs/ai/webmcp/secure-tools
- https://github.com/webmachinelearning/webmcp
- https://webmachinelearning.github.io/webmcp/
