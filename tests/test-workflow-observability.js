#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  appendExecution,
  buildMonthlyReport,
  executeObserved,
  idempotencyHash,
  normalizeRecord,
  notifyFindings,
  parseArgs,
  readExecutions,
  renderMonthlyMarkdown,
  sanitizeOutcomes,
  scanExecutions,
  statePaths,
  writeMonthlyReport,
} = require('../tools/workflow-observability');

function runTests() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-observability-test-'));
  let count = 0;
  const check = (label, fn) => {
    fn();
    count += 1;
    console.log(`  ok - ${label}`);
  };

  try {
    check('normalizes a bounded metadata-only run and preserves unknown attribution', () => {
      const record = normalizeRecord(
        {
          workflowId: 'lead-sync',
          workflowVersion: 'abc123',
          client: 'client-17',
          status: 'success',
          outcomes: { lead_created: true },
        },
        Date.parse('2026-07-18T12:00:00Z'),
      );
      assert.strictEqual(record.cost.usd, null);
      assert.strictEqual(record.cost.attribution, 'unknown');
      assert.strictEqual(record.usage.totalTokens, null);
      assert.strictEqual(record.outcomes.lead_created, true);
      assert.strictEqual(Object.hasOwn(record, 'stdout'), false);
      assert.strictEqual(Object.hasOwn(record, 'command'), false);
    });

    check('redacts secret-shaped metadata and secret outcome keys', () => {
      const outcomes = sanitizeOutcomes({ api_key: 'do-not-keep', note: 'Bearer abc.def.ghi' });
      assert.strictEqual(outcomes.api_key, '[redacted]');
      assert.strictEqual(outcomes.note, 'Bearer [redacted]');
      const failed = normalizeRecord({
        workflowId: 'safe-failure',
        status: 'failed',
        errorMessage: 'provider returned Bearer test.token.value',
      });
      assert.match(failed.error.message, /Bearer \[redacted\]/);
      assert.doesNotMatch(failed.error.message, /test\.token\.value/);
    });

    check('appends private JSONL and reads it back', () => {
      const stateDir = path.join(temp, 'append');
      const written = appendExecution(
        { workflowId: 'heartbeat', status: 'success', outcomes: { delivered: true } },
        { stateDir },
      );
      const runs = readExecutions({ stateDir, strict: true });
      assert.strictEqual(runs.length, 1);
      assert.strictEqual(runs[0].runId, written.runId);
      assert.strictEqual(fs.statSync(statePaths(stateDir).ledgerPath).mode & 0o777, 0o600);
    });

    check('hashes idempotency keys and suppresses duplicate side effects', () => {
      const stateDir = path.join(temp, 'dedupe');
      let spawns = 0;
      const spawn = () => {
        spawns += 1;
        return { status: 0 };
      };
      const base = {
        workflowId: 'invoice-send',
        idempotencyKey: 'invoice-42/customer-7',
        command: 'ignored-test-command',
        outcomes: { invoice_sent: true },
      };
      const first = executeObserved(base, {
        stateDir,
        spawn,
        now: Date.parse('2026-07-18T12:00:00Z'),
        finishedNow: Date.parse('2026-07-18T12:00:01Z'),
      });
      const second = executeObserved(base, {
        stateDir,
        spawn,
        now: Date.parse('2026-07-18T12:01:00Z'),
      });
      assert.strictEqual(first.record.status, 'success');
      assert.strictEqual(second.record.status, 'deduped');
      assert.strictEqual(spawns, 1);
      assert.strictEqual(first.record.idempotencyHash, idempotencyHash(base.idempotencyKey));
      assert.notStrictEqual(first.record.idempotencyHash, base.idempotencyKey);
    });

    check('blocks commands before spawn when retry or estimated-cost budgets are exceeded', () => {
      const stateDir = path.join(temp, 'budgets');
      let spawns = 0;
      const spawn = () => {
        spawns += 1;
        return { status: 0 };
      };
      const retryBlocked = executeObserved(
        {
          workflowId: 'bounded-retry',
          retryCount: 2,
          maxRetries: 1,
          command: 'ignored',
        },
        { stateDir, spawn },
      );
      const costBlocked = executeObserved(
        {
          workflowId: 'bounded-cost',
          estimatedCostUsd: 0.5,
          maxCostUsd: 0.1,
          command: 'ignored',
        },
        { stateDir, spawn },
      );
      assert.strictEqual(retryBlocked.childStatus, 78);
      assert.strictEqual(retryBlocked.reason, 'retry_budget_exhausted');
      assert.strictEqual(costBlocked.childStatus, 78);
      assert.strictEqual(costBlocked.reason, 'estimated_cost_cap_exceeded');
      assert.strictEqual(spawns, 0);
      assert(readExecutions({ stateDir }).every((run) => run.outcomes.guard_blocked === true));
    });

    check('detects missed cadence, retry overrun, cost overrun, and missing outcome', () => {
      const runs = [
        normalizeRecord({
          workflowId: 'costly-sync',
          status: 'success',
          retryCount: 4,
          costUsd: 2,
          outcomes: { lead_created: false },
          finishedAt: '2026-07-18T10:00:00Z',
        }),
      ];
      const scan = scanExecutions({
        runs,
        now: Date.parse('2026-07-18T12:00:00Z'),
        config: {
          workflows: [
            {
              id: 'costly-sync',
              expectedEveryMinutes: 30,
              maxRetries: 1,
              maxCostUsd: 1,
              requiredOutcomes: ['lead_created'],
            },
          ],
        },
      });
      assert.deepStrictEqual(
        new Set(scan.findings.map((item) => item.code)),
        new Set([
          'missed_cadence',
          'retry_limit_exceeded',
          'cost_cap_exceeded',
          'required_outcome_missing',
        ]),
      );
    });

    check('can require cost attribution instead of silently treating unknown as zero', () => {
      const runs = [
        normalizeRecord({
          workflowId: 'paid-ai-step',
          status: 'success',
          finishedAt: '2026-07-18T11:59:00Z',
        }),
      ];
      const scan = scanExecutions({
        runs,
        now: Date.parse('2026-07-18T12:00:00Z'),
        config: { workflows: [{ id: 'paid-ai-step', requireCostAttribution: true }] },
      });
      assert(scan.findings.some((item) => item.code === 'cost_attribution_missing'));
    });

    check('detects terminal failures and repeated failure bursts', () => {
      const runs = ['11:10', '11:30', '11:50'].map((time, index) =>
        normalizeRecord({
          runId: `failed-${index}`,
          workflowId: 'lead-delivery',
          status: 'failed',
          finishedAt: `2026-07-18T${time}:00Z`,
        }),
      );
      const scan = scanExecutions({
        runs,
        now: Date.parse('2026-07-18T12:00:00Z'),
        config: {
          workflows: [
            {
              id: 'lead-delivery',
              failureWindowMinutes: 60,
              failureBurstThreshold: 3,
            },
          ],
        },
      });
      assert(scan.findings.some((item) => item.code === 'terminal_failure'));
      assert(scan.findings.some((item) => item.code === 'failure_burst'));
    });

    check('deduplicates repeated operator alerts during the cooldown', () => {
      const stateDir = path.join(temp, 'notify');
      const scan = {
        findings: [
          {
            workflowId: 'lead-delivery',
            code: 'terminal_failure',
            severity: 'high',
            detail: 'latest run failed',
            fingerprint: 'same-fingerprint',
          },
        ],
      };
      let notifications = 0;
      const notifier = () => {
        notifications += 1;
        return { sent: true };
      };
      const first = notifyFindings(scan, {
        stateDir,
        notifier,
        now: Date.parse('2026-07-18T12:00:00Z'),
      });
      const second = notifyFindings(scan, {
        stateDir,
        notifier,
        now: Date.parse('2026-07-18T12:10:00Z'),
      });
      assert.strictEqual(first[0].sent, true);
      assert.strictEqual(second[0].deduped, true);
      assert.strictEqual(notifications, 1);
    });

    check('monthly report never treats unknown cost or time saved as zero evidence', () => {
      const runs = [
        normalizeRecord({
          workflowId: 'client-sync',
          client: 'client-17',
          status: 'success',
          costUsd: 0.25,
          inputTokens: 100,
          outputTokens: 20,
          timeSavedMinutes: 15,
          outcomes: { leads_created: 3 },
          finishedAt: '2026-07-02T12:00:00Z',
        }),
        normalizeRecord({
          workflowId: 'client-sync',
          client: 'client-17',
          status: 'success',
          outcomes: { leads_created: 2 },
          finishedAt: '2026-07-03T12:00:00Z',
        }),
        normalizeRecord({
          workflowId: 'client-sync',
          client: 'client-17',
          status: 'failed',
          retryCount: 2,
          finishedAt: '2026-07-04T12:00:00Z',
        }),
      ];
      const report = buildMonthlyReport({ runs, month: '2026-07', client: 'client-17' });
      assert.strictEqual(report.totals.attempts, 3);
      assert.strictEqual(report.totals.successRate, 0.6667);
      assert.strictEqual(report.totals.attributedCostUsd, 0.25);
      assert.strictEqual(report.totals.unpricedAttempts, 2);
      assert.strictEqual(report.totals.attributedTimeSavedMinutes, 15);
      assert.strictEqual(report.totals.unknownTimeSavedAttempts, 2);
      assert.strictEqual(report.totals.outcomes.leads_created, 5);
      assert.match(renderMonthlyMarkdown(report), /unknown values are never treated as zero/i);
    });

    check('writes mode-0600 JSON and Markdown report artifacts', () => {
      const stateDir = path.join(temp, 'reports');
      const report = buildMonthlyReport({ runs: [], month: '2026-07' });
      const files = writeMonthlyReport(report, { stateDir });
      assert(fs.existsSync(files.jsonPath));
      assert(fs.existsSync(files.markdownPath));
      assert.strictEqual(fs.statSync(files.jsonPath).mode & 0o777, 0o600);
      assert.strictEqual(fs.statSync(files.markdownPath).mode & 0o777, 0o600);
    });

    check('parses repeatable outcomes and a command boundary', () => {
      const args = parseArgs([
        'run',
        '--workflow',
        'lead-sync',
        '--outcome',
        'lead_created=true',
        '--outcome',
        'records=4',
        '--',
        'node',
        '-v',
      ]);
      assert.deepStrictEqual(args.outcomes, { lead_created: true, records: 4 });
      assert.deepStrictEqual(args.child, ['node', '-v']);
    });

    console.log(`\nPASS ${count}/${count} workflow-observability`);
    return count;
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

module.exports = { runTests };

if (require.main === module) runTests();
