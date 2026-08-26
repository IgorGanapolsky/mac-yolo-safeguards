#!/usr/bin/env node
'use strict';

/**
 * Hosted Tower last-mile — MotherDuck/Tower process steal for thumbgate.app.
 * Source: https://thenewstack.io/motherduck-tower-acquisition-python/ (2026-08-25)
 *
 * Steal: you can rent a feature, but you cannot rent a foundation;
 * agents write code, last mile is sandbox + schedule + credentials;
 * a hosted run needs a stable job URL. Not Tower.dev, not MotherDuck,
 * not DuckDB, not Flights, not a Python pipeline SKU.
 */

const fs = require('node:fs');
const path = require('node:path');

const SOURCE = 'https://thenewstack.io/motherduck-tower-acquisition-python/';
const SCHEMA = 'hosted-last-mile/v1';
const STABLE_ORIGIN = 'https://thumbgate.app';
const TALK_RE = /thenewstack\.io|motherduck\.com|tower\.dev|control\.tower\.dev/i;
const RENTED_RE =
  /\b(tower|motherduck|flights|duckling|e2b|openclaw|laptop|macbook|device)\b/i;
const OWNED_RE = /^(vps|cloud|hosted-vps|fenced-vps|hosted)$/i;
const PIPELINE_SKU_RE =
  /\b(tower control|python pipeline runtime|managed runtime for python|duckdb warehouse)\b/i;

function honesty() {
  return {
    schema: SCHEMA,
    source: SOURCE,
    clonedTower: false,
    clonedMotherDuck: false,
    clonedDuckDb: false,
    clonedFlights: false,
    clonedPythonPipelineSku: false,
    dualEditOnaLastMile: false,
    dualEditExecutionReceipt: false,
    workerLive: false,
    capturedRevenueUsd: 0,
    steal: [
      'cannot rent a foundation: the executor of a hosted job is our product',
      'agents write code; last mile is sandbox + schedule + credentials',
      'stable job URL on the receipt; frontend does not get broad writes',
    ],
    skip: [
      'Tower.dev / Tower Control / Python pipeline SaaS',
      'MotherDuck warehouse / DuckDB / Flights / Dives / Ducklings',
      'buying a runtime vendor',
      'tools/ona-last-mile-placement.js (Ona Mac+phone last mile)',
      'execution-receipt.ts (academy/together attach)',
      '$499 SKU / paid outreach (ECI uncleared)',
    ],
  };
}

function classifyFoundation(executor) {
  const value = String(executor || '').trim();
  if (OWNED_RE.test(value)) return 'owned';
  if (RENTED_RE.test(value)) return 'rented';
  return 'unknown';
}

