#!/usr/bin/env node
'use strict';

/**
 * Inference platform overview — Baseten app.baseten.co/overview analog for Hermes.
 *
 * Single pane: coding path grade, dual fleet grade, design scorecard, model library
 * readiness, SuperGrok doctor, recommended actions. No GPU dashboard — fleet truth.
 *
 *   node tools/inference-eng/overview.js
 *   node tools/inference-eng/overview.js --json
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { runScorecard } = require('./scorecard');
const { assess } = require('./fleet-health');
const { listRoutes, techniqueChecklist, pickRoute } = require('./model-library');
const { wantsSuperGrok } = require('./degradation');

function readJsonSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function grokDoctorReady(env = process.env) {
  if (env.HERMES_YOLO_FORCE_GROK === '1') return { ready: true, source: 'force' };
  if (env.HERMES_YOLO_FORCE_HERMES === '1') return { ready: false, source: 'force-hermes' };
  const bin =
    env.GROK_YOLO_BIN ||
    path.join(os.homedir(), '.local', 'bin', 'grok-yolo');
  if (!fs.existsSync(bin)) return { ready: false, source: 'missing-bin' };
  try {
    const r = spawnSync(bin, ['--doctor', '--json'], {
      encoding: 'utf8',
      timeout: 15000,
      env,
    });
    if (r.status !== 0) return { ready: false, source: 'doctor-fail', status: r.status };
    const d = JSON.parse(r.stdout || '{}');
    return {
      ready: Boolean(d.ready && d.authenticated !== false && d.modelAvailable !== false),
      source: 'grok-yolo-doctor',
      model: d.model || d.defaultModel,
      authenticated: d.authenticated,
    };
  } catch (e) {
    return { ready: false, source: 'doctor-error', error: String(e.message || e).slice(0, 120) };
  }
}

function basetenKeyPresent() {
  if (process.env.BASETEN_API_KEY) return { present: true, source: 'env' };
  const envPath = path.join(os.homedir(), '.hermes', '.env');
  try {
    const text = fs.readFileSync(envPath, 'utf8');
    if (/^BASETEN_API_KEY=.+/m.test(text)) return { present: true, source: 'hermes-env' };
  } catch {
    /* */
  }
  try {
    const r = spawnSync(
      'security',
      ['find-generic-password', '-a', 'hermes-fleet', '-s', 'BASETEN_API_KEY', '-w'],
      { encoding: 'utf8' },
    );
    if (r.status === 0 && (r.stdout || '').trim().length > 10) {
      return { present: true, source: 'keychain', len: r.stdout.trim().length };
    }
  } catch {
    /* */
  }
  return { present: false };
}

