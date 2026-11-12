---
name: context-weight-gate
description: "Refuse an unanchored timeline, a second timeline database, a raw screen-tree payload, a model call, and an Electron or generated native window, and keep latency and memory figures unmeasured."
---

# Context weight gate

Use this before a meeting note is treated as one clock, before screen text is sent onward, before a task is sent to a model, or before a local screen is generated from a table.

The ideas taken from https://bugsee.com/, https://www.firecrawl.dev/, https://openrouter.ai/, and https://www.jetadmin.io/ are a shared clock, a dense text extract, a cheaper path for repetitive work, and a screen built from a schema. This gate keeps the local piece and refuses the rest. It does not install those products, open a database, call a model, capture the screen, or start a window. Their latency and size claims stay theirs. Local fields stay null.

A note that only cites those pages stays clear. Leaving the menu-bar app alone stays clear. Naming a model, without a route or a call, stays clear.

## What this gate does

- `meeting` or `record`, or `dayglass_get_live_meeting`, without the same integer stamp on the spoken line, the terminal line, and the screen line, is blocked with `unanchored_timeline` and `humanReview` true. `timestampMs: Date.now()` is blocked the same way. When the three stamps match, the gate returns markdown and still leaves `published` false.
- `database`, or a timeline table, a virtual table, or `node:sqlite`, is blocked with `second_database`. The gate does not open a database.
- A command that runs `bugsee-firecrawl-openrouter-jetadmin-engine` is blocked with `vendor_engine`.
- `compile` turns a code window into a fenced block and slide lines into headings. An accessibility tree is blocked with `geometric_noise`. `localCompressionPct` stays null.
- `route` or `call`, a model hostname path, or a send toward a named model is blocked with `remote_call`. Repetitive formatting, basic tests, and schema mapping are labeled `light`. A multi-file migration or abstract logic is labeled `heavy`. Sending the light label to a heavy model, or the heavy label to a light model, is `tier_mismatch`. `routed` stays false.
- `ui`, `webview`, `swift`, or a write onto a `.swift` file is blocked with `vendor_ui`. A column list becomes a markdown table. `processStarted` and `fileWritten` stay false.
- Install of those products or Electron is `vendor_install`. A recorded compression ratio, a recorded 93 MB idle figure, or an unattributed exact-clock, density, or cache claim is `unmeasured_figure`.
- `applied` stays false. `millisecondExact`, `localLatencyMs`, `localCompressionPct`, and `idleRamMb` stay null.

## Commands

```bash
node tools/context-weight-gate.js --action note --note "Leave the menu-bar app alone."
node tools/context-weight-gate.js --action route --task "formatting data"
node tests/test-context-weight-gate.js
```

A clear review exits 0. A blocked review exits 2.