function stableJobUrl(taskId, origin = STABLE_ORIGIN) {
  const id = String(taskId || '').trim();
  if (!id || /[/?#\s]/.test(id)) return null;
  const base = String(origin || STABLE_ORIGIN).replace(/\/+$/, '');
  return `${base}/dashboard?task=${encodeURIComponent(id)}`;
}

function gradeLastMile(input = {}) {
  const reasons = [];
  if (TALK_RE.test(String(input.blogUrl || input.talkUrl || ''))) {
    reasons.push('talk_is_not_production');
  }
  if (PIPELINE_SKU_RE.test(String(input.claimedProduct || input.prompt || ''))) {
    reasons.push('pipeline_sku_not_offered');
  }

  const foundation = classifyFoundation(input.executor || input.runtime);
  if (foundation === 'rented') reasons.push('cannot_rent_foundation');
  if (foundation === 'unknown') reasons.push('foundation_unknown');

  const sandboxOn = input.sandbox === true || input.sandbox === 'fenced-vps';
  const scheduleKind =
    input.schedule === 'cron'
      ? 'cron'
      : input.schedule === 'once' || input.scheduled === true
        ? 'once'
        : 'none';
  const credentialsBound = input.credentialsBound === true || input.credentials === 'vps-bound';
  const generated = input.generatedByAgent === true;
  if (generated && !sandboxOn) reasons.push('agent_wrote_code_missing_sandbox');
  if (generated && scheduleKind === 'none') reasons.push('agent_wrote_code_missing_schedule');
  if (generated && !credentialsBound) reasons.push('agent_wrote_code_missing_credentials');

  const url = stableJobUrl(input.taskId, input.origin);
  if (String(input.taskId || '').trim() && !url) reasons.push('unstable_job_url');
  if (!url) reasons.push('missing_stable_job_url');

  const lastMileComplete =
    foundation === 'owned' &&
    sandboxOn &&
    scheduleKind !== 'none' &&
    credentialsBound &&
    Boolean(url) &&
    !reasons.includes('pipeline_sku_not_offered') &&
    !reasons.includes('talk_is_not_production') &&
    !reasons.includes('cannot_rent_foundation');

  let status = 'NOT_LIVE';
  if (reasons.includes('pipeline_sku_not_offered')) status = 'NOT_OFFERED';
  else if (reasons.includes('talk_is_not_production')) status = 'NOT_LIVE';
  else if (!lastMileComplete) status = 'LAST_MILE_INCOMPLETE';
  else if (input.workerLive === true) status = 'NOT_LIVE';

  return {
    schema: SCHEMA,
    clonedTower: false,
    workerLive: false,
    capturedRevenueUsd: 0,
    liveClaim: false,
    foundation,
    sandbox: sandboxOn ? 'fenced-vps' : 'none',
    schedule: scheduleKind,
    credentials: credentialsBound ? 'vps-bound' : 'unbound',
    stableUrl: url,
    lastMileComplete,
    status,
    reasons,
  };
}

function attachLastMile(input = {}) {
  const grade = gradeLastMile(input);
  return {
    schema: grade.schema,
    foundation: grade.foundation,
    sandbox: grade.sandbox,
    schedule: grade.schedule,
    credentials: grade.credentials,
    stableUrl: grade.stableUrl,
    lastMileComplete: grade.lastMileComplete,
    liveClaim: false,
    clonedTower: false,
    status: grade.status,
    reason: grade.reasons[0] || (grade.lastMileComplete ? 'owned_fenced_vps_once' : 'last_mile_incomplete'),
  };
}

function runDemo() {
  return {
    rented: gradeLastMile({
      executor: 'tower',
      generatedByAgent: true,
      sandbox: true,
      schedule: 'once',
      credentialsBound: true,
      taskId: 'demo-rented',
    }),
    incomplete: gradeLastMile({
      executor: 'vps',
      generatedByAgent: true,
      sandbox: false,
      schedule: 'none',
      credentialsBound: false,
    }),
    hosted: gradeLastMile({
      executor: 'vps',
      generatedByAgent: true,
      sandbox: true,
      schedule: 'once',
      credentialsBound: true,
      taskId: 'demo-hosted',
    }),
    talk: gradeLastMile({
      blogUrl: SOURCE,
      executor: 'vps',
      sandbox: true,
      schedule: 'once',
      credentialsBound: true,
      taskId: 'demo-talk',
    }),
  };
}

function main(argv = process.argv.slice(2)) {
  const json = argv.includes('--json');
  if (argv.includes('--demo')) {
    process.stdout.write(`${JSON.stringify({ ...honesty(), demo: runDemo() }, null, json ? 2 : 0)}\n`);
    return 0;
  }
  const file = argv.find((arg, i) => argv[i - 1] === '--grade');
  if (file) {
    const raw = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
    const grade = gradeLastMile(raw);
    process.stdout.write(`${JSON.stringify({ ...honesty(), ...grade }, null, json ? 2 : 0)}\n`);
    return grade.lastMileComplete ? 0 : 1;
  }
  process.stdout.write(`${JSON.stringify(honesty(), null, json ? 2 : 0)}\n`);
  return 0;
}

if (require.main === module) process.exit(main());

module.exports = {
  SCHEMA,
  SOURCE,
  STABLE_ORIGIN,
  honesty,
  classifyFoundation,
  stableJobUrl,
  gradeLastMile,
  attachLastMile,
  runDemo,
  main,
};
