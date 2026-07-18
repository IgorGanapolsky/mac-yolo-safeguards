#!/usr/bin/env node
'use strict';

/**
 * smart-ops-controller.js — Efficient unattended brain for mac-yolo-safeguards.
 *
 * Goals: smart, automated, efficient — zero CEO labor.
 *
 * What it does each run:
 *  1) Health-check critical LaunchAgents; reinstall missing ones if install script exists
 *  2) Revenue loop with --fast + --auto-send (skip if last receipt fresh and noop)
 *  3) GitHub reply monitor (if present) only when not run recently
 *  4) Write private efficiency receipt
 *
 * Usage:
 *   node tools/smart-ops-controller.js [--json] [--force] [--no-revenue] [--no-heal]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const {
  appendExecution,
  buildMonthlyReport,
  notifyFindings,
  scanExecutions,
  writeMonthlyReport,
} = require('./workflow-observability');

const REPO = path.resolve(__dirname, '..');
const HOME = os.homedir();
const REVENUE_DIR =
  process.env.REVENUE_DIR ||
  (fs.existsSync(path.join(REPO, 'business_os', 'revenue'))
    ? path.join(REPO, 'business_os', 'revenue')
    : path.join(HOME, 'workspace/git/igor/mac-yolo-safeguards/business_os/revenue'));

const CRITICAL_AGENTS = [
  'com.igor.shutdown-simulators',
  'com.igor.revenue-autonomous-loop',
  'com.igor.ralph-gsd-loop',
  'com.igor.hermes-mobile-continuous-e2e',
  'com.igor.repo-root-hygiene',
  'com.igor.agent-vault-sync',
  'com.igor.github-reply-monitor',
];

const REVENUE_SKIP_IF_FRESH_MIN = Number(process.env.SMART_OPS_REVENUE_FRESH_MIN || 25);
const REPLY_SKIP_IF_FRESH_MIN = Number(process.env.SMART_OPS_REPLY_FRESH_MIN || 90);

function parseArgs(argv) {
  const a = {
    json: false,
    force: false,
    revenue: true,
    heal: true,
    observability: true,
    observabilityNotify: true,
    help: false,
  };
  for (const arg of argv) {
    if (arg === '--json') a.json = true;
    else if (arg === '--force') a.force = true;
    else if (arg === '--no-revenue') a.revenue = false;
    else if (arg === '--no-heal') a.heal = false;
    else if (arg === '--no-observability') a.observability = false;
    else if (arg === '--no-observability-notify') a.observabilityNotify = false;
    else if (arg === '--help' || arg === '-h') a.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return a;
}

function launchctlPrint(label) {
  const uid = process.getuid?.() ?? 0;
  const r = spawnSync('launchctl', ['print', `gui/${uid}/${label}`], {
    encoding: 'utf8',
    timeout: 5000,
  });
  if (r.status !== 0) return { loaded: false, raw: (r.stderr || '').slice(0, 120) };
  const out = r.stdout || '';
  const state = (out.match(/state = ([^\n]+)/) || [])[1] || 'unknown';
  const interval = (out.match(/run interval = (\d+)/) || [])[1];
  const lastExit = (out.match(/last exit code = ([^\n]+)/) || [])[1];
  return { loaded: true, state: state.trim(), interval, lastExit: lastExit && lastExit.trim() };
}

function lastRevenueReceiptAgeMin() {
  const p = path.join(REVENUE_DIR, 'autonomous-loop-receipts.jsonl');
  if (!fs.existsSync(p)) return Infinity;
  try {
    const lines = fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean);
    if (!lines.length) return Infinity;
    const last = JSON.parse(lines[lines.length - 1]);
    const age = (Date.now() - Date.parse(last.ts || 0)) / 60000;
    return Number.isFinite(age) ? age : Infinity;
  } catch {
    return Infinity;
  }
}

function lastReplyMonitorAgeMin() {
  const p = path.join(HOME, '.hermes/github-reply-monitor-state.json');
  if (!fs.existsSync(p)) return Infinity;
  try {
    const st = fs.statSync(p);
    return (Date.now() - st.mtimeMs) / 60000;
  } catch {
    return Infinity;
  }
}

function runNode(script, args, timeoutMs) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: REPO,
    encoding: 'utf8',
    timeout: timeoutMs,
    env: {
      ...process.env,
      REVENUE_DIR,
      REVENUE_AUTO_SEND: process.env.REVENUE_AUTO_SEND || '1',
      REVENUE_AUTO_GH: process.env.REVENUE_AUTO_GH || '1',
      REVENUE_NTFY_QUIET_NOOP: process.env.REVENUE_NTFY_QUIET_NOOP || '1',
      PATH: `${HOME}/.local/bin:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ''}`,
    },
    maxBuffer: 4 * 1024 * 1024,
  });
}

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true, mode: 0o700 });
}

function healAgents(report) {
  const missing = report.filter((r) => !r.loaded).map((r) => r.label);
  if (!missing.length) return { healed: [], skipped: true };
  const install = path.join(REPO, 'scripts/install-agent-launchagents.sh');
  if (!fs.existsSync(install)) return { healed: [], error: 'no_install_script' };
  const r = spawnSync('bash', [install], {
    cwd: REPO,
    encoding: 'utf8',
    timeout: 120000,
  });
  return {
    healed: missing,
    installStatus: r.status,
    installTail: `${r.stdout || ''}${r.stderr || ''}`.slice(-400),
  };
}

function run(args) {
  const started = Date.now();
  const actions = [];
  const observedRuns = [];
  const observationErrors = [];
  const observe = (input) => {
    if (!args.observability) return null;
    try {
      const record = appendExecution({ client: 'internal', source: 'smart-ops', ...input });
      observedRuns.push(record);
      return record;
    } catch (error) {
      observationErrors.push(error.message);
      actions.push(`observability_record_error=${input.workflowId}`);
      return null;
    }
  };
  const agents = CRITICAL_AGENTS.map((label) => ({ label, ...launchctlPrint(label) }));
  actions.push(`agents_loaded=${agents.filter((a) => a.loaded).length}/${agents.length}`);

  let heal = null;
  if (args.heal && agents.some((a) => !a.loaded)) {
    heal = healAgents(agents);
    actions.push(`heal=${heal.healed?.join(',') || 'none'}`);
    // re-check
    for (const a of agents) {
      Object.assign(a, launchctlPrint(a.label), { label: a.label });
    }
  }

  let revenue = null;
  if (args.revenue) {
    const age = lastRevenueReceiptAgeMin();
    if (!args.force && age < REVENUE_SKIP_IF_FRESH_MIN) {
      actions.push(`revenue=skipped_fresh_${age.toFixed(1)}m`);
      revenue = { skipped: true, ageMin: age };
      observe({
        workflowId: 'revenue-autonomous-loop',
        status: 'skipped',
        durationMs: 0,
        outcomes: { fresh_receipt: true },
      });
    } else {
      const revenueStarted = Date.now();
      const r = runNode(
        'tools/revenue-autonomous-loop.js',
        ['--json', '--auto-send', '--fast'],
        120000,
      );
      try {
        revenue = JSON.parse(r.stdout || '{}');
        revenue.exit = r.status;
      } catch {
        revenue = { ok: false, exit: r.status, raw: (r.stdout || r.stderr || '').slice(0, 300) };
      }
      actions.push(
        `revenue=ran ok=${revenue.ok} due=${(revenue.due || []).length} sent=${revenue.sentCount || 0} noop=${revenue.noop}`,
      );
      const revenueTimedOut = r.error && r.error.code === 'ETIMEDOUT';
      const revenueOk = r.status === 0 && revenue.ok !== false;
      observe({
        workflowId: 'revenue-autonomous-loop',
        status: revenueTimedOut ? 'timeout' : revenueOk ? 'success' : 'failed',
        startedAt: new Date(revenueStarted).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - revenueStarted,
        exitCode: revenueTimedOut ? 124 : Number.isInteger(r.status) ? r.status : 1,
        outcomes: {
          receipt_written: Boolean(revenue.receiptPath && fs.existsSync(revenue.receiptPath)),
          messages_sent: Number(revenue.sentCount || 0),
          followups_due: (revenue.due || []).length,
          stripe_links_ok: (revenue.stripe || []).filter((item) => item.ok).length,
        },
        errorClass: revenueTimedOut ? 'timeout' : revenueOk ? null : 'revenue_loop_failed',
        errorMessage: revenueOk ? null : 'revenue loop did not complete successfully',
      });
    }
  }

  let replyMonitor = null;
  const replyScript = path.join(REPO, 'tools/github-reply-monitor.js');
  if (fs.existsSync(replyScript)) {
    const age = lastReplyMonitorAgeMin();
    if (!args.force && age < REPLY_SKIP_IF_FRESH_MIN) {
      actions.push(`reply_monitor=skipped_fresh_${age.toFixed(1)}m`);
      replyMonitor = { skipped: true, ageMin: age };
      observe({
        workflowId: 'github-reply-monitor',
        status: 'skipped',
        durationMs: 0,
        outcomes: { fresh_state: true },
      });
    } else {
      // Cap hard: gh paginate can hang; never block the efficiency brain.
      const replyStarted = Date.now();
      const r = runNode('tools/github-reply-monitor.js', [], 25000);
      const timedOut = r.error && r.error.code === 'ETIMEDOUT';
      replyMonitor = {
        exit: timedOut ? 'timeout' : r.status,
        out: (r.stdout || r.stderr || '').trim().slice(0, 200),
        timedOut,
      };
      actions.push(
        timedOut ? 'reply_monitor=timeout_25s' : `reply_monitor=exit_${r.status}`,
      );
      observe({
        workflowId: 'github-reply-monitor',
        status: timedOut ? 'timeout' : r.status === 0 ? 'success' : 'failed',
        startedAt: new Date(replyStarted).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - replyStarted,
        exitCode: timedOut ? 124 : Number.isInteger(r.status) ? r.status : 1,
        outcomes: {
          monitor_completed:
            !timedOut &&
            r.status === 0 &&
            fs.existsSync(path.join(HOME, '.hermes', 'github-reply-monitor-state.json')),
        },
        errorClass: timedOut ? 'timeout' : r.status === 0 ? null : 'reply_monitor_failed',
        errorMessage:
          timedOut || r.status !== 0 ? 'reply monitor did not complete successfully' : null,
      });
    }
  }

  // High-ROI market signals (Hermes-hosted + enterprise SDLC). Default ON via LaunchAgent env.
  // Apply pipeline seed at most once/day; hourly runs refresh drafts only.
  let marketSignal = null;
  const signalScript = path.join(REPO, 'tools/hermes-hosting-market-signal.js');
  const marketEnabled =
    args.force ||
    process.env.SMART_OPS_MARKET_SIGNAL === '1' ||
    process.env.SMART_OPS_MARKET_SIGNAL === 'true';
  if (fs.existsSync(signalScript) && marketEnabled) {
    const dayStampPath = path.join(REVENUE_DIR, 'market-signal-last-apply-day.txt');
    const todayUtc = new Date().toISOString().slice(0, 10);
    let applyToday = args.force;
    if (!applyToday) {
      try {
        applyToday = !fs.existsSync(dayStampPath) || fs.readFileSync(dayStampPath, 'utf8').trim() !== todayUtc;
      } catch {
        applyToday = true;
      }
    }
    const presets = (process.env.SMART_OPS_MARKET_PRESETS || 'hermes-hosted,enterprise-sdlc')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const results = [];
    for (const preset of presets) {
      const argv = ['--preset', preset, '--json'];
      if (applyToday) argv.push('--apply-pipeline');
      const signalStarted = Date.now();
      const r = runNode('tools/hermes-hosting-market-signal.js', argv, 90000);
      try {
        const parsed = JSON.parse(r.stdout || '{}');
        results.push({
          preset,
          ok: parsed.ok,
          pipeline: parsed.pipeline,
          stripe_ok: Object.values((parsed.stripe && parsed.stripe.links) || {}).filter((l) => l.ok)
            .length,
        });
        actions.push(
          `market_signal=${preset}:ok=${parsed.ok} stripe=${Object.values((parsed.stripe && parsed.stripe.links) || {}).filter((l) => l.ok).length} apply=${applyToday}`,
        );
        const signalOk = r.status === 0 && parsed.ok !== false;
        observe({
          workflowId: `market-signal/${preset}`,
          status: signalOk ? 'success' : 'failed',
          startedAt: new Date(signalStarted).toISOString(),
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - signalStarted,
          exitCode: Number.isInteger(r.status) ? r.status : 1,
          outcomes: {
            signal_checked: signalOk,
            pipeline_applied: Boolean(applyToday && parsed.pipeline),
            stripe_links_ok: Object.values((parsed.stripe && parsed.stripe.links) || {}).filter(
              (item) => item.ok,
            ).length,
          },
          errorClass: signalOk ? null : 'market_signal_failed',
          errorMessage: signalOk ? null : 'market signal returned a failed result',
        });
      } catch {
        results.push({ preset, ok: false, exit: r.status });
        actions.push(`market_signal=${preset}:parse_fail`);
        observe({
          workflowId: `market-signal/${preset}`,
          status: 'failed',
          startedAt: new Date(signalStarted).toISOString(),
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - signalStarted,
          exitCode: Number.isInteger(r.status) ? r.status : 1,
          outcomes: { signal_checked: false },
          errorClass: 'invalid_json',
          errorMessage: 'market signal produced invalid JSON',
        });
      }
    }
    if (applyToday) {
      try {
        ensureDir(REVENUE_DIR);
        fs.writeFileSync(dayStampPath, `${todayUtc}\n`, { mode: 0o600 });
      } catch {
        /* ignore */
      }
    }
    marketSignal = { appliedPipeline: applyToday, results };
  }

  const summary = {
    ok: true,
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    agents,
    heal,
    revenue,
    replyMonitor,
    marketSignal,
    actions,
    efficiency: {
      revenueFreshMin: REVENUE_SKIP_IF_FRESH_MIN,
      replyFreshMin: REPLY_SKIP_IF_FRESH_MIN,
      skippedRevenue: Boolean(revenue && revenue.skipped),
      skippedReply: Boolean(replyMonitor && replyMonitor.skipped),
    },
  };

  ensureDir(REVENUE_DIR);
  const receiptPath = path.join(REVENUE_DIR, 'smart-ops-receipts.jsonl');
  fs.appendFileSync(
    receiptPath,
    `${JSON.stringify({
      ts: summary.checkedAt,
      durationMs: summary.durationMs,
      actions: summary.actions,
      efficiency: summary.efficiency,
      revenue_noop: revenue && revenue.noop,
      agents_loaded: agents.filter((a) => a.loaded).length,
    })}\n`,
    { mode: 0o600 },
  );
  try {
    fs.chmodSync(receiptPath, 0o600);
  } catch {
    /* ignore */
  }
  summary.receiptPath = receiptPath;
  let observability = {
    ok: true,
    recordedRunIds: observedRuns.map((record) => record.runId),
    recordErrors: observationErrors,
    scan: null,
    notifications: [],
    reportFiles: null,
  };
  if (args.observability) {
    observe({
      workflowId: 'smart-ops',
      status: 'success',
      startedAt: new Date(started).toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      exitCode: 0,
      outcomes: {
        receipt_written: fs.existsSync(receiptPath),
        agents_loaded: agents.filter((agent) => agent.loaded).length,
      },
    });
    observability.recordedRunIds = observedRuns.map((record) => record.runId);
    observability.recordErrors = [...observationErrors];
    try {
      observability.scan = scanExecutions();
      if (args.observabilityNotify) {
        observability.notifications = notifyFindings(observability.scan);
      }
      const monthly = buildMonthlyReport();
      observability.reportFiles = writeMonthlyReport(monthly);
      actions.push(`observability=alerts_${observability.scan.alertCount}`);
    } catch (error) {
      observability.ok = false;
      observability.error = error.message;
      actions.push('observability=error');
    }
    observability.ok = observability.ok && observationErrors.length === 0;
  } else {
    observability = { ok: true, skipped: true };
  }
  summary.observability = observability;
  return summary;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(
      'Usage: node tools/smart-ops-controller.js [--json] [--force] [--no-revenue] [--no-heal] [--no-observability] [--no-observability-notify]\n',
    );
    process.exit(0);
  }
  try {
    const summary = run(args);
    if (args.json) process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    else {
      process.stdout.write(
        [
          `smart-ops duration_ms=${summary.durationMs}`,
          ...summary.actions,
          summary.receiptPath ? `receipt=${summary.receiptPath}` : '',
          '',
        ]
          .filter(Boolean)
          .join('\n'),
      );
    }
    process.exit(summary.ok === false ? 2 : 0);
  } catch (err) {
    if (args.observability) {
      try {
        appendExecution({
          workflowId: 'smart-ops',
          client: 'internal',
          source: 'smart-ops',
          status: 'failed',
          exitCode: 1,
          errorClass: 'controller_exception',
          errorMessage: err.message,
          outcomes: { receipt_written: false },
        });
      } catch {
        // Preserve the original controller failure.
      }
    }
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}

module.exports = { parseArgs, run, lastRevenueReceiptAgeMin, launchctlPrint };

if (require.main === module) main();
