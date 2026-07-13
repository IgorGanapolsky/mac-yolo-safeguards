# Hermes Cortex Fleet — Snowflake Cortex for Mac mini + Mac Pro

> Implements Snowflake Cortex high-ROI features locally, with optional Snowflake upload.

## Why Cortex for Hermes?

Hermes runs on 2 Macs (Mac Pro + Mac mini) via Tailscale. Before Cortex, each Mac had isolated observability:

- `traffic.jsonl` only local -> 27.8M-token day on mini killed GLM weekly quota with zero warning on Pro (2026-07-06 incident)
- `burn-alert` fired at 8M but only local; no forecast
- RAG split across ThumbGate (network), graphify (needs graph.json), local retrieval (keyword)
- No shared memory for model reliability; router used static 0.82 / 0.76 etc
- No SQL analytics for fleet questions

Snowflake Cortex maps directly:

| Cortex Feature | Hermes Pain | Our Implementation |
|----------------|-------------|---------------------|
| **Data Foundation / Lake** | Split traffic logs | `hermes-cortex-fleet.js: aggregateFleetTraffic()` merges local + remote Tailscale hosts into `HERMES.TRAFFIC` table |
| **Cortex AISQL (AI Functions)** | No failure classification | `aiClassifyFailure()` = `AI_CLASSIFY` over traffic: quota_exhausted, truncated_empty, auth_failure, etc. `aiSummarizeDay()` = `AI_SUMMARIZE`. Works offline, no LLM call |
| **Cortex Analyst (NL→SQL)** | Igor asks "how many tokens today?" must read JSONL | `naturalLanguageToSql()` + `executeQuery()` => SQL-like plans: `daily_burn_today`, `top_model`, `failure_analysis`, `forecast`, `fleet_health`, `model_reliability`, `anomalies` |
| **Cortex Search** | 3 separate RAGs | `buildSearchIndex()` + `hybridSearch()` over traffic failures + vault + plan.md + AGENTS.md — single ranked retrieval, like `CORTEX.SEARCH` |
| **Cortex Agents (Data Agents)** | No orchestration of structured+unstructured | `answerFleetQuestion()` orchestrates Analyst SQL + Search + failure summary into `cortex-agent/fleet-answer-v1` with citations and recommendations |
| **ML Forecast** | Burn alert only fires AFTER cap | `forecastBurn()` = `ML.FORECAST`: linear projection from fraction_of_day, warns BEFORE cap. Used in `hermes-burn-alert.js` as `forecastAlertedDay` |
| **Model Registry Tuner** | Static router reliability | `hermes-cortex-router-tuner.js` = Snowflake ML model registry: reads `HERMES.TRAFFIC`, computes observed reliability/latency, emits tuned ROUTES with DGM adoption gate (min 5 samples) |
| **Governance / Trusted Perimeter** | Secrets leak risk | No secrets printed; Snowflake DDL preview emits `CREATE TABLE` + `COPY INTO` without auto-upload. Optional upload only if `SNOWFLAKE_*` env present |

## Fleet-Wide Improvements (Mac mini + Mac Pro)

### 1. Unified Telemetry Lake
```bash
node tools/hermes-cortex-fleet.js --traffic ~/.hermes/litellm-logs/traffic.jsonl --remote 100.94.135.78,100.87.85.85 --json
```
- Ingests local + remote (Tailscale IPs or file paths for tests)
- Produces tables: `HERMES.TRAFFIC`, `HERMES.DAILY_BURN`, `HERMES.GATEWAY_HEALTH`, `HERMES.MODEL_RELIABILITY`, `HERMES.BURN_ANOMALIES`
- Evidence on this Mac: 1058 requests, 10.8M tokens across 4 days, 16 models observed

### 2. Cortex AISQL
- `aiClassifyFailure(record)` → deterministic, no LLM needed, works on both Macs offline
- Detected today: glm-5.2 94 failures (100% failure rate), truncated_empty spike for z-ai/glm-5.2 (3)
- `aiSummarizeFailures()` + `aiExtractAnomaly()` = Snowflake 2.2std mean+std anomaly detection tuned to catch 27.8M incident

### 3. Cortex Analyst
```bash
node tools/hermes-cortex-fleet.js --question "how many tokens did we burn today"  # daily_burn_today
node tools/hermes-cortex-fleet.js --question "which model used the most tokens"   # top_model
node tools/hermes-cortex-fleet.js --question "why is GLM failing"                  # failure_analysis
node tools/hermes-cortex-fleet.js --question "forecast quota"                     # ML.FORECAST
```
- Intent matching with confidence 0.85, fallback to semantic search
- Used inside `agent-decision-stack.js` as `cortexFleet` RAG (see `rag.cortexFleet.analyst`)

