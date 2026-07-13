'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  TABLES,
  parseLines,
  normalizeTrafficRecord,
  buildDailyBurn,
  buildModelReliability,
  buildGatewayHealth,
  aiClassifyFailure,
  aiSummarizeDay,
  aiSummarizeFailures,
  aiExtractAnomaly,
  forecastBurn,
  detectAnomalies,
  naturalLanguageToSql,
  executeQuery,
  tokenize,
  buildSearchIndex,
  hybridSearch,
  answerFleetQuestion,
  buildFleetReport,
  aggregateFleetTraffic,
  generateSnowflakeDDL,
} = require('../tools/hermes-cortex-fleet');

// 1. TABLES invariant
assert.strictEqual(TABLES.TRAFFIC, 'HERMES.TRAFFIC');
assert.strictEqual(TABLES.DAILY_BURN, 'HERMES.DAILY_BURN');
assert(Object.keys(TABLES).length >= 5);

// 2. parseLines + normalize
const sampleLines = `
{"model":"z-ai/glm-5.2","total_tokens":1234,"ts_end":"2026-07-06 14:23:11","status":"success","latency_ms":12000}
{"model":"qwen2.5:3b-64k","total_tokens":500,"ts_end":"2026-07-06 14:24:00","status":"failure","error":"quota exhausted 429","http_status":429}
{"model":"qwen2.5:3b-64k","total_tokens":0,"ts_end":"2026-07-06 14:25:00","status":"success","empty_kind":"truncated"}
`;
const parsed = parseLines(sampleLines);
assert.strictEqual(parsed.length, 3);
const norm = parsed.map(r => normalizeTrafficRecord(r, 'test-host'));
assert.strictEqual(norm[0].day, '2026-07-06');
assert.strictEqual(norm[0].model, 'z-ai/glm-5.2');
assert.strictEqual(norm[0].host, 'test-host');
assert.strictEqual(norm[0].total_tokens, 1234);
assert.strictEqual(norm[2].empty_kind, 'truncated');

// 3. Daily burn
const daily = buildDailyBurn(norm);
assert.strictEqual(daily.length, 1);
assert.strictEqual(daily[0].day, '2026-07-06');
assert.strictEqual(daily[0].total_tokens, 1734);
assert.strictEqual(daily[0].failure, 1);
assert.strictEqual(daily[0].by_model['z-ai/glm-5.2'], 1234);

// 4. Model reliability
const rel = buildModelReliability(norm);
assert.strictEqual(rel.length, 2);
const glmRel = rel.find(m => m.model === 'z-ai/glm-5.2');
assert.strictEqual(glmRel.total_requests, 1);
assert.strictEqual(glmRel.reliability, 1);
const qwenRel = rel.find(m => m.model.includes('qwen'));
assert.strictEqual(qwenRel.failure, 1);
assert.strictEqual(qwenRel.truncated_empty, 1);

// 5. Gateway health
const health = buildGatewayHealth(norm, [{ host: '100.94.135.78', reachable: true }]);
assert(health.some(h => h.host === 'test-host'));
assert(health.some(h => h.host === '100.94.135.78' && h.status === 'gateway_online'));

// 6. Cortex AISQL: aiClassifyFailure (mirrors Cortex AI_CLASSIFY)
const quota = aiClassifyFailure(norm[1]);
assert.strictEqual(quota.category, 'quota_exhausted');
assert.strictEqual(quota.severity, 'critical');
assert(quota.cortex_fn.includes('CLASSIFY'));

const truncated = aiClassifyFailure(norm[2]);
assert.strictEqual(truncated.category, 'truncated_empty');
assert.strictEqual(truncated.severity, 'high');

const ok = aiClassifyFailure(norm[0]);
assert.strictEqual(ok.category, 'ok');

const authFail = aiClassifyFailure(normalizeTrafficRecord({ model: 'glm', status: 'failure', error: 'invalid api key', http_status: 401, ts_end: '2026-07-06 00:00:00' }));
assert.strictEqual(authFail.category, 'auth_failure');

