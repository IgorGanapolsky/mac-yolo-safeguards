---
name: gemini-decisions-hold-gate
description: "Name a held Mac YOLO offer for a freeze complaint, and refuse a Gemini Decisions call, a send, or Google's latency and price as local results."
---

# Gemini Decisions hold gate

Use this before a freeze complaint is turned into a Mac YOLO offer.

Google's Decisions API post (11 Nov 2026) describes a closed set of answers, a confidence score, and a human for the ambiguous case. Their latency and price figures stay theirs. This gate does not call that API.

## What this gate does

- A freeze complaint about Claude Code, Cursor, or Codex on a Mac is held.
- One machine holds Mac YOLO Pro Guard at `/go/pro`.
- A request to diagnose what is wrong holds the Agent Reliability Diagnostic at `/go/diagnostic`.
- A team or several Macs holds the AI Agent Hardening Sprint at `/go/sprint`.
- A complaint that asks for two of those, or names the partner pilot, waits for a person. No offer is attached.
- Broward sales, tax deeds, foreclosures, and other real-estate work are blocked with `other_business`. They are not a Mac YOLO offer.
- `call`, or a note that names `generativelanguage.googleapis.com`, `gemini-decision-1`, or `GEMINI_API_KEY`, is blocked with `remote_call`.
- `send`, `charge`, `checkout`, or a note that sends mail or opens a checkout, is blocked with `send_or_charge`.
- Recording 150–250 ms, $0.10, 5x cheaper, or 40% lower latency is blocked with `vendor_figure_as_local` unless the note attributes those figures to Google.
- `purchased`, `emailSent`, and `remoteCall` stay false. Local latency and cost fields stay null.

## Commands

```bash
node tools/gemini-decisions-hold-gate.js --action hold --signal "Cursor froze my Mac and filled swap"
node tools/gemini-decisions-hold-gate.js --action call --signal "Cursor froze my Mac and filled swap"
node tests/test-gemini-decisions-hold-gate.js
```

A clear, held, or human review exits 0. A blocked review exits 2.
