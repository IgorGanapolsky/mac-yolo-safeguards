#!/usr/bin/env node
'use strict';

/**
 * ceo-operating-brief.js — CEO/CTO orchestrator: DS telemetry + weak-supervision ML + Agentic RAG.
 *
 * Usage:
 *   node tools/ceo-operating-brief.js [--json] [--full]
 *
 * Layers (see AGENTS.md Decision stack):
 *   - Agentic RAG + code graph: agent-decision-stack.js
 *   - Weak-supervision ML: hermes-decision-loop.js (when gateway healthy)
 *   - Revenue DS: pipeline-data-science.js (read-only, business_os)
 *   - Product telemetry: gateway, adb, optional Jest CI (--full)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { pipelineBusyReason } = require('./agent-phone-pipeline-lock');

const REPO = path.resolve(__dirname, '..');
const APP_SUPPORT = path.join(os.homedir(), 'Library', 'Application Support', 'mac-yolo-safeguards');
const CONTINUOUS_E2E_MAX_AGE_MS = 30 * 60 * 1000;
const MAX_HUMAN_ACTIONS = 3;

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    encoding: 'utf8',
    cwd: options.cwd || REPO,
    timeout: options.timeout || 90_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

function parseArgs(argv) {
  const args = { json: false, full: false, help: false };
  for (const arg of argv) {
    if (arg === '--json') args.json = true;
    else if (arg === '--full') args.full = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function gatewayHealth() {
  const result = run('curl', ['-s', '--connect-timeout', '3', 'http://127.0.0.1:8642/health']);
  if (!result.ok) return { ok: false, error: result.stderr || result.stdout };
  try {
    const body = JSON.parse(result.stdout);
    return { ok: body.status === 'ok', localIp: body.local_ip, version: body.version };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function adbDevice() {
  const result = run('adb', ['devices']);
  if (!result.ok) return { connected: false };
  const serial = result.stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .find((parts) => parts[1] === 'device');
  return serial ? { connected: true, serial: serial[0] } : { connected: false };
}

function hermesMobileTests() {
  const result = run('npm', ['run', 'test:ci'], {
    cwd: path.join(REPO, 'hermes-mobile'),
    timeout: 180_000,
  });
  return { ok: result.ok, tail: result.stdout.split('\n').slice(-4).join('\n') };
}

function newsletterTop() {
  const file = path.join(APP_SUPPORT, 'react-native-newsletter-ingest.json');
  if (!fs.existsSync(file)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return data.top?.[0] || null;
  } catch {
    return null;
  }
}

function sendNextDryRun() {
  const result = run(process.execPath, [path.join(REPO, 'tools/send-next.js'), '--dry-run']);
  return { ok: result.ok, line: result.stdout.split('\n').find((l) => l.includes('[send-next]')) || result.stdout };
}

function decisionStack(task) {
  const result = run(process.execPath, [
    path.join(REPO, 'tools/agent-decision-stack.js'),
    '--task',
    task,
    '--json',
  ], { timeout: 120_000 });
  if (!result.ok) return { error: result.stderr || result.stdout };
  try {
    return JSON.parse(result.stdout);
  } catch {
    return { error: 'invalid json', preview: result.stdout.slice(0, 400) };
  }
}

function hermesDecisionLoop() {
  const result = run(process.execPath, [
    path.join(REPO, 'tools/hermes-decision-loop.js'),
    '--json',
  ], { timeout: 120_000 });
  if (!result.ok) return { error: result.stderr || result.stdout };
  try {
    return JSON.parse(result.stdout);
  } catch {
    return { error: 'invalid json', preview: result.stdout.slice(0, 400) };
  }
}

function pipelineDataScience() {
  const result = run(process.execPath, [path.join(REPO, 'tools/pipeline-data-science.js')], {
    timeout: 60_000,
  });
  return {
    ok: result.ok,
    summary: result.stdout.split('\n').filter((l) => l.includes('[pipeline-ds]')).slice(-5).join('\n'),
    stderr: result.stderr,
  };
}

function continuousE2eReceipt(options = {}) {
  const repo = options.repo || REPO;
  const now = options.now == null ? Date.now() : new Date(options.now).getTime();
  const file = path.join(repo, 'hermes-mobile', 'docs', 'proofs', 'continuous', 'latest.json');
  if (!fs.existsSync(file)) return { exists: false, recent: false, healthy: false };
  try {
    const receipt = JSON.parse(fs.readFileSync(file, 'utf8'));
    const updatedAtMs = new Date(receipt.updatedAt).getTime();
    const ageMs = Number.isFinite(updatedAtMs) && Number.isFinite(now) ? Math.max(0, now - updatedAtMs) : null;
    return {
      exists: true,
      updatedAt: receipt.updatedAt || null,
      unit: receipt.unit || 'missing',
      e2e: receipt.e2e || 'missing',
      detail: receipt.detail || '',
      ageMinutes: ageMs == null ? null : Math.round(ageMs / 60_000),
      recent: ageMs != null && ageMs <= CONTINUOUS_E2E_MAX_AGE_MS,
      healthy: receipt.unit === 'pass' && receipt.e2e === 'pass',
    };
  } catch (error) {
    return { exists: true, recent: false, healthy: false, error: error.message };
  }
}

function phonePipelineStatus() {
  const lockReason = pipelineBusyReason();
  if (lockReason) {
    return {
      busy: true,
      source: 'phone-pipeline-lock',
      reason: String(lockReason).replace(/\s+/g, ' ').slice(0, 160),
    };
  }

  const running = run('pgrep', ['-f', 'run-continuous-e2e\\.sh|maestro\\.cli\\.AppKt test']);
  const pids = running.ok ? running.stdout.split(/\s+/).filter((pid) => /^\d+$/.test(pid)) : [];
  if (pids.length > 0) {
    return {
      busy: true,
      source: 'process-scan',
      reason: `continuous device verification already running (${pids.length} process${pids.length === 1 ? '' : 'es'})`,
    };
  }
  return { busy: false, source: 'live-probe', reason: '' };
}

function ragBlocksPlan(brief, plannedAction) {
  const anti = brief.rag?.rag?.thumbgate?.antiPatterns || [];
  const mistakes = brief.rag?.rag?.thumbgate?.topLessons?.filter((l) => l.kind === 'MISTAKE') || [];
  const haystack = `${plannedAction} ${JSON.stringify(brief.nextActions?.[0] || {})}`.toLowerCase();
  for (const pattern of anti) {
    if (pattern.length > 20 && haystack.includes(pattern.slice(0, 40).toLowerCase())) {
      return { blocked: true, reason: pattern.slice(0, 200) };
    }
  }
  for (const mistake of mistakes) {
    if (/no real money|fake revenue|ship without/i.test(mistake.summary) && /shipped|revenue closed/i.test(haystack)) {
      return { blocked: true, reason: mistake.summary.slice(0, 200) };
    }
  }
  return { blocked: false };
}

function rankActions(brief) {
  const actions = [];
  const gatewayIp = brief.telemetry.gateway?.localIp;
  const add = (action) => actions.push({
    owner: 'agent',
    kind: 'execution',
    expectedOutcome: 'verified state change',
    externalSignal: 'live telemetry',
    ...action,
  });

  if (!brief.telemetry.gateway.ok) {
    add({
      priority: 1,
      lane: 'infra',
      action: 'Restart Hermes gateway LaunchAgent and verify :8642/health',
      expectedOutcome: 'gateway health changes from down to verified healthy',
      externalSignal: 'gateway health probe failed',
      evidence: brief.telemetry.gateway,
    });
  }

  if (brief.telemetry.hermesMobileTests?.ok === false) {
    add({
      priority: 1,
      lane: 'product',
      action: 'Fix failing hermes-mobile Jest CI before any ship claim',
      expectedOutcome: 'the failing test gate changes to pass',
      externalSignal: 'test process exited non-zero',
      evidence: brief.telemetry.hermesMobileTests,
    });
  }

  if (brief.ml?.hermesLoop?.decision === 'NO-GO') {
    add({
      priority: 1,
      lane: 'infra',
      action: `Hermes decision loop NO-GO: ${brief.ml.hermesLoop.summary || 'fix gateway/Telegram before operator work'}`,
      expectedOutcome: 'Hermes operator decision changes from NO-GO to GO',
      externalSignal: 'weak-supervision operator gate returned NO-GO',
      evidence: brief.ml.hermesLoop,
    });
  }

  const phonePipeline = brief.telemetry.phonePipeline || { busy: false };
  const e2e = brief.telemetry.continuousE2e || { exists: false, recent: false, healthy: false };
  if (brief.telemetry.adb.connected && gatewayIp && !phonePipeline.busy && !(e2e.recent && e2e.healthy)) {
    add({
      priority: 1,
      lane: 'product',
      action: 'Run one single-owner Hermes Mobile continuous E2E cycle; do not start a second phone job',
      expectedOutcome: 'latest.json becomes a fresh unit=pass and e2e=pass receipt',
      externalSignal: e2e.exists ? `latest receipt is e2e=${e2e.e2e}` : 'continuous E2E receipt is missing',
      evidence: {
        serial: brief.telemetry.adb.serial,
        gatewayUrl: `http://${gatewayIp}:8642`,
        receipt: e2e,
      },
    });
  }

  if (brief.revenue?.sendNext?.line?.includes('No prospects')) {
    add({
      priority: 2,
      lane: 'revenue',
      owner: 'human',
      kind: 'decision',
      action: 'Decide whether the prepared outreach lane is approved for an external send; otherwise pause it',
      expectedOutcome: 'an explicit send approval or a recorded pause decision',
      externalSignal: 'send-next reports zero prospects in ready state',
      evidence: brief.revenue.sendNext,
    });
  }

  if (brief.newsletterTop?.recommendation && !/release-preflight/.test(brief.newsletterTop.recommendation)) {
    add({
      priority: 3,
      lane: 'product',
      action: brief.newsletterTop.recommendation,
      expectedOutcome: 'a bounded product change with a verifier receipt',
      externalSignal: 'new ranked React Native newsletter item',
      evidence: { title: brief.newsletterTop.title, score: brief.newsletterTop.roiScore },
    });
  }

  return actions.sort((a, b) => a.priority - b.priority).slice(0, 5);
}

function chiefOfStaffView(brief, actions = rankActions(brief)) {
  const humanActions = actions.filter((action) => action.owner === 'human').slice(0, MAX_HUMAN_ACTIONS);
  const agentActions = actions.filter((action) => action.owner !== 'human');
  const valueExhaustion = [];
  const whatToIgnore = [];
  const phonePipeline = brief.telemetry?.phonePipeline;

  if (phonePipeline?.busy) {
    valueExhaustion.push({
      lane: 'device-verification',
      state: 'waiting-on-existing-run',
      reason: phonePipeline.reason,
      resumeWhen: 'the current phone-pipeline owner exits and a fresh receipt is available',
    });
    whatToIgnore.push('Do not start another pair, install, or E2E process while the phone pipeline is owned.');
  }

  if (brief.revenue?.sendNext?.line?.includes('No prospects')) {
    valueExhaustion.push({
      lane: 'revenue-outreach',
      state: 'decision-required',
      reason: brief.revenue.sendNext.line,
      resumeWhen: 'an external-send decision or a new qualified inbound signal is recorded',
    });
    whatToIgnore.push('Do not manufacture more prospect research while the prepared outreach lane awaits a decision.');
  }

  return {
    schema: 'hermes-chief-of-staff-view/v1',
    policy: {
      optimizeFor: 'verified external outcomes over activity',
      maxHumanActions: MAX_HUMAN_ACTIONS,
    },
    agentActions,
    humanActions,
    valueExhaustion,
    whatToIgnore,
  };
}

function buildBrief(options = {}) {
  const args = { full: false, ...options };
  const task = 'CEO operating brief: Hermes Mobile ship, revenue, gateway, DS/ML/RAG-driven priorities';

  const brief = {
    checkedAt: new Date().toISOString(),
    dsMlRag: {
      agenticRag: 'agent-decision-stack.js',
      weakSupervisionMl: 'hermes-decision-loop.js',
      revenueDs: 'pipeline-data-science.js',
    },
    telemetry: {
      gateway: gatewayHealth(),
      adb: adbDevice(),
      phonePipeline: phonePipelineStatus(),
      continuousE2e: continuousE2eReceipt(),
      hermesMobileTests: args.full ? hermesMobileTests() : { skipped: true, reason: 'pass --full to run Jest CI' },
    },
    ml: {},
    revenue: {},
    newsletterTop: newsletterTop(),
    rag: decisionStack(task),
    nextActions: [],
  };

  if (brief.telemetry.gateway.ok) {
    brief.ml.hermesLoop = hermesDecisionLoop();
  } else {
    brief.ml.hermesLoop = { skipped: true, reason: 'gateway unhealthy' };
  }

  brief.revenue.sendNext = sendNextDryRun();
  brief.revenue.pipelineDs = pipelineDataScience();

  brief.nextActions = rankActions(brief);
  brief.chiefOfStaff = chiefOfStaffView(brief, brief.nextActions);
  brief.ceoRecommendation = brief.chiefOfStaff.agentActions[0]?.action
    || brief.chiefOfStaff.humanActions[0]?.action
    || brief.rag?.recommendation
    || 'Run change protocol with verification.';

  const ragGate = ragBlocksPlan(brief, brief.ceoRecommendation);
  if (ragGate.blocked) {
    brief.ragGate = ragGate;
    brief.ceoRecommendation = `RAG blocked naive plan — ${ragGate.reason}. Use telemetry-backed action: ${brief.nextActions.find((a) => a.lane === 'product')?.action || brief.nextActions[0]?.action}`;
  }

  return brief;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node tools/ceo-operating-brief.js [--json] [--full]');
    process.exit(0);
  }
  const brief = buildBrief({ full: args.full });
  if (args.json) {
    console.log(JSON.stringify(brief, null, 2));
  } else {
    console.log(`CEO brief (DS/ML/RAG) @ ${brief.checkedAt}`);
    console.log(`Gateway: ${brief.telemetry.gateway.ok ? 'ok' : 'DOWN'} ${brief.telemetry.gateway.localIp || ''}`);
    console.log(`Device: ${brief.telemetry.adb.connected ? brief.telemetry.adb.serial : 'none'}`);
    if (brief.telemetry.hermesMobileTests.skipped) {
      console.log('Jest CI: skipped (--full to run)');
    } else {
      console.log(`Jest CI: ${brief.telemetry.hermesMobileTests.ok ? 'PASS' : 'FAIL'}`);
    }
    if (brief.ml.hermesLoop?.decision) {
      console.log(`Hermes loop: ${brief.ml.hermesLoop.decision} (score ${brief.ml.hermesLoop.score ?? 'n/a'})`);
    }
    console.log(`Revenue: ${brief.revenue.sendNext.line}`);
    if (brief.ragGate?.blocked) {
      console.log(`RAG gate: ${brief.ragGate.reason.slice(0, 120)}...`);
    }
    console.log('');
    console.log('Agent actions:');
    brief.chiefOfStaff.agentActions.forEach((item, index) => {
      console.log(`${index + 1}. [${item.lane}] ${item.action}`);
    });
    console.log('');
    console.log(`Human decisions (max ${MAX_HUMAN_ACTIONS}):`);
    brief.chiefOfStaff.humanActions.forEach((item, index) => {
      console.log(`${index + 1}. [${item.lane}] ${item.action}`);
    });
    if (brief.chiefOfStaff.whatToIgnore.length > 0) {
      console.log('');
      console.log('Pause / ignore:');
      brief.chiefOfStaff.whatToIgnore.forEach((item) => console.log(`- ${item}`));
    }
    console.log('');
    console.log(`CEO pick: ${brief.ceoRecommendation}`);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  MAX_HUMAN_ACTIONS,
  buildBrief,
  chiefOfStaffView,
  continuousE2eReceipt,
  phonePipelineStatus,
  rankActions,
  ragBlocksPlan,
};
