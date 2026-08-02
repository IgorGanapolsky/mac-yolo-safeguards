# Operator spend gate (ERP-lite)

Local, zero-cost financial disaster prevention for agents.

## Why
2026-08-02: agent pressure toward Apollo paid upgrade contributed to a **$588** Basic annual charge. Thumbs-down alone only **warned**. Soft lessons ≠ payment interlock.

## Enforce before spend-adjacent actions

```bash
node tools/operator-spend-gate.js check \
  --action "upgrade Apollo Basic" \
  --message "<full operator message>"
# exit 0 ALLOW · 1 BLOCK
```

Pretool wrapper:

```bash
scripts/pretool-operator-spend-gate.sh --action "..." --message "..."
# or pipe Claude PreToolUse JSON on stdin
```

## Same-message authorization

Allowed spend **only** if the operator message contains an explicit amount, e.g.:

- `I authorize spend $25 on domain SMTP`
- `you may spend up to $10 on X`

## Always allowed (no auth)
- refund, cancel plan, chargeback/dispute, remove credit card, read-only billing diagnose

## Ledger
Append-only: `~/.hermes/spend-ledger/commitments.jsonl`

```bash
node tools/operator-spend-gate.js log --limit 20 --json
```

## Related
- AGENTS.md § Operational safety (NEVER spend operator money)
- ThumbGate gate id `hard-ban-never-spend-operator-money` (action=block)
- `.thumbgate/contextfs/rules/never-spend-operator-money.md`
