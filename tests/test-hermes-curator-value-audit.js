#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  buildAudit,
  parseCuratorConfig,
} = require('../tools/hermes-curator-value-audit');

const pruneConfig = `
model:
  default: glm-coding
curator:
  enabled: true
  interval_hours: 168
  consolidate: false
  backup:
    enabled: true
    keep: 5
skills:
  enabled: true
`;

const state = {
  last_report_path: '/tmp/curator/latest',
  run_count: 7,
};
const report = {
  started_at: '2026-08-02T22:44:28.439801+00:00',
  duration_seconds: 0.23,
  model: '',
  provider: '',
  auto_transitions: { checked: 87, marked_stale: 0, archived: 0, reactivated: 0 },
  counts: { tool_calls_total: 0 },
  llm_summary: 'skipped (consolidation off)',
};

assert.deepStrictEqual(parseCuratorConfig(pruneConfig), {
  enabled: true,
  consolidate: false,
  intervalHours: 168,
  backupEnabled: true,
  backupKeep: 5,
  budgets: {
    max_calls: null,
    max_iterations: null,
    max_input_tokens: null,
    max_output_tokens: null,
    max_runtime_seconds: null,
    max_spend_usd: null,
  },
});

const healthy = buildAudit({
  configText: pruneConfig,
  sourceText: '',
  state,
  report,
  reportDir: '/tmp/curator/latest',
  checkedAt: '2026-08-02T00:00:00.000Z',
});
assert.strictEqual(healthy.healthy, true);
assert.strictEqual(healthy.score, 100);
assert.strictEqual(healthy.mode, 'prune-only');
assert.strictEqual(healthy.proofBoundary.pruneOnlyNoLlmCalls, true);
assert.strictEqual(healthy.proofBoundary.electricityMeasured, false);

const unboundedConsolidation = buildAudit({
  configText: pruneConfig.replace('consolidate: false', 'consolidate: true'),
  sourceText: 'max_iterations = 9999',
  state,
  report,
  reportDir: '/tmp/curator/latest',
});
assert.strictEqual(unboundedConsolidation.healthy, false);
assert(unboundedConsolidation.gaps.includes('consolidation_budgets_missing'));
assert(unboundedConsolidation.gaps.includes('consolidation_budgets_not_enforced'));
assert(unboundedConsolidation.gaps.includes('consolidation_value_not_proved'));

const missingEvidence = buildAudit({
  configText: pruneConfig,
  sourceText: '',
  state: {},
  report: {},
  reportDir: '',
});
assert.strictEqual(missingEvidence.healthy, false);
assert(missingEvidence.gaps.includes('latest_run_report_missing'));
assert(missingEvidence.gaps.includes('prune_only_not_proved'));

console.log('Hermes Curator value audit tests: PASS');