function buildOverview(options = {}) {
  const env = options.env || process.env;
  const windowHours = options.windowHours === undefined ? 6 : Number(options.windowHours);
  const scorecard = runScorecard();
  const fleet = assess({ windowHours, env, dropDeadModels: options.dropDeadModels !== false });
  const doctor = grokDoctorReady(env);
  const baseten = basetenKeyPresent();
  const library = listRoutes();
  const techniques = techniqueChecklist();
  const pick = pickRoute({ taskText: 'fix the production bug', env });
  const owned = techniques.filter((t) => t.owned === true).length;
  const partial = techniques.filter((t) => t.owned === 'partial').length;

  const surfaces = {
    designScorecard: {
      grade: scorecard.grade,
      aPlus: scorecard.aPlus,
      tenOfTen: scorecard.tenOfTen,
      averageScore: scorecard.averageScore,
      strictAllPass: scorecard.checks.every((c) => c.pass === true),
    },
    codingPath: fleet.codingPath || null,
    dualFleet: {
      grade: fleet.grade,
      score: fleet.score,
      aPlus: fleet.aPlus,
      n: fleet.n,
      successRate: fleet.successRate,
      sources: fleet.sources,
    },
  };

  // Platform A+ only if design + coding path are A+ (honest: dual gateway may lag)
  const platformAPlus =
    surfaces.designScorecard.aPlus &&
    surfaces.designScorecard.strictAllPass &&
    surfaces.codingPath &&
    surfaces.codingPath.aPlus;

  const actions = [];
  if (!doctor.ready) {
    actions.push({
      severity: 'high',
      action: 'restore-supergrok',
      detail: 'grok-yolo doctor not ready — SuperGrok coding path will fall back',
    });
  }
  if (surfaces.dualFleet.successRate != null && surfaces.dualFleet.successRate < 0.9) {
    actions.push({
      severity: 'high',
      action: 'stabilize-gateway',
      detail: `dual fleet success=${(surfaces.dualFleet.successRate * 100).toFixed(1)}% — drop empty free/kimi or wire stable Model API`,
    });
  }
  if (baseten.present && env.HERMES_BASETEN_READY !== '1') {
    actions.push({
      severity: 'info',
      action: 'probe-baseten',
      detail: 'BASETEN_API_KEY stored — authorize spend then probe Model APIs for gateway A+',
    });
  }
  if (!baseten.present) {
    actions.push({
      severity: 'info',
      action: 'optional-baseten-key',
      detail: 'No Baseten key — optional for Model APIs rung (not required for SuperGrok A+)',
    });
  }
  if (surfaces.codingPath && surfaces.codingPath.aPlus && !surfaces.dualFleet.aPlus) {
    actions.push({
      severity: 'info',
      action: 'keep-coding-path',
      detail: 'codingPath A+ — keep HERMES_YOLO_BACKEND=grok; do not conflate with LiteLLM thrash',
    });
  }

  return {
    schema: 'hermes-inference-platform/overview-v1',
    generatedAt: new Date().toISOString(),
    tagline: 'Inference is everything — Hermes fleet control plane (Baseten-inspired, Mac-owned)',
    basetenInspiration: [
      'Model Library → tools/inference-eng/model-library.js',
      'Overview dashboard → this command',
      'Dedicated vs Model APIs → SuperGrok vs LiteLLM free/sub tiers',
      'SLA/economics control → task budgets + degradation modes',
      'Chains → multi-step pipelines',
      'Runtime techniques checklist → techniqueChecklist()',
    ],
    platformAPlus,
    surfaces,
    superGrok: {
      preferred: wantsSuperGrok(env),
      doctor,
      backendEnv: env.HERMES_YOLO_BACKEND || 'auto',
      modeEnv: env.HERMES_INFERENCE_MODE || null,
    },
    basetenKey: baseten,
    recommendedCodingRoute: {
      id: pick.route.id,
      model: pick.route.model,
      provider: pick.route.provider,
      reason: pick.reason,
    },
    librarySize: library.length,
    techniques: { owned, partial, total: techniques.length, items: techniques },
    actions,
    note:
      'platformAPlus requires design scorecard A+ (strict) AND codingPath A+ (SuperGrok receipts). ' +
      'Dual LiteLLM grade is reported separately and may be lower during free-tier empty thrash.',
  };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  let windowHours = 6;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--window-hours') windowHours = Number(argv[++i] || 6);
  }
  const report = buildOverview({ windowHours });
  const stateDir = path.join(os.homedir(), '.hermes', 'inference-eng');
  try {
    fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(
      path.join(stateDir, 'overview-latest.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      { mode: 0o600 },
    );
  } catch {
    /* */
  }
  if (json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    console.log(`Hermes Inference Platform overview`);
    console.log(`  platformAPlus=${report.platformAPlus}`);
    console.log(
      `  design=${report.surfaces.designScorecard.grade} aPlus=${report.surfaces.designScorecard.aPlus} strict=${report.surfaces.designScorecard.strictAllPass}`,
    );
    if (report.surfaces.codingPath) {
      console.log(
        `  codingPath=${report.surfaces.codingPath.grade} n=${report.surfaces.codingPath.n} ` +
          `success=${
            report.surfaces.codingPath.successRate == null
              ? 'n/a'
              : (report.surfaces.codingPath.successRate * 100).toFixed(1) + '%'
          } aPlus=${report.surfaces.codingPath.aPlus}`,
      );
    }
    console.log(
      `  dualFleet=${report.surfaces.dualFleet.grade} n=${report.surfaces.dualFleet.n} ` +
        `success=${
          report.surfaces.dualFleet.successRate == null
            ? 'n/a'
            : (report.surfaces.dualFleet.successRate * 100).toFixed(1) + '%'
        }`,
    );
    console.log(
      `  SuperGrok doctor ready=${report.superGrok.doctor.ready} backend=${report.superGrok.backendEnv}`,
    );
    console.log(
      `  basetenKey present=${report.basetenKey.present} codingRoute=${report.recommendedCodingRoute.model}`,
    );
    console.log(
      `  techniques owned=${report.techniques.owned}/${report.techniques.total} (partial=${report.techniques.partial})`,
    );
    for (const a of report.actions.slice(0, 5)) {
      console.log(`  action[${a.severity}] ${a.action}: ${a.detail}`);
    }
    console.log(`  ${report.note}`);
  }
  process.exit(report.platformAPlus ? 0 : 0); // always 0; use --json consumers for gates
}

module.exports = {
  buildOverview,
  grokDoctorReady,
  basetenKeyPresent,
};
