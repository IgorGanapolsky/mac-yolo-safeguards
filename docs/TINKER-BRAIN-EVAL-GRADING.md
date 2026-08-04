# How we rank & grade tinker-brain (A+ / 10/10 contract)

**Canonical commands:**
```bash
# Stack pillars (store, BM25, router, models, golden, live, continuous)
python3 tools/tinker-brain/tinker_brain_scorecard.py
python3 tools/tinker-brain/tinker_brain_scorecard.py --json

# Five operator dimensions (offline / online / continuous / feedback / RLHF tradeoffs)
python3 tools/tinker-brain/tinker_brain_rank.py
python3 tools/tinker-brain/tinker_brain_rank.py --json

# Online KPIs only
python3 tools/tinker-brain/tinker_brain_production_metrics.py --json

# Human feedback (closes into continuous LEARN agenda)
python3 tools/tinker-brain/tinker_brain_production_metrics.py feedback \
  --question "..." --signal need_section --needed-card-section POSITIONING
```

Receipts under `~/.hermes/receipts/tinker-brain/`:
- `scorecard-latest.json`, `rank-latest.json`, `production-metrics-latest.json`
- `economics.jsonl`, `production-answers.jsonl`, `feedback.jsonl`
- `eval-history.jsonl`, `fingerprints.jsonl`, `continuous-journal.jsonl`

Exit **0 only if overall A+** (every **required** pillar/dimension is A+ / 10.0).

---

## Ranking order (what matters most)

### A. Multi-dimension rank (`tinker_brain_rank.py`) — operator questions

| Rank | Dimension | Required for A+? | What it proves |
|-----:|-----------|------------------|----------------|
| 1 | **offline_golden_regression** | Yes | Domain goldens + contract adversarials + section targets; fixture **and** live 0 fails |
| 2 | **online_production_metrics** | Yes | Task success, human override rate, latency, cost from real receipts |
| 3 | **continuous_provider_eval** | Yes | Hourly heal/learn/improve + fingerprint model digest so provider weight drift is blameable |
| 4 | **feedback_loop_closure** | Yes | Gaps + human feedback → agenda nextActions → card/eval (not collect-only logs) |
| 5 | **learning_tradeoffs** | Yes | Rules + labeled contract preferences win; full RLHF is explicitly overkill here |

### B. Stack scorecard (`tinker_brain_scorecard.py`) — implementation pillars

| Rank | Pillar | Required for A+? |
|-----:|--------|------------------|
| 1 | Cash fail-closed + contracts | Yes (via models + eval contracts) |
| 2 | Golden eval (fixture + live) | Yes |
| 3 | Orchestration (router + confidence) | Yes |
| 4 | Section retrieval (BM25-lite) | Yes |
| 5 | Store (card sync + AS_OF) | Yes |
| 6 | Models fail-closed | Yes |
| 7 | Continuous sales loop | Advisory until always green |
| 8 | Multidim rank contract | Advisory mirror of rank CLI |

**Important:** Scorecard/rank A+ means the **brain’s instrumentation and gates are honest and green**.  
It does **not** mean external revenue is $10/10 — cash is still fail-closed at $0 until Stripe proves otherwise.

---

## Grade scale

| Grade | score/10 | Meaning |
|-------|---------:|---------|
| **A+** | **10.0** | Required bar met with zero known defects on that pillar/dimension |
| A | 9.5 | Near-perfect |
| A- | 9.0 | Green with thin suite |
| B+…F | ≤8.5 | Defects; required items fail overall |

`a_plus=true` only when **every required** item is A+.

---

## Dimension A+ criteria (detail)

### 1. Offline golden / regression (domain-specific)

| Check | Bar |
|-------|-----|
| Fixture eval | ≥48/48, 0 failures |
| Live eval (`--live`) | ≥48/48, 0 failures |
| Domain routes | ≥5 distinct `expect_route` values (gtm, cash, next_money, scores, off_scope, …) |
| Contract adversarials | ≥20 labeled `expected_violations` cases |
| Section domain goldens | LEGAL_BRAND, PRICING, CHANNELS, SALES_MOTION, POSITIONING, BUYER all retrieve |
| Fingerprint module | Present for “what changed?” blame |
| Unit tests | `tests/test-tinker-brain.py` green |

### 2. Online / production metrics

| Metric | A+ threshold | Source |
|--------|-------------:|--------|
| Task success | ≥ 99% | `production-answers.jsonl` or eval-history |
| Human override rate | ≤ 5% | `feedback.jsonl` (thumbs_down/override/need_section) + suppressed answers |
| Latency p50 | ≤ 500 ms (answer path) | economics / production-answers `wall_ms` |
| Cost | $0.00 | `spend_usd` always 0 on deterministic path |
| Instrumented | ≥10 production or eval rows | cold start seeds one timed probe |
| Recent eval | last history window 0 failed | continuous IMPROVE |

