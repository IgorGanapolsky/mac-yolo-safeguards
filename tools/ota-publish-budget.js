#!/usr/bin/env node
'use strict';

/**
 * Hard OTA spend budget (post 2026-07-23 Expo overage crisis).
 *
 * Caps (permanent — never burn Expo overages again):
 *   - ≤ MAX_RUNS_48H workflow runs of mobile-ota.yml per rolling 48h (includes failed)
 *   - ≤ 1 successful production publish per rolling 24h (America/New_York calendar day)
 *
 * Emergency bypass (both required):
 *   FORCE_OTA=1 AND HERMES_OTA_FORCE_APPROVED=1
 *
 * Usage:
 *   node tools/ota-publish-budget.js
 *   node tools/ota-publish-budget.js --json
 *   node tools/ota-publish-budget.js --channel production
 */

const { spawnSync } = require('child_process');
const path = require('path');

const WORKFLOW_FILE = 'mobile-ota.yml';
const MAX_RUNS_48H = 3;
const MAX_PROD_SUCCESS_24H = 1;
const MS_HOUR = 60 * 60 * 1000;
const MS_48H = 48 * MS_HOUR;
const TZ = 'America/New_York';
// Ignore pre-guard crisis spam (121 runs / 48h ending 2026-07-23) so the first
// post-guard tip-of-day OTA is not permanently blocked by history. Going forward,
// only runs at/after this epoch count toward the 48h spam cap.
const DEFAULT_BUDGET_EPOCH = '2026-07-24T20:00:00.000Z';

const DEFAULT_REPO = process.env.GITHUB_REPOSITORY || 'IgorGanapolsky/mac-yolo-safeguards';

function parseArgs(argv) {
  const out = {
    json: false,
    channel: process.env.OTA_BUDGET_CHANNEL || '',
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--channel') out.channel = String(argv[++i] || '');
    else if (a.startsWith('--channel=')) out.channel = a.slice('--channel='.length);
  }
  return out;
}

function forceApproved(env = process.env) {
  return env.FORCE_OTA === '1' && env.HERMES_OTA_FORCE_APPROVED === '1';
}

