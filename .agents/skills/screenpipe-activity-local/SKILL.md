---
name: screenpipe-activity-local
description: >
  Screenpipe v2.6.56 process steal (Activity + multi-harness + local-first egress)
  without installing Screenpipe capture. Uses mac-computer-history semantic events,
  Activity bands (task/meeting/break), recall, opt-in --egress-ok packs for Cursor /
  Claude Code / Codex / Grok. Trigger: screenpipe, screenpi.pe, Activity timeline,
  computer history local, harness context pack, what context leaves. Slash:
  /screenpipe-activity-local. We are not Screenpipe.
---

# Screenpipe Activity — local fleet wiring

**Source:** Screenpipe founder email 2026-08-19 (louis@screenpi.pe) + v2.6.56 Activity.  
**Pitch we steal:** turn *chosen* work history into agent context; stay on-device by default; support any harness.

## Honest fit

| Transfer | Do NOT rebuild |
|----------|----------------|
| Activity bands (task / meeting / break) | Screen/audio OCR recorder |
| Recall/search local history | Native macOS Screenpipe UI |
| Multi-harness pack (Cursor/Claude/Codex/Grok) | Screenpipe cloud sync product |
| Opt-in egress (`--egress-ok`) | Keystroke / window capture |

## Commands

```bash
# Activity timeline from ~/.hermes/computer_history.json
node tools/hermes-screenpipe-activity.js timeline --since 24h
node tools/hermes-screenpipe-activity.js recall deploy --since 7d --json

# Pack for a harness — cloud needs --egress-ok
node tools/hermes-screenpipe-activity.js pack --harness hermes-yolo
node tools/hermes-screenpipe-activity.js pack --harness cursor --egress-ok --distill

# Building blocks
node tools/hermes-activity-skill-distiller.js
node tools/hermes-universal-harness-adapter.js
node tools/mac-computer-history.js query "PR" --since 24h
```

## Record events (feeds Activity)

```bash
node tools/mac-computer-history.js record --type file_edit --detail "path/to/file.ts"
node tools/mac-computer-history.js record --type git_commit --detail "feat: …"
```

## Related

- `/hermes-timeline-intent-engine` · `/hosted-computer-stack` (FAIL_CLOSED on surveillance clones)
- `/high-roi-steal-and-finish` · `/ona-last-mile`
