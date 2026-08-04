# Graph engineering: route auth audit (first pipeline)

**Workflow chosen:** control-plane **API route auth surface audit**  
(High leverage for ThumbGate / Hermes: fail-closed auth, dual-witness, parallelizable.)

## Why this workflow first

| Alternative | Deferred because |
|-------------|------------------|
| Trading strategy graph | Needs live market data + risk capital gates |
| Affiliate funnel graph | Content quality harder to auto-verify |
| Full code review graph | Too wide; this is the minimal auth slice |

## Hand-drawn topology

```
                    ┌─────────────┐
                    │   Planner   │  list route.ts (cap N)
                    └──────┬──────┘
                           │ RouteTarget[]
              ┌────────────┼────────────┐
              ▼            ▼            ▼
          Worker₁      Worker₂  …   Workerₙ   (one file each)
              │            │            │
              │ WorkerFinding (risk, signals, content hash)
              ▼            ▼            ▼
          Verifier₁    Verifier₂ …  Verifierₘ  (re-read file; independent)
              │            │            │
              └────────────┼────────────┘
                           │ VerifierVerdict (accepted + evidence)
                           ▼
                    ┌─────────────┐
                    │ Synthesizer │  merge + receipt
                    └──────┬──────┘
                           │ AuditReport
                           ▼
                    ┌─────────────┐
                    │ HumanGate   │  exit 0 pass / 2 review required
                    └─────────────┘
```

### Edge contracts

| Edge | Contract |
|------|----------|
| Planner → Worker | `{ path, rel }[]` |
| Worker → Verifier | `{ route, methods, authSignals, risk, notes, workerHash }` |
| Verifier → Synthesizer | `{ route, accepted, reason, verifierHash, evidence }` |
| Synthesizer → HumanGate | full receipt + `humanGate.exitCode` |

### Parallelism rule

- Workers do **not** read each other’s findings → fan-out.
- Verifiers do **not** trust worker notes; they re-hash the file → dual witness.
- Only **high/medium** findings enter verifier fan-out (low = no issue to confirm).

## Run

```bash
# Human-readable report (exit 2 if confirmed gaps)
node tools/graph-eng-route-auth-audit.js --max=20

# JSON receipt
node tools/graph-eng-route-auth-audit.js --max=20 --json --out=/tmp/route-auth-audit.json

# Tests
node tests/test-graph-eng-route-auth-audit.js
```

## Scale next

1. Raise `--max` after false-positive rate is acceptable.
2. Add Codex/Claude **only** as optional Worker for semantic “is this session check real?” (deterministic signals stay default).
3. Clone topology for: funnel copy review, trading hypothesis backtest gate.
4. Obsidian: add typed edges `depends_on` / `decided_by` from confirmed routes to fix PRs.

## Not this graph

- Model routing (see hermes-yolo P0)
- Full product QA
- Unbounded multi-agent thrash — fan-out is **capped** by `--max`