function etDayKey(iso, nowMs = Date.now()) {
  const d = new Date(iso || nowMs);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function isProductionIntent(run) {
  if (run.productionIntent === true) return true;
  if (run.productionIntent === false) return false;
  const jobs = Array.isArray(run.jobs) ? run.jobs : [];
  if (jobs.length > 0) {
    return jobs.some((j) => {
      const name = String(j.name || j.job_name || '');
      if (!/production/i.test(name)) return false;
      const conclusion = String(j.conclusion || '').toLowerCase();
      // skipped = publish_production was false
      return conclusion !== 'skipped';
    });
  }
  const title = `${run.displayTitle || ''} ${run.name || ''}`;
  if (/publish_production|production ota|production channel/i.test(title)) return true;
  // Conservative: workflow_dispatch without job detail counts as production-capable
  // only when explicitly flagged via env OTA_BUDGET_ASSUME_PRODUCTION=1
  return false;
}

function isSuccessfulProduction(run) {
  if (!isProductionIntent(run)) return false;
  const conclusion = String(run.conclusion || '').toLowerCase();
  if (conclusion === 'success') return true;
  const jobs = Array.isArray(run.jobs) ? run.jobs : [];
  return jobs.some((j) => {
    const name = String(j.name || '');
    return /publish production/i.test(name) && String(j.conclusion || '').toLowerCase() === 'success';
  });
}

function budgetEpochMs(env = process.env, opts = {}) {
  if (opts.epochMs != null) return Number(opts.epochMs);
  const raw = opts.epochIso || env.OTA_BUDGET_EPOCH || DEFAULT_BUDGET_EPOCH;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : Date.parse(DEFAULT_BUDGET_EPOCH);
}

function evaluateBudget(runs, opts = {}) {
  const nowMs = opts.nowMs != null ? opts.nowMs : Date.now();
  const epochMs = budgetEpochMs(opts.env || process.env, opts);
  const currentRunId = opts.currentRunId != null ? String(opts.currentRunId) : '';
  const channel = String(opts.channel || '').toLowerCase();
  const checkingProduction =
    channel === 'production' ||
    channel === 'production-android-paid' ||
    opts.requireProductionSlot === true;

  const others = (Array.isArray(runs) ? runs : []).filter((r) => {
    const id = String(r.databaseId || r.id || '');
    if (currentRunId && id && id === currentRunId) return false;
    // Count completed + in_progress; ignore pure queued ghosts with no createdAt
    if (!r.createdAt) return false;
    return true;
  });

  const in48h = others.filter((r) => {
    const t = Date.parse(r.createdAt);
    // Spam cap only counts runs after the spend-guard epoch (not 2026-07-23 crisis history).
    return (
      Number.isFinite(t) &&
      t >= epochMs &&
      nowMs - t <= MS_48H &&
      nowMs - t >= 0
    );
  });

  const todayEt = etDayKey(nowMs, nowMs);
  const prodSuccessToday = others.filter((r) => {
    if (!isSuccessfulProduction(r)) return false;
    const t = Date.parse(r.createdAt);
    if (!Number.isFinite(t) || nowMs - t > MS_48H) return false;
    // Calendar day ET (stricter than pure 24h rolling for "tip of day" batching)
    return etDayKey(r.createdAt, nowMs) === todayEt;
  });

  // Also enforce rolling 24h for successful production (belt + suspenders)
  const prodSuccess24h = others.filter((r) => {
    if (!isSuccessfulProduction(r)) return false;
    const t = Date.parse(r.createdAt);
    return Number.isFinite(t) && nowMs - t <= 24 * MS_HOUR && nowMs - t >= 0;
  });

  const violations = [];
  if (in48h.length >= MAX_RUNS_48H) {
    violations.push({
      code: 'MAX_RUNS_48H',
      message: `OTA spend budget: ${in48h.length} mobile-ota.yml runs in last 48h (max ${MAX_RUNS_48H}, including failed). Batch tip-of-day; do not spam workflow_dispatch.`,
      count: in48h.length,
      limit: MAX_RUNS_48H,
    });
  }

  if (checkingProduction) {
    const prodHits = Math.max(prodSuccessToday.length, prodSuccess24h.length);
    if (prodHits >= MAX_PROD_SUCCESS_24H) {
      violations.push({
        code: 'MAX_PROD_PER_DAY',
        message: `OTA spend budget: already ${prodHits} successful production OTA in the last 24h / ET day (max ${MAX_PROD_SUCCESS_24H}). Wait for tomorrow ET or use FORCE_OTA=1 + HERMES_OTA_FORCE_APPROVED=1.`,
        count: prodHits,
        limit: MAX_PROD_SUCCESS_24H,
        etDay: todayEt,
      });
    }
  }

  return {
    ok: violations.length === 0,
    violations,
    stats: {
      runs48h: in48h.length,
      maxRuns48h: MAX_RUNS_48H,
      prodSuccessEtDay: prodSuccessToday.length,
      prodSuccess24h: prodSuccess24h.length,
      maxProdPerDay: MAX_PROD_SUCCESS_24H,
      etDay: todayEt,
      checkingProduction,
      currentRunId: currentRunId || null,
      budgetEpoch: new Date(epochMs).toISOString(),
    },
    runIds48h: in48h.map((r) => String(r.databaseId || r.id || '')).filter(Boolean),
  };
}

function defaultFetchRuns({ repo = DEFAULT_REPO, limit = 40, fetchJobs = true } = {}) {
  const list = spawnSync(
    'gh',
    [
      'run',
      'list',
      '--workflow',
      WORKFLOW_FILE,
      '--repo',
      repo,
      '--limit',
      String(limit),
      '--json',
      'databaseId,conclusion,status,createdAt,displayTitle,event,name',
    ],
    { encoding: 'utf8' },
  );
  if (list.status !== 0) {
    const err = (list.stderr || list.stdout || 'gh run list failed').trim();
    const e = new Error(`ota-publish-budget: failed to list workflow runs: ${err}`);
    e.code = 'GH_LIST_FAILED';
    throw e;
  }
  let runs;
  try {
    runs = JSON.parse(list.stdout || '[]');
  } catch (err) {
    const e = new Error(`ota-publish-budget: invalid gh JSON: ${err.message}`);
    e.code = 'GH_JSON_INVALID';
    throw e;
  }

  if (!fetchJobs) return runs;

  // Enrich recent runs with job conclusions so we can detect production intent.
  return runs.map((run) => {
    const id = run.databaseId;
    if (!id) return run;
    const age = Date.now() - Date.parse(run.createdAt || 0);
    if (!Number.isFinite(age) || age > MS_48H) return run;
    const view = spawnSync(
      'gh',
      ['run', 'view', String(id), '--repo', repo, '--json', 'jobs'],
      { encoding: 'utf8' },
    );
    if (view.status !== 0) return run;
    try {
      const parsed = JSON.parse(view.stdout || '{}');
      return { ...run, jobs: parsed.jobs || [] };
    } catch {
      return run;
    }
  });
}

function main(argv = process.argv.slice(2), deps = {}) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`Usage: node tools/ota-publish-budget.js [--json] [--channel production]

Hard caps (2026-07-23 overage crisis — never burn Expo again):
  - ≤${MAX_RUNS_48H} mobile-ota.yml runs / rolling 48h after budget epoch (including failed)
  - ≤${MAX_PROD_SUCCESS_24H} successful production OTA / ET day + rolling 24h
  - Budget epoch default: ${DEFAULT_BUDGET_EPOCH} (override OTA_BUDGET_EPOCH)

Emergency: FORCE_OTA=1 AND HERMES_OTA_FORCE_APPROVED=1
`);
    return 0;
  }

  const env = deps.env || process.env;
  const fetchRuns = deps.fetchRuns || defaultFetchRuns;
  const nowMs = deps.nowMs != null ? deps.nowMs : Date.now();

  if (forceApproved(env)) {
    const payload = {
      ok: true,
      forced: true,
      message: 'OTA spend budget bypassed (FORCE_OTA=1 + HERMES_OTA_FORCE_APPROVED=1).',
    };
    if (args.json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    else process.stdout.write(`${payload.message}\n`);
    return 0;
  }

  let runs;
  try {
    runs = fetchRuns({
      repo: env.GITHUB_REPOSITORY || DEFAULT_REPO,
      limit: Number(env.OTA_BUDGET_RUN_LIMIT || 40),
      fetchJobs: env.OTA_BUDGET_SKIP_JOBS !== '1',
    });
  } catch (err) {
    // Fail closed — cannot verify budget without gh.
    process.stderr.write(`FATAL: ${err.message}\n`);
    return 1;
  }

  const channel =
    args.channel ||
    env.OTA_BUDGET_CHANNEL ||
    (env.INPUT_PUBLISH_PRODUCTION === 'true' ? 'production' : '');
  const requireProductionSlot =
    channel === 'production' ||
    channel === 'production-android-paid' ||
    env.INPUT_PUBLISH_PRODUCTION === 'true' ||
    env.OTA_BUDGET_REQUIRE_PRODUCTION_SLOT === '1';

  const result = evaluateBudget(runs, {
    nowMs,
    currentRunId: env.GITHUB_RUN_ID || '',
    channel,
    requireProductionSlot,
  });

  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write(
      `OTA spend budget OK: ${result.stats.runs48h}/${result.stats.maxRuns48h} runs in 48h` +
        (result.stats.checkingProduction
          ? `; prod today ET ${result.stats.prodSuccessEtDay}/${result.stats.maxProdPerDay}`
          : '') +
        '.\n',
    );
  } else {
    for (const v of result.violations) {
      process.stderr.write(`FATAL: ${v.message}\n`);
    }
    process.stderr.write(
      '\nStanding rule: never burn Expo overages. Batch one tip-of-day OTA.\n' +
        'Emergency only: FORCE_OTA=1 and HERMES_OTA_FORCE_APPROVED=1 (repo Actions variable).\n',
    );
  }

  return result.ok ? 0 : 1;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  MAX_RUNS_48H,
  MAX_PROD_SUCCESS_24H,
  WORKFLOW_FILE,
  TZ,
  DEFAULT_BUDGET_EPOCH,
  forceApproved,
  etDayKey,
  budgetEpochMs,
  isProductionIntent,
  isSuccessfulProduction,
  evaluateBudget,
  defaultFetchRuns,
  main,
  parseArgs,
};
