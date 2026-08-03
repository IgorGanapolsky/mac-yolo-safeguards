# Reasoning & proof harness (OpenAI walkthroughs + ten-proofs + arXiv counting)

Steals **methodology**, not math content, into this repo’s agent tools.

| Source | Idea stolen | Owner tool |
|--------|-------------|------------|
| [Reasoning walkthroughs PDF](https://cdn.openai.com/pdf/reasoning-walkthroughs.pdf) | Record failed detours + decisive insight; dual/positive witnesses; no informal QED | `tools/reasoning-proof-ladder.js` |
| [openai/ten-proofs](https://github.com/openai/ten-proofs) | Construction + **independent** machine check (Lean/Comparator analog) | `tools/independent-verifier.js` |
| [arXiv:2410.19730](https://arxiv.org/abs/2410.19730) | Tokenization breaks LLM counting; CoT ≠ substitute for code | `tools/deterministic-count.js` + ship-claim-gate |
| Gmail link (operator note) | Authenticated channel — not fetched by WebFetch; treat as human-priority signal only | (session handoff) |

## Commands

```bash
# Scaffold a proof packet for a hard problem
node tools/reasoning-proof-ladder.js scaffold --problem "Why is buzz-nostr crypto false-green?" --json

# Validate / grade (runs machineCheck)
node tools/reasoning-proof-ladder.js validate --file /tmp/packet.json
node tools/reasoning-proof-ladder.js grade --file /tmp/packet.json

# Dual witness
node tools/independent-verifier.js \
  --a "node tools/deterministic-count.js --self-test" \
  --b "node tools/ship-claim-gate.js --self-test"

# Deterministic counts (never LLM-estimate for LIVE claims)
node tools/deterministic-count.js chars "hello"
node tools/deterministic-count.js claim-counts --claim "5 replies LIVE" --results-json results.json
```

## Ship-claim integration

Numeric or universal LIVE claims without `--results-json` / matrix are **blocked**
(arXiv counting lesson).

## Packet levels

| Level | Meaning |
|-------|---------|
| `structure_only` | Detours + dualWitness present; machineCheck not run |
| `dual_witness` | Structure OK |
| `machine_checked` | `machineCheck` exited 0 |
| `invalid` / `structure_only_failed_check` | FAIL |

## Related

- `tools/ship-claim-gate.js`
- `tools/harness-smeval.js`
- `docs/FRONTIER-MODEL-HARNESS.md`
