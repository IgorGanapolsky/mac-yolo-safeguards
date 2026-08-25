---
name: vellum-hybrid-engine
description: >
  Hermes hybrid hosting (local Apple Silicon vs user-owned always-on) plus
  8-tier memory and credential leak audit. Inspired by Vellum Assistant.
  Not official Vellum Cloud. Not ThumbGate.app. Slash: /vellum.
---

# Vellum-style hybrid hosting (Hermes)

```bash
bin/vellum-yolo --doctor
bin/vellum-yolo --mode local
bin/vellum-yolo --mode cloud
node tests/test-vellum-hybrid-engine.js
```

`cloud` means a **Hermes always-on URL** (`HERMES_ALWAYS_ON_URL`, default
`http://127.0.0.1:8642/v1`). It is not `thumbgate.app` and not vellum.ai paid
Mighty/Super/Ultra.

For the Grok Bot alternative (identity, import inventory, eval-gated promote)
use `/vellum-bot`.