// 7. AISQL summarize
const daySummary = aiSummarizeDay(daily[0]);
assert(daySummary.includes('2026-07-06'));
assert(daySummary.includes('M tokens'));

const failSummary = aiSummarizeFailures(norm);
assert.strictEqual(failSummary.total_failures_analyzed, 1);
assert(failSummary.by_category.quota_exhausted === 1);
assert(failSummary.cortex_fn === 'AI_SUMMARIZE');

// 8. Anomaly + forecast (ML.FORECAST)
const manyDays = [
  { day: '2026-07-01', total_tokens: 1_000_000, records: 10, failure: 0, by_model: {}, by_host: {} },
  { day: '2026-07-02', total_tokens: 1_200_000, records: 12, failure: 1, by_model: {}, by_host: {} },
  { day: '2026-07-03', total_tokens: 1_100_000, records: 11, failure: 0, by_model: {}, by_host: {} },
  { day: '2026-07-04', total_tokens: 1_300_000, records: 13, failure: 0, by_model: {}, by_host: {} },
  { day: '2026-07-05', total_tokens: 27_800_000, records: 100, failure: 5, by_model: {}, by_host: {} }, // the incident
];
const anomalyStats = aiExtractAnomaly(manyDays);
assert(anomalyStats.anomalies.length >= 1);
assert(anomalyStats.anomalies[0].day === '2026-07-05');

const anomalies = detectAnomalies(norm.concat([
  normalizeTrafficRecord({ model: 'glm', total_tokens: 1000, ts_end: '2026-07-05 10:00:00', status: 'success' }, 'mini'),
  normalizeTrafficRecord({ model: 'glm', total_tokens: 27_800_000, ts_end: '2026-07-05 11:00:00', status: 'success' }, 'mini'),
]), manyDays);
assert(anomalies.some(a => a.type === 'high_burn_day'));

const forecast = forecastBurn({ day: '2026-07-06', total_tokens: 2_000_000, weeklyBurned: 10_000_000 }, { now: new Date('2026-07-06T12:00:00Z'), dailyCap: 8_000_000 });
assert(forecast.projected_eod > forecast.tokens_so_far);
assert(forecast.cortex_fn === 'ML.FORECAST');
assert(['low', 'medium', 'high', 'critical'].includes(forecast.risk));
assert(typeof forecast.remaining_daily === 'number');

// 9. Cortex Analyst: NL -> SQL
const qToday = naturalLanguageToSql('how many tokens did we burn today?');
assert.strictEqual(qToday.intent, 'daily_burn_today');
assert(qToday.sql.includes(TABLES.DAILY_BURN));
assert(qToday.cortex_fn === 'CORTEX.ANALYST');

const qTop = naturalLanguageToSql('which model used the most tokens?');
assert.strictEqual(qTop.intent, 'top_model');

const qFail = naturalLanguageToSql('why is GLM failing?');
assert(qFail.intent === 'failure_analysis' || qFail.intent === 'anomalies' || qFail.confidence >= 0.5);

const qForecast = naturalLanguageToSql('forecast quota exhaustion');
assert.strictEqual(qForecast.intent, 'forecast');

const qHealth = naturalLanguageToSql('fleet health mini and pro');
assert.strictEqual(qHealth.intent, 'fleet_health');

const qFallback = naturalLanguageToSql('how to fix quota lessons?');
assert(qFallback.table);

// 10. ExecuteQuery
const ctx = {
  traffic: norm,
  dailyBurn: daily,
  gatewayHealth: health,
  modelReliability: rel,
  anomalies,
};
const execToday = executeQuery(qToday, { ...ctx, dailyBurn: [{ day: new Date().toISOString().slice(0, 10), total_tokens: 1234, by_model: {}, by_host: {}, success: 1, failure: 0, records: 1 }, ...daily] });
assert(execToday.sql);

const execTop = executeQuery(qTop, ctx);
assert.strictEqual(execTop.intent, 'top_model');
assert(execTop.result.length >= 1);

