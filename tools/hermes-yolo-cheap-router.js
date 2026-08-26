#!/usr/bin/env node
'use strict';

/**
 * Dynamic hermes-yolo cheap rail: Granite vs Seed vs glm-coding vs local.
 * Catalog-backed. Does not replace glm-coding for implement/fix.
 * Does not edit Codex AGENT-542 wrapper/smart-router files.
 */

const granite = require('./ibm-granite-yolo-router');
const seed = require('./bytedance-seed-yolo-router');

const POLICY_VERSION = 1;

function classify(task) {
  const g = granite.taskSignals(task);
  const s = seed.taskSignals(task);
  return {
    sensitive: g.sensitive || s.sensitive,
    coding: g.coding || s.coding,
    asksGranite: g.asksGranite,
    asksSeed: s.asksSeed,
    asksTurbo: s.asksTurbo,
    asksLocal: g.asksLocal || s.asksLocal,
    multimodal: s.multimodal,
    agentic: g.agentic || s.agentic,
    easy: g.easy || s.easy,
    math: g.math,
    smoke: g.smoke,
  };
}

function selectRoute(opts = {}) {
  const task = opts.task || '';
  const signals = classify(task);
  const spend = opts.spend || granite.loadSpend(opts.spendFile);

  const wrap = (lane, route) => ({
    policyVersion: POLICY_VERSION,
    lane,
    signals,
    ...route,
  });

  if (signals.sensitive || signals.asksLocal) {
    return wrap('local', granite.selectRoute({ ...opts, task, spend }));
  }

  if (signals.coding && !signals.asksSeed && !signals.asksGranite) {
    return wrap('glm-coding', granite.selectRoute({ ...opts, task, spend }));
  }

  if (signals.multimodal || (signals.asksSeed && !signals.asksGranite)) {
    return wrap('seed', seed.selectRoute({ ...opts, task, spend, preferSeed: true }));
  }

  if (signals.asksGranite || signals.easy || signals.math || signals.smoke || signals.agentic) {
    return wrap('granite', granite.selectRoute({ ...opts, task, spend, preferGranite: true }));
  }

  return wrap('glm-coding', granite.selectRoute({ ...opts, task, spend }));
}

function doctor(opts = {}) {
  return {
    schema: 'hermes-yolo-cheap/doctor-v1',
    policyVersion: POLICY_VERSION,
    granite: granite.doctor(opts),
    seed: seed.doctor(opts),
    honesty: {
      dualEditSmartRouter: false,
      dualEditWrapper: false,
      clonedOpenRouter: false,
      liveClaim: false,
    },
    rule: 'sensitive→local; implement→glm-coding; multimodal/seed→cheapest Seed; granite/reason→Granite 4.1-8b; Seed 2.1 Turbo only --paid-ok',
  };
}

function parseArgs(argv) {
  const out = {
    task: '', json: false, doctor: false, probeCatalog: false, paidOk: false,
    catalogFile: '', spendFile: '', help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--task') out.task = argv[++i] || '';
    else if (a === '--json') out.json = true;
    else if (a === '--doctor') out.doctor = true;
    else if (a === '--probe-catalog') out.probeCatalog = true;
    else if (a === '--paid-ok') out.paidOk = true;
    else if (a === '--catalog-file') out.catalogFile = argv[++i] || '';
    else if (a === '--spend-file') out.spendFile = argv[++i] || '';
    else if (a === '--help' || a === '-h') out.help = true;
    else if (!a.startsWith('-') && !out.task) out.task = a;
  }
  return out;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write('Usage: node tools/hermes-yolo-cheap-router.js --task "..." [--json] [--doctor] [--paid-ok]\n');
    return 0;
  }
  if (args.doctor && !args.task) {
    const report = doctor({ spendFile: args.spendFile });
    process.stdout.write(args.json ? `${JSON.stringify(report, null, 2)}\n` : `${report.rule}\n`);
    return 0;
  }
  const route = selectRoute({
    task: args.task,
    spendFile: args.spendFile,
    paidOk: args.paidOk,
  });
  const payload = { schema: 'hermes-yolo-cheap/route-v1', route };
  if (args.json) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  else process.stdout.write(`${route.lane} → ${route.provider} / ${route.model}\nreason: ${route.reason}\n`);
  return 0;
}

module.exports = { POLICY_VERSION, classify, selectRoute, doctor, parseArgs, main };

if (require.main === module) {
  main().then((code) => { process.exitCode = code; }).catch((err) => {
    process.stderr.write(`${err.message}\n`);
    process.exitCode = 1;
  });
}
