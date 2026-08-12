# Enterprise RAG / memory episode → fleet apply (2026-08-12)

Source discussion: enterprise AI + RAG pipelines (employee HITL ROI, embedding choice, agentic memory before gen).  
This note records what we **already had** vs what we **just shipped**.

## Episode → our stack

| Episode practice | Existing | New (this change) |
|------------------|----------|-------------------|
| Employee-facing HITL with baselines | AHLS score + $149 path; pipeline TSVs | — (ops discipline) |
| Embedding choice / Matryoshka | grepai + retrieval upgrade docs | Policy: next re-index must name embed model + dim plan |
| Memory before expensive gen | lessons FTS, hermes memory readiness | **`tools/agent-memory-before-gen.js`** gate |
| Ban vanity token/LOC productivity | ThumbGate spend guard / economic router | Gate output rejects vanity metrics explicitly |

## Memory-before-gen gate

```bash
# After producing a useful brief/score/answer
node tools/agent-memory-before-gen.js store \
  --domain ahls \
  --query "score examplehvac.com after hours" \
  --answer "AHLS 38; no after-hours CTA; $149 audit" \
  --json

# Before calling an expensive model
node tools/agent-memory-before-gen.js decide \
  --domain ahls \
  --query "score examplehvac.com after-hours leak" \
  --json
```

Decisions:

- **REUSE** (similarity ≥ 0.85) — return prior answer; skip gen (~4k tokens saved heuristic)
- **ADAPT** (0.55–0.85) — use prior as draft; cheap model / light rewrite
- **GENERATE** — no useful memory; full gen allowed

Default store: `~/.thumbgate/agent-memory.jsonl` (override `--store` or `THUMBGATE_AGENT_MEMORY`).

## Outcome metrics (not vanity)

Track: `decision` mix, `estimated_tokens_saved`, reuse rate over sessions.  
Do **not** track lines of code or raw token volume as productivity.

## Related tools

- `tools/retrieval-query-rewrite.js` — synonym expansion (no LLM)
- `tools/retrieval-dual-path.js` — hybrid retrieval RRF
- `tools/tencentdb-memory-readiness.js` — Hermes layered memory checklist
- `tools/rag-stack-scorecard.js` — retrieval scorecard

## Tests

```bash
node tests/test-agent-memory-before-gen.js
```