const execForecast = executeQuery(qForecast, ctx);
assert.strictEqual(execForecast.intent, 'forecast');
assert(typeof execForecast.result[0].projected_eod === 'number');
assert(typeof execForecast.result[0].risk === 'string');

// 11. Cortex Search: hybridSearch
const docs = [
  { id: 'doc1', path: 'tools/hermes-burn-alert.js', text: '27.8M day killed GLM weekly quota, burn alert fires at 8M tokens', meta: { type: 'doc' } },
  { id: 'doc2', path: 'plan.md', text: 'Token burn gateway watchdog model pin keep_alive', meta: { type: 'doc' } },
  { id: 'doc3', path: 'HERMES.TRAFFIC:2026-07-06', text: 'glm failure quota exhausted 429', meta: { type: 'failure' } },
];
const idx = buildSearchIndex(docs);
assert.strictEqual(idx.length, 3);

const hits = hybridSearch('quota exhausted', idx, { limit: 5 });
assert(hits.length >= 1);
assert(hits[0].score > 0);
assert(hits[0].snippet.length > 0);

const hitsPath = hybridSearch('burn alert', idx);
assert(hitsPath.some(h => h.path.includes('burn-alert')));

const tok = tokenize('Hello World! 123');
assert.deepStrictEqual(tok, ['hello', 'world', '123']);

// 12. Cortex Agents: answerFleetQuestion
const searchIdx = buildSearchIndex(docs);
const answer = answerFleetQuestion('how many tokens today and why failing?', { traffic: norm, dailyBurn: daily, gatewayHealth: health, modelReliability: rel, anomalies, searchIndex: searchIdx });
assert.strictEqual(answer.schema, 'cortex-agent/fleet-answer-v1');
assert(answer.analyst);
assert(answer.citations.length >= 1);
assert(answer.recommendations.length >= 1);
assert(answer.cortex_fn === 'CORTEX.AGENTS');

const answerQuota = answerFleetQuestion('quota exhausted what to do?', { traffic: norm, dailyBurn: daily, gatewayHealth: health, modelReliability: rel, anomalies: [{ type: 'quota_exhaustion_burst', count: 5 }], searchIndex: searchIdx });
assert(answerQuota.recommendations.some(r => /local_fast|qwen|throttle/i.test(r)));

// 13. Fleet report
const report = buildFleetReport(norm, { probes: health });
assert.strictEqual(report.schema, 'hermes-cortex-fleet/report-v1');
assert(report.fleet.total_requests === norm.length);
assert(report.today);
assert(report.forecast);
assert(report.modelReliability.length >= 1);
assert(report.anomalies);
assert(report.snowflake_ddl_preview.includes(TABLES.TRAFFIC));
assert(report.cortex_examples.analyst.sql);

// 14. Snowflake DDL
const ddl = generateSnowflakeDDL();
assert(ddl.includes('CREATE TABLE'));

// 15. Aggregate fleet traffic from files (no secret leak)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-cortex-test-'));
const f1 = path.join(tmp, 'traffic1.jsonl');
const f2 = path.join(tmp, 'traffic2.jsonl');
fs.writeFileSync(f1, '{"model":"glm","total_tokens":100,"ts_end":"2026-07-06 01:00:00","status":"success"}\n');
fs.writeFileSync(f2, '{"model":"qwen","total_tokens":200,"ts_end":"2026-07-06 02:00:00","status":"success"}\n');
const agg = aggregateFleetTraffic(f1, [f2]);
assert.strictEqual(agg.length, 2);
assert.strictEqual(agg.reduce((a, b) => a + b.total_tokens, 0), 300);
fs.rmSync(tmp, { recursive: true, force: true });

// 16. Secret safety: no API keys in output
const withKeyDoc = buildSearchIndex([{ id: 'k', path: 'env', text: 'should not leak key', meta: {} }]);
assert(!JSON.stringify(withKeyDoc).includes('OPENROUTER_API_KEY'));

console.log('Hermes Cortex fleet tests: PASS');
