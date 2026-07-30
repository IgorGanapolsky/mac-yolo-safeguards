# LLM-as-Judge and regression control

**Last updated:** 2026-07-30  
**Owner tools:** `tools/llm-judge-policy.js`, `tools/eval-benchmark-suite.js`, `tools/curate-eval-set.js`, `tools/rag-retrieval-eval.js`, `tools/incident-eval-runner.js`

## One rule

> **Probabilistic LLM judges never block merge by themselves.**  
> Hard gates are deterministic. Human labels are preferred soft quality. LLM judges are diagnostic.

This exists because an earlier `eval-benchmark-suite` reported **fabricated** scores (`groundednessScore=0.98`, `helpfulnessScore=0.96`) with zero provenance. That is theater and is now forbidden.

## Three rings

| Ring | Blocks merge? | Examples in this repo |
|------|---------------|------------------------|
| **1. Hard gates** | Yes | RAG fixture floors (`rag-retrieval-eval`), incident false-green verifiers (`incident-eval-runner --tier pr`), unit contracts |
| **2. Human labels** | No (diagnostic floors optional) | ThumbGate thumbs → `curate-eval-set` train/holdout + sha256 provenance |
| **3. LLM-as-judge** | **No** | Rubric scoring of free text — only after calibration against human holdout |

## Hard gates (run these)

```bash
node tools/rag-retrieval-eval.js --json          # exit 1 if cases fail
node tools/incident-eval-runner.js --tier pr     # false-green classes
node tools/eval-benchmark-suite.js --strict      # aggregates hard gates; exit 1 on hard fail
node tools/llm-judge-policy.js --json            # print gate catalog
```

## Human-label metrics (honest names)

`curate-eval-set.js` keeps only deliberate human thumbs (drops auto-capture, echo-of-prompt, short context, dupes). Split is **hash-stable** (not RNG).

| Field | Meaning |
|-------|---------|
| `humanPositiveRate` | keptPositive / kept |
| `holdoutFraction` | holdout / kept (eval rigor, not “helpfulness”) |
| `groundednessScore` | **legacy alias** of `humanPositiveRate` — **not** model groundedness |
| `helpfulnessScore` | **legacy alias** of `holdoutFraction` — **not** model helpfulness |

If you need true groundedness/faithfulness of answers, add a **deterministic** claim check or a calibrated judge suite under `evals/` with fixed rubrics — never hardcode 0.98.

## When an LLM judge is allowed

1. Fixed gold set under change-control (versioned cases + rubric).  
2. Temperature 0 / pinned judge model (separate from product model).  
3. Pairwise scoring with order swap to reduce position bias.  
4. Agreement measured on **human holdout** before any threshold is trusted.  
5. Status remains `diagnostic` until (4) is green for two review cycles.

## Anti-regression checklist for PRs that touch agents / RAG / prompts

- [ ] New failure class → fixture or `evals/incidents` case (hard gate)  
- [ ] No new hardcoded “quality %” in dashboards  
- [ ] `node tests/test-eval-benchmark-suite.js` and `test-llm-judge-policy.js` green  
- [ ] If human feedback shape changes → update `curate-eval-set` filters, not the score constant  

## Related docs

- [RAG-QUALITY-PROGRAM.md](./RAG-QUALITY-PROGRAM.md) — retrieval floors  
- [INCIDENT-EVALS.md](./INCIDENT-EVALS.md) — false-green verifiers  
- [TINKER-BRAIN.md](./TINKER-BRAIN.md) — golden contract cases for GTM answers  
- [RESEARCH-AI-REGRESSION-CONTROLS-JULY-2026.md](./RESEARCH-AI-REGRESSION-CONTROLS-JULY-2026.md) — architecture background  
