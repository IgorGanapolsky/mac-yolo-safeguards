#!/usr/bin/env node
'use strict';

/**
 * Composite system A+ scorecard: production RAG + software MoE + route gates.
 *
 * Fail-closed: A+ only when every hard gate is green (no "mostly fine").
 *
 *   node tools/system-a-plus-scorecard.js --json
 *   node tools/system-a-plus-scorecard.js --heal --json
 *   node tools/system-a-plus-scorecard.js --skip-rag   # MoE/config only (fast)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { scoreStack, letterFromScore } = require('./rag-stack-scorecard');
const { loadExpertHealth } = require('./moe-expert-health');
const { runReport, loadRetiredModelSet, isRetiredRouteModel } = require('./route-quality-report');

const REPO = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(os.homedir(), '.hermes', 'config.yaml');
const DEAD_DEFAULTS = new Set(['glm-coding', 'glm-5.2', 'z-ai/glm-5.2']);

function parseArgs(argv) {
  const args = {
    json: false,
    heal: false,
    skipRag: false,
    home: path.join(os.homedir(), '.thumbgate'),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--heal') args.heal = true;
    else if (a === '--skip-rag') args.skipRag = true;
    else if (a === '--home') args.home = path.resolve(argv[++i] || '');
    else if (a === '--help') args.help = true;
    else throw new Error(`Unknown ${a}`);
  }
  return args;
}

function parseHermesDefaults(configPath = CONFIG_PATH) {
  if (!fs.existsSync(configPath)) {
    return { ok: false, error: `missing ${configPath}` };
  }
  const text = fs.readFileSync(configPath, 'utf8');
  const topDefault = (text.match(/^model:\n(?:  .*\n)*?  default: ([^\n]+)/m) || [])[1]?.trim();
  const topModel = (text.match(/^model:\n(?:  .*\n)*?  model: ([^\n]+)/m) || [])[1]?.trim();
  const gwBlock = text.match(/litellm-gateway:[\s\S]*?(?=\n  [a-zA-Z0-9_-]+:|\ntoolsets:|\n[a-zA-Z]|$)/);
  const gwText = gwBlock ? gwBlock[0] : '';
  const gwDefault = (gwText.match(/default_model: ([^\n]+)/) || [])[1]?.trim();
  const gwModel = (gwText.match(/^\s{4}model: ([^\n]+)/m) || [])[1]?.trim();
  const defaults = [topDefault, topModel, gwDefault, gwModel].filter(Boolean);
  const deadHits = defaults.filter((d) => DEAD_DEFAULTS.has(d));
  return {
    ok: deadHits.length === 0 && Boolean(topDefault || gwDefault),
    topDefault,
    topModel,
    gatewayDefault: gwDefault,
    gatewayModel: gwModel,
    deadHits,
    configPath,
  };
}

function scoreSystem(options = {}) {
  const gates = [];
  const heals = [];

  if (options.heal) {
    const retire = spawnSync(
      process.execPath,
      [path.join(REPO, 'tools', 'moe-retire-dead-experts.js'), '--apply', '--primary', 'kimi-code-fast', '--json'],
      { encoding: 'utf8', cwd: REPO, timeout: 180000, maxBuffer: 4 * 1024 * 1024 },
    );
    let retireJson = null;
    try {
      retireJson = JSON.parse(retire.stdout || '{}');
    } catch {
      retireJson = null;
    }
    heals.push({
      step: 'moe-retire-dead-experts',
      ok: retire.status === 0 && Boolean(retireJson?.ok),
      detail: retireJson || (retire.stderr || retire.stdout || '').slice(0, 200),
    });
  }

  // --- RAG stack (optional skip for fast MoE-only loops) ---
  let rag = null;
  if (!options.skipRag) {
    rag = scoreStack({ heal: Boolean(options.heal), home: options.home });
    gates.push({
      id: 'rag-stack',
      hard: true,
      weight: 0.45,
      ok: Boolean(rag.aPlus),
      detail: `grade=${rag.grade} score=${rag.score} hardFail=${rag.hardFail}`,
      score: rag.aPlus ? 1 : Math.max(0, Number(rag.score) || 0) * 0.85,
      subgates: rag.gates,
    });
  } else {
    gates.push({
      id: 'rag-stack',
      hard: false,
      weight: 0,
      ok: true,
      detail: 'skipped (--skip-rag)',
      score: 1,
    });
  }

  // --- MoE expert health (active high-volume DEAD only) ---
  const health = loadExpertHealth({});
  const moeOk = Boolean(health.ok && health.gateOk);
  const activeDead = health.activeHighVolumeDead || [];
  gates.push({
    id: 'moe-active-dead',
    hard: true,
    weight: 0.2,
    ok: moeOk,
    detail: moeOk
      ? `activeDead=0 retiredDead=${(health.retiredHighVolumeDead || []).length} healthy=${(health.healthyModels || []).slice(0, 4).join(',') || '-'}`
      : `activeDead=${activeDead.map((d) => d.model).join(',') || health.error || 'unavailable'}`,
    score: moeOk ? 1 : 0,
  });

  // --- Route quality gate (retired excluded) ---
  const rq = runReport({ windowDays: 7 });
  const retired = loadRetiredModelSet({});
  let routeOk = false;
  let routeDetail = '';
  if (!rq.ok) {
    routeDetail = rq.error || 'route report failed';
  } else {
    const activeDeadRoutes = (rq.dead || []).filter((d) => !isRetiredRouteModel(d.model, retired));
    const activeDegraded = (rq.degraded || []).filter((d) => !isRetiredRouteModel(d.model, retired));
    routeOk = activeDeadRoutes.length === 0 && activeDegraded.length === 0;
    routeDetail = routeOk
      ? `window=${rq.windowDays}d activeDead=0 activeDegraded=0 retiredIgnored=${retired.size}`
      : `activeDead=${activeDeadRoutes.map((d) => d.model).join(',')} activeDegraded=${activeDegraded.map((d) => d.model).join(',')}`;
  }
  gates.push({
    id: 'route-quality',
    hard: true,
    weight: 0.15,
    ok: routeOk,
    detail: routeDetail,
    score: routeOk ? 1 : 0,
  });

  // --- Config defaults not pointing at dead experts ---
  const cfg = parseHermesDefaults(CONFIG_PATH);
  gates.push({
    id: 'config-defaults',
    hard: true,
    weight: 0.12,
    ok: Boolean(cfg.ok),
    detail: cfg.ok
      ? `default=${cfg.topDefault} gateway=${cfg.gatewayDefault}`
      : `deadHits=${(cfg.deadHits || []).join(',')} default=${cfg.topDefault} gateway=${cfg.gatewayDefault} ${cfg.error || ''}`,
    score: cfg.ok ? 1 : 0,
  });

  // --- Retired list present when traffic still shows DEAD volume ---
  const retiredList = health.retired || { models: [] };
  const needsRetirement =
    (health.highVolumeDead || []).length > 0 && (retiredList.models || []).length === 0;
  const retiredOk = !needsRetirement;
  gates.push({
    id: 'retired-experts-list',
    hard: true,
    weight: 0.08,
    ok: retiredOk,
    detail: retiredOk
      ? `models=${(retiredList.models || []).join(',') || '(none)'} primary=${retiredList.primary || '-'}`
      : 'high-volume DEAD present but ~/.hermes/retired-experts.json empty — run moe-retire-dead-experts --apply',
    score: retiredOk ? 1 : 0,
  });

  let weighted = 0;
  let weightSum = 0;
  let hardFail = false;
  for (const g of gates) {
    if (!g.weight) continue;
    weighted += g.score * g.weight;
    weightSum += g.weight;
    if (g.hard && !g.ok) hardFail = true;
  }
  const score = weightSum ? weighted / weightSum : 0;
  // When RAG is included, require its nDCG floor for A+.
  const ndcg = Number(rag?.meanNdcgAtK || 0);
  const grade = options.skipRag
    ? hardFail
      ? letterFromScore(score, true)
      : score >= 0.97
        ? 'A+'
        : letterFromScore(score, false, { ndcg: 1 })
    : letterFromScore(score, hardFail, { ndcg: ndcg || (hardFail ? 0 : 0.95) });
  const aPlus = grade === 'A+' && !hardFail;

  return {
    checkedAt: new Date().toISOString(),
    grade,
    score: Number(score.toFixed(4)),
    aPlus,
    hardFail,
    ok: aPlus,
    ragGrade: rag?.grade,
    ragScore: rag?.score,
    meanNdcgAtK: rag?.meanNdcgAtK,
    gates,
    heals: heals.length ? heals : undefined,
    config: cfg,
    moe: {
      gateOk: health.gateOk,
      activeHighVolumeDead: health.activeHighVolumeDead,
      retiredHighVolumeDead: health.retiredHighVolumeDead,
      healthyModels: health.healthyModels,
      retired: health.retired,
    },
  };
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log(
        'Usage: node tools/system-a-plus-scorecard.js [--json] [--heal] [--skip-rag] [--home PATH]',
      );
      process.exit(0);
    }
    const report = scoreSystem(args);
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(
        `System grade: ${report.grade} (score=${report.score}${report.hardFail ? ', hard-fail' : ''})`,
      );
      if (report.ragGrade) console.log(`  RAG subgrade: ${report.ragGrade} (score=${report.ragScore})`);
      for (const g of report.gates) {
        if (g.weight === 0 && g.detail === 'skipped (--skip-rag)') continue;
        console.log(`  ${g.ok ? 'OK' : 'FAIL'} ${g.id}: ${g.detail}`);
      }
      if (!report.aPlus) {
        console.log('A+ not met — fix hard fails; try --heal to retire dead experts + RAG heal.');
      }
    }
    process.exit(report.aPlus ? 0 : 1);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  }
}

module.exports = { scoreSystem, parseHermesDefaults, letterFromScore };
