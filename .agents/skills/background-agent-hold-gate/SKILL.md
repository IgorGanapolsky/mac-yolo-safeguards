---
name: background-agent-hold-gate
description: "Refuse a background agent that keeps running after someone steps away, and refuse an unattended write into a design project file."
---

# Background agent hold gate

Use this before an agent keeps working after a person leaves, or before it writes a native design project.

The idea taken from https://news.adobe.com/news/2026/11/adobe-powers-new-era-of-creativity is that an agent can keep going in the background and can change a project file in place. This gate refuses both. It does not install a creative suite, call a model, or write a project file. Their detail and conference claims stay theirs. Local fields stay null.

A note that only cites that page stays clear. Saying a video app is closed, or leaving a media cache alone, stays clear. Opening a project file stays clear. Saving or exporting one does not.

## What this gate does

- `install`, or install / add / enable next to Firefly, Creative Cloud, GenStudio, a creative agent, or a local MCP connector, is blocked with `vendor_install`.
- `background`, `always-on`, or a note that starts, leaves, keeps, or runs an always-on or background agent is blocked with `background_agent` and `humanReview` true. The gate does not leave the agent running.
- `write-project`, `edit-project`, or save / export / copy onto a `.psd`, `.ai`, `.prproj`, or `.aep` file is blocked with `project_write`.
- "richer detail" or "world's largest creativity conference" as our result is blocked with `vendor_claim_as_local`, unless the note names Adobe.
- `applied`, `agentLeftRunning`, and `projectWritten` stay false. `localSpeedup` and `localDetailGain` stay null.

## Commands

```bash
node tools/background-agent-hold-gate.js --action note --note "Premiere is closed."
node tools/background-agent-hold-gate.js --action background
node tests/test-background-agent-hold-gate.js
```

A clear review exits 0. A blocked review exits 2.
