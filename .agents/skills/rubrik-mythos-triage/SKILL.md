---
name: rubrik-mythos-triage
description: >
  Rubrik Mythos high-ROI steal: AI discovery outruns human review. Multi-pass
  filter with file-hash checkpoints, trust-boundary prune, tightly-scoped
  auto-remediation, and Track B packets for secrets/eval/chains. $10/mo
  fail-closed (local scan, no paid API). Trigger: Rubrik, Mythos, Glasswing,
  vulnerability triage, what not to automate.
---

# Rubrik Mythos triage

Source: https://thenewstack.io/rubrik-mythos-learnings/ (Nithrakashyap, Aug 2026).

## Steal (not a clone)

| Rubrik lesson | Here |
|---|---|
| Do not hire more reviewers | Filter before humans see findings |
| Harness manages tool calls + checkpoints | File-hash resume; unchanged files skipped |
| Business/security context + trust boundaries | UNTRUSTED_ENTRY vs INTERNAL; fixtures pruned |
| Automate only a tight subset | Track A: cmd/SQLi/CORS only |
| Everything else is human | Secrets, eval, path traversal, cross-file taint chains → Track B |

## CLI

```
bin/rubrik-triage doctor --json
bin/rubrik-triage scan <dir> --json
bin/rubrik-triage queue --json
```

State: `~/.hermes/rubrik-mythos/` (or `RUBRIK_MYTHOS_STATE_DIR`). Metered API is disabled.
