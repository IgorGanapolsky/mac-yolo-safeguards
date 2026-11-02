# feat(landing): read-only WebMCP tools on thumbgate.app landing

<!-- source: Merged PR | id: 2141 | closed: 2026-10-29T14:02:17.964Z -->

## Question

feat(landing): read-only WebMCP tools on thumbgate.app landing

## Answer

- `lib/webmcp-tools.mjs` — framework-free descriptors for two **read-only** tools (`annotations.readOnlyHint: true`):
  - `get_hermes_offer` — the hosted-Hermes offer summary (copy matches the landing's existing claims).
  - `get_service_status` — same-origin `/api/health` readback; degrades to a plain string on failure, never throws.
- `app/WebMcpTools.tsx` — `"use client"` null-render hook mounted from the root layout (same pattern as `SentryInit`). Feature-detects `document.modelContext`, reg

[View source](https://github.com/IgorGanapolsky/mac-yolo-safeguards/pull/2141)

---