### 4. Cortex Search
```bash
node tools/hermes-cortex-fleet.js --search "quota exhausted"
```
- Hybrid: keyword frequency + path boost + meta failure boost + fuzzy
- Corpus: traffic failures + plan.md + AGENTS.md + docs/HERMES-ECONOMIC-ROUTER.md + README

### 5. Cortex Agents
```bash
node tools/hermes-cortex-fleet.js --question "fleet health mini and pro"
```
- Returns `schema: cortex-agent/fleet-answer-v1` with `analyst.result`, `search.results`, `failure_summary`, `recommendations`, `citations`
- Recommendations: throttle when projected_over_daily_cap, switch to local_fast on quota burst

### 6. Forecast + Burn Alert (High ROI)
- Old: alert at 8M after cap hit, once per day
- New (Cortex): 
  - Linear projection `projected_eod = tokens_so_far / fraction_of_day`
  - `forecastAlertedDay` warns BEFORE cap
  - `quotaBurstAlertedAt` warns on 3+ quota failures in last 20
  - Wired in `hermes-burn-alert.js` (best-effort, no secret leak)
- Live proof: today 0.74M, projected 1.03M, risk=low, remaining 7.25M

### 7. Router Tuner (ML Feedback Loop)
```bash
node tools/hermes-cortex-router-tuner.js
```
- Observed on this Mac:
  - local_fast baseline 0.82 → observed 0.444 (demote)
  - glm52_reasoning 0.76 → 0.476 (demote, GLM outage today)
  - fugu_escalation 0.64 → 0.0 (demote, only 2 samples failed)
- DGM gate: only tune if >=5 samples, blend 70% baseline + 30% observed to avoid thrashing

### 8. All-Macs Setup Integration
- New gate `fleet_burn_healthy` in `hermes-all-macs-setup.js`
- Uses `hermes-cortex-fleet` to report: `burn ok: 0.74M today, 4 anomalies, 16 models`
- Fails if critical anomalies or today >8M

### 9. Decision Stack Integration
- `agent-decision-stack.js` now has `rag.cortexFleet`:
  - analyst plan + top 3 rows
  - search hits + scores
  - anomalies (top 3)
  - recommendations
- Proven: `node tools/agent-decision-stack.js --task "why is GLM failing and forecast quota"` shows failure_rate 1.0 for glm-5.2, high_failure_rate anomalies for 2026-07-12/13, truncated_empty spike

## Snowflake Upload (Optional)

When `SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_USER`, `SNOWFLAKE_WAREHOUSE` etc are set, the fleet report DDL preview can be used:

```sql
CREATE TABLE IF NOT EXISTS HERMES.TRAFFIC (host STRING, model STRING, status STRING, total_tokens NUMBER, day DATE, latency_ms NUMBER, provider STRING, error STRING);
COPY INTO HERMES.TRAFFIC FROM @hermes_stage/traffic.jsonl FILE_FORMAT=(TYPE=JSON);
-- Then Cortex:
SELECT CORTEX.COMPLETE('gpt-4o','Summarize failures'), CORTEX.ANALYST('how many tokens?');
```

No auto-upload happens. Module is local-first.

## Verification

```bash
node tests/test-hermes-cortex-fleet.js        # 16 assertions, PASS
node tests/test-burn-alert.js                 # PASS (backward compat + new forecast/anomaly latches)
node tests/test-hermes-all-macs-setup.js     # PASS (new fleet_burn_healthy gate)
node tests/test-hermes-economic-router.js    # PASS
node tools/hermes-cortex-fleet.js --json | jq .fleet
node tools/hermes-cortex-router-tuner.js | jq '.tuned[] | select(.observed)'
node tools/agent-decision-stack.js --task "why is GLM failing" --json | jq '.rag.cortexFleet.anomalies'
```

## ROI Summary (Per Mac)

- **Prevents quota kill**: forecast warns at ~30% day projected to exceed 8M, not after. Would have saved GLM weekly quota on 2026-07-06 27.8M day.
- **Faster debug**: "why failing" goes from reading JSONL manually to `CORTEX.ANALYST` + `CORTEX.SEARCH` single answer with citations.
- **Shared context**: both Macs see same tables after `--remote` fetch (future: custom `/traffic.jsonl` endpoint on :8642, now file-based for tests but IP-ready).
- **Adaptive routing**: router reliability auto-tunes from observed traffic, instead of static 0.82.

## Next Steps (Not in scope, but enabled)

- Add `GET /traffic.jsonl` to `services/hermes-relay` or gateway so `aggregateFleetTraffic` can fetch remote over HTTP, not just file.
- Wire Snowflake Snowpark for real `CORTEX.COMPLETE` when creds present.
- Add `CORTEX.SEARCH` over ThumbGate lessons via Snowflake hybrid search.