### 3. Continuous evaluation (provider weight changes)

| Check | Why |
|-------|-----|
| `tinker_brain_continuous.py --once --heal` ok | HEAL + LEARN + IMPROVE |
| Golden re-eval inside continuous | Catches silent regressions |
| Fingerprint `model.digest` | Blames Ollama/provider weight swaps |
| Eval-history ≥3 rows | Trend, not one-shot |
| Default `deterministic_card` | Provider weight changes **cannot invent cash** |

Providers change weights; our money path does not call them by default. Continuous still fingerprints the optional model so optional paraphrase drift is visible.

### 4. Feedback loop closure (not “we collect data”)

| Stage | Artifact |
|-------|----------|
| Signal | Coverage gaps, contract failures, human `feedback` CLI |
| LEARN | `coordination/tinker-brain-research-agenda.json` `nextActions` |
| HEAL | Snapshot/repo card promote + re-export |
| IMPROVE | Golden eval re-run + journal |
| Close | Feedback rows marked `consumed=true` when agenda absorbs them |

Collect-only logging **fails** this dimension. Concrete nextActions + consumable feedback **pass**.

### 5. Learning trade-offs: RLHF vs preference vs rules

| Mode | When | ThumbGate GTM brain |
|------|------|---------------------|
| **Rule-based gates** | Fail-closed cash, brand, legal, pricing truth | **Default** — router + response contract |
| **Labeled preference / adversarial fixtures** | Cheap regression on “bad answers look like this” | **Yes** — `contract_cases.json` (`expected_violations`) |
| **Full RLHF (reward model + PPO/DPO)** | Open-ended multi-turn style ranking at scale | **Overkill** — $ cost, non-reproducible cash risk |

Router fields that must stay true for A+:
- `learning_mode=supervised_routing_rules_not_llm`
- `answer_mode=deterministic_card`
- `architecture=rules_router_not_transformer`
- `model_required=false`
- No `rlhf` / `ppo_train` / `reward_model` pipeline in brain code

**Why RLHF is overkill here:** expert-card GTM answers must be identical for the same card digest. A reward model cannot authorize Stripe cash or legal brand claims. Preference-style contract cases catch fluent lies at zero model spend.

---

## Stack pillar definitions (scorecard)

### 1. `store_cards_live_export` (required)
- Snapshot digest == repo expert card digest  
- AS_OF within max age (14d scorecard / 7d health default)  
- `LEGAL_BRAND` section present  
- Auto-heal may run once on divergence  

### 2. `section_retrieval_bm25` (required)
- Golden questions retrieve expected expert sections  

### 3. `orchestration_router_contract` (required)
- Route goldens + confidence ∈ (0,1]  
- Contract + coverage modules present  

### 4. `models_fail_closed` (required)
- Default path is **deterministic_card** (no Ollama on money answers)  
- No vector DB / embeddings on cash path  

### 5. `eval_golden_suite` / `eval_live_card` (required)
- ≥48 cases, 0 failures fixture + live  

### 6. `continuous_sales_loop` (optional)
- heal + billing probe + non-empty sales agenda  

### 7. `multidim_rank_contract` (optional mirror)
- Surfaces latest `tinker_brain_rank.py` A+ receipt  

---

## How to re-prove A+ after any change

```bash
python3 tools/tinker-brain/tinker_brain_health.py --heal
python3 tools/tinker-brain/export_tinker_brain_snapshot.py
python3 tools/tinker-brain/tinker_brain_eval.py
python3 tools/tinker-brain/tinker_brain_eval.py --live
python3 tests/test-tinker-brain.py
python3 tests/test-tinker-brain-rank.py
python3 tools/tinker-brain/tinker_brain_rank.py          # must print A+=True
python3 tools/tinker-brain/tinker_brain_scorecard.py     # must print A+=True
```

---

## What “10/10 everywhere” does *not* include

| Domain | Why it’s separate |
|--------|-------------------|
| Cleared Stripe revenue | Business outcome; brain correctly reports **$0** |
| Campaign LIVE cadence | Funnel ops; continuous *learns* the fail, doesn’t post for you |
| Paid GLM/Kimi YOLO quality | Inference fleet, not tinker-brain |

If those need grades, use revenue-goal-audit / funnel-stage-health — different instruments.

---

## Design note (RAG stack)

This brain is **not** classic Vector RAG. Purpose-fit stack:

`export → rules router (+confidence) → BM25 section retrieve → deterministic card → contract → coverage`

No Vector DB by design (fail-closed > fluent wrong).
