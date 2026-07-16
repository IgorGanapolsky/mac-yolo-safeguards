#!/usr/bin/env node
'use strict';

/**
 * alert-investigation-loop.js — Alert → investigate → mitigate with measured TTM (eBay theme).
 *
 * Scans continuous E2E + burn-alert state, opens an investigation receipt, records
 * mitigation steps, and closes with time-to-mitigate (ttmMs). Local scale only.
 *
 * Usage:
 *   node tools/alert-investigation-loop.js scan [--json]
 *   node tools/alert-investigation-loop.js open --source <id> [--json]
 *   node tools/alert-investigation-loop.js mitigate <investigationId> --step "<text>" [--json]
 *   node tools/alert-investigation-loop.js close <investigationId> [--outcome mitigated|false-alarm|deferred] [--json]
 *   node tools/alert-investigation-loop.js stats [--json]
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const LATEST_E2E = path.join(REPO, 'hermes-mobile/docs/proofs/continuous/latest.json');
const DEFAULT_STATE_DIR = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'mac-yolo-safeguards',
  'alert-investigations',
);
const BURN_STATE =
  process.env.HERMES_BURN_STATE_PATH ||
  path.join(os.homedir(), '.hermes', 'burn-alert-state.json');

function parseArgs(argv) {
  const args = {
    cmd: 'scan',
    json: false,
    source: '',
    id: '',
    step: '',
    outcome: 'mitigated',
    stateDir: process.env.ALERT_INVESTIGATION_DIR || DEFAULT_STATE_DIR,
    now: Date.now(),
  };
  const rest = [...argv];
  if (rest[0] && !rest[0].startsWith('-')) args.cmd = rest.shift();
  if (rest[0] && !rest[0].startsWith('-') && args.cmd !== 'scan' && args.cmd !== 'stats') {
    args.id = rest.shift();
  }
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === '--json') args.json = true;
    else if (a === '--source') args.source = rest[++i] || '';
    else if (a === '--step') args.step = rest[++i] || '';
    else if (a === '--outcome') args.outcome = rest[++i] || 'mitigated';
    else if (a === '--state-dir') args.stateDir = path.resolve(rest[++i] || '');
    else if (a === '--now') args.now = Number(rest[++i]) || args.now;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function receiptPath(stateDir, id) {
  return path.join(stateDir, `${id}.json`);
}

function scanAlerts(opts = {}) {
  const alerts = [];
  const latest = readJson(opts.latestPath || LATEST_E2E) || {};
  if (latest.e2e === 'fail') {
    alerts.push({
      id: 'continuous-e2e-fail',
      severity: 'high',
      title: 'Continuous E2E failed',
      detail: latest.detail || 'e2e=fail',
      updatedAt: latest.updatedAt || null,
      suggestedSteps: [
        'Read hermes-mobile/docs/proofs/continuous/latest.json',
        'launchctl kickstart -k gui/$(id -u)/com.igor.hermes-mobile-continuous-e2e',
        'Re-check e2e after run; never claim device UX while e2e≠pass',
      ],
    });
  }
  if (latest.e2e === 'skipped' && /fail|error|red/i.test(String(latest.detail || ''))) {
    alerts.push({
      id: 'continuous-e2e-skipped-suspicious',
      severity: 'medium',
      title: 'Continuous E2E skipped with suspicious detail',
      detail: latest.detail,
      updatedAt: latest.updatedAt || null,
      suggestedSteps: ['Inspect skip reason', 'Re-run when phone idle'],
    });
  }

  const burn = readJson(opts.burnStatePath || BURN_STATE);
  if (burn?.lastDegradedAt) {
    const age = (opts.now || Date.now()) - Number(burn.lastDegradedAt);
    if (Number.isFinite(age) && age < 6 * 3600 * 1000) {
      alerts.push({
        id: 'hermes-degraded-route',
        severity: 'high',
        title: 'Hermes GLM route recently degraded',
        detail: `lastDegradedAt=${new Date(Number(burn.lastDegradedAt)).toISOString()}`,
        updatedAt: new Date(Number(burn.lastDegradedAt)).toISOString(),
        suggestedSteps: [
          'Check ~/.hermes burn-alert + LiteLLM traffic',
          'Verify local Ollama / quota-independent route',
        ],
      });
    }
  }
  if (burn?.burnAlertedDay) {
    const today = new Date(opts.now || Date.now()).toISOString().slice(0, 10);
    if (burn.burnAlertedDay === today) {
      alerts.push({
        id: 'hermes-token-burn',
        severity: 'high',
        title: 'Token burn alert fired today',
        detail: `burnAlertedDay=${burn.burnAlertedDay}`,
        updatedAt: today,
        suggestedSteps: ['Pause high-token loops', 'Confirm daily token cap'],
      });
    }
  }

  return {
    checkedAt: new Date(opts.now || Date.now()).toISOString(),
    alertCount: alerts.length,
    alerts,
  };
}

function openInvestigation(alert, opts = {}) {
  const stateDir = opts.stateDir || DEFAULT_STATE_DIR;
  ensureDir(stateDir);
  const startedAt = new Date(opts.now || Date.now()).toISOString();
  const id = `inv-${(alert.id || 'alert').replace(/[^a-z0-9-]/gi, '-')}-${Date.parse(startedAt)}`;
  const receipt = {
    schema: 'alert-investigation/v1',
    id,
    source: alert.id,
    title: alert.title,
    severity: alert.severity || 'medium',
    status: 'open',
    startedAt,
    mitigatedAt: null,
    ttmMs: null,
    outcome: null,
    steps: (alert.suggestedSteps || []).map((text, i) => ({
      at: startedAt,
      index: i,
      text,
      done: false,
    })),
    detail: alert.detail || null,
  };
  fs.writeFileSync(receiptPath(stateDir, id), JSON.stringify(receipt, null, 2));
  return receipt;
}

function loadInvestigation(stateDir, id) {
  const file = receiptPath(stateDir, id);
  const receipt = readJson(file);
  if (!receipt) throw new Error(`investigation not found: ${id}`);
  return { file, receipt };
}

function mitigateStep(stateDir, id, stepText, opts = {}) {
  const { file, receipt } = loadInvestigation(stateDir, id);
  if (receipt.status !== 'open') {
    throw new Error(`investigation ${id} is ${receipt.status}, cannot mitigate`);
  }
  const at = new Date(opts.now || Date.now()).toISOString();
  receipt.steps.push({
    at,
    index: receipt.steps.length,
    text: String(stepText || '').trim(),
    done: true,
  });
  // Mark first matching suggested step done
  const needle = String(stepText || '').toLowerCase();
  for (const s of receipt.steps) {
    if (!s.done && needle && String(s.text).toLowerCase().includes(needle.slice(0, 24))) {
      s.done = true;
      break;
    }
  }
  fs.writeFileSync(file, JSON.stringify(receipt, null, 2));
  return receipt;
}

function closeInvestigation(stateDir, id, outcome, opts = {}) {
  const { file, receipt } = loadInvestigation(stateDir, id);
  if (receipt.status !== 'open') {
    throw new Error(`investigation ${id} already ${receipt.status}`);
  }
  const mitigatedAtMs = opts.now || Date.now();
  const startedMs = Date.parse(receipt.startedAt);
  receipt.status = 'closed';
  receipt.outcome = outcome || 'mitigated';
  receipt.mitigatedAt = new Date(mitigatedAtMs).toISOString();
  receipt.ttmMs = Number.isFinite(startedMs) ? Math.max(0, mitigatedAtMs - startedMs) : null;
  fs.writeFileSync(file, JSON.stringify(receipt, null, 2));
  return receipt;
}

function listReceipts(stateDir) {
  if (!fs.existsSync(stateDir)) return [];
  return fs
    .readdirSync(stateDir)
    .filter((n) => n.endsWith('.json'))
    .map((n) => readJson(path.join(stateDir, n)))
    .filter(Boolean);
}

function stats(stateDir) {
  const receipts = listReceipts(stateDir);
  const closed = receipts.filter((r) => r.status === 'closed' && r.ttmMs != null);
  const ttms = closed.map((r) => r.ttmMs).sort((a, b) => a - b);
  const avg = ttms.length
    ? Math.round(ttms.reduce((s, n) => s + n, 0) / ttms.length)
    : null;
  const p50 = ttms.length ? ttms[Math.floor(ttms.length * 0.5)] : null;
  return {
    checkedAt: new Date().toISOString(),
    open: receipts.filter((r) => r.status === 'open').length,
    closed: closed.length,
    avgTtmMs: avg,
    p50TtmMs: p50,
    sampleSize: ttms.length,
  };
}

function maybeKickContinuousE2e() {
  const uid = process.getuid?.() ?? 0;
  const label = `gui/${uid}/com.igor.hermes-mobile-continuous-e2e`;
  const result = spawnSync('launchctl', ['kickstart', '-k', label], {
    encoding: 'utf8',
    timeout: 15_000,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stderr: (result.stderr || '').trim().slice(0, 200),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage:
  node tools/alert-investigation-loop.js scan [--json]
  node tools/alert-investigation-loop.js open --source <alertId> [--json]
  node tools/alert-investigation-loop.js mitigate <id> --step "..." [--json]
  node tools/alert-investigation-loop.js close <id> [--outcome mitigated] [--json]
  node tools/alert-investigation-loop.js stats [--json]`);
    process.exit(0);
  }

  if (args.cmd === 'scan') {
    const result = scanAlerts({ now: args.now });
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`alert-scan: ${result.alertCount} alert(s)`);
      for (const a of result.alerts) {
        console.log(`  [${a.severity}] ${a.id}: ${a.title}`);
      }
    }
    process.exit(0);
  }

  if (args.cmd === 'open') {
    const scan = scanAlerts({ now: args.now });
    const alert =
      scan.alerts.find((a) => a.id === args.source) ||
      (args.source
        ? {
            id: args.source,
            title: `Manual investigation: ${args.source}`,
            severity: 'medium',
            detail: 'manual',
            suggestedSteps: ['Diagnose', 'Mitigate', 'Capture RAG lesson'],
          }
        : null);
    if (!alert) {
      console.error('No alert to open. Pass --source <id> from scan, or invent a source id.');
      process.exit(1);
    }
    const receipt = openInvestigation(alert, { stateDir: args.stateDir, now: args.now });
    if (alert.id === 'continuous-e2e-fail') {
      const kick = maybeKickContinuousE2e();
      receipt.autoKick = kick;
      fs.writeFileSync(
        receiptPath(args.stateDir, receipt.id),
        JSON.stringify(receipt, null, 2),
      );
    }
    if (args.json) console.log(JSON.stringify(receipt, null, 2));
    else console.log(`opened ${receipt.id} source=${receipt.source}`);
    process.exit(0);
  }

  if (args.cmd === 'mitigate') {
    if (!args.id || !args.step) {
      console.error('mitigate requires <id> and --step');
      process.exit(1);
    }
    const receipt = mitigateStep(args.stateDir, args.id, args.step, { now: args.now });
    if (args.json) console.log(JSON.stringify(receipt, null, 2));
    else console.log(`mitigated step on ${receipt.id} (steps=${receipt.steps.length})`);
    process.exit(0);
  }

  if (args.cmd === 'close') {
    if (!args.id) {
      console.error('close requires <id>');
      process.exit(1);
    }
    const receipt = closeInvestigation(args.stateDir, args.id, args.outcome, {
      now: args.now,
    });
    if (args.json) console.log(JSON.stringify(receipt, null, 2));
    else {
      console.log(
        `closed ${receipt.id} outcome=${receipt.outcome} ttmMs=${receipt.ttmMs}` +
          (receipt.ttmMs != null
            ? ` (${Math.round(receipt.ttmMs / 1000)}s)`
            : ''),
      );
    }
    process.exit(0);
  }

  if (args.cmd === 'stats') {
    const s = stats(args.stateDir);
    if (args.json) console.log(JSON.stringify(s, null, 2));
    else {
      console.log(
        `alert-stats open=${s.open} closed=${s.closed} avgTtmMs=${s.avgTtmMs} p50TtmMs=${s.p50TtmMs}`,
      );
    }
    process.exit(0);
  }

  console.error(`Unknown command: ${args.cmd}`);
  process.exit(1);
}

module.exports = {
  scanAlerts,
  openInvestigation,
  mitigateStep,
  closeInvestigation,
  stats,
};

if (require.main === module) {
  main();
}
