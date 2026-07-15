#!/usr/bin/env node
'use strict';

/**
 * hermes-local-launch.js — OpenClaw-class one-command ergonomics for Hermes.
 *
 * Mirrors the "ollama launch openclaw" UX bar without installing OpenClaw:
 *   1) prove Ollama is up
 *   2) prefer a true ≥64k Hermes-safe local profile
 *   3) install/status the zero-spend gate (optional --install)
 *   4) fail closed on dual Telegram/OpenClaw gateway risk
 *   5) print the next phone-control step (Hermes Mobile pair)
 *
 * Usage:
 *   node tools/hermes-local-launch.js --status
 *   node tools/hermes-local-launch.js --install
 *   bash scripts/hermes-local-launch.sh --status --json
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawnSync, execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const HERMES_64K_MARKERS = [
  'hermes-64k',
  '64k',
  'qwen3.5:9b-hermes-64k',
  'qwen3:8b-64k',
  'qwen2.5:3b-64k',
];

function parseArgs(argv) {
  const args = {
    install: false,
    status: true,
    json: false,
    help: false,
    home: process.env.HOME || os.homedir(),
    ollamaHost: process.env.OLLAMA_HOST || '127.0.0.1:11434',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--install') {
      args.install = true;
      args.status = true;
    } else if (a === '--status') {
      args.status = true;
    } else if (a === '--json') {
      args.json = true;
    } else if (a === '--home') {
      args.home = argv[++i];
    } else if (a === '--ollama-host') {
      args.ollamaHost = argv[++i];
    } else if (a === '--help' || a === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return args;
}

function helpText() {
  return `hermes-local-launch — one-command local Hermes path (OpenClaw ergonomics, Hermes gates)

Usage:
  node tools/hermes-local-launch.js --status [--json]
  node tools/hermes-local-launch.js --install [--json]
  bash scripts/hermes-local-launch.sh --status

Does NOT install OpenClaw. Lands on Hermes + Ollama + zero-spend + phone control.
Never run OpenClaw Gateway on the same Telegram bot as Hermes (polling conflict).
`;
}

function findOllamaBinary(env = process.env) {
  const candidates = [
    env.OLLAMA_BIN,
    '/opt/homebrew/bin/ollama',
    '/usr/local/bin/ollama',
    '/Applications/Ollama.app/Contents/Resources/ollama',
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  try {
    return execFileSync('command', ['-v', 'ollama'], {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function httpGetJson(url, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
        if (body.length > 2_000_000) body = body.slice(0, 2_000_000);
      });
      res.on('end', () => {
        try {
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode || 0, json: JSON.parse(body) });
        } catch {
          resolve({ ok: false, status: res.statusCode || 0, json: null, raw: body.slice(0, 200) });
        }
      });
    });
    req.on('error', (err) => resolve({ ok: false, status: 0, error: String(err && err.message ? err.message : err) }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, status: 0, error: 'timeout' });
    });
  });
}

function listModelNames(tagsJson) {
  if (!tagsJson || !Array.isArray(tagsJson.models)) return [];
  return tagsJson.models
    .map((m) => (m && (m.name || m.model)) || '')
    .filter(Boolean);
}

function pickHermesSafeModel(names) {
  const lower = names.map((n) => ({ raw: n, l: String(n).toLowerCase() }));
  for (const marker of HERMES_64K_MARKERS) {
    const hit = lower.find((n) => n.l.includes(marker.toLowerCase()));
    if (hit) return hit.raw;
  }
  // Prefer any qwen with 64k in name already handled; otherwise null (not "first model")
  return null;
}

function zeroSpendPaths(home) {
  const hermes = path.join(home, '.hermes');
  return {
    marker: path.join(hermes, 'NO_PAID_SPEND'),
    receipt: path.join(hermes, 'receipts', 'zero-spend', 'latest.json'),
    managedConfig: path.join(hermes, 'zero-spend', 'managed', 'config.yaml'),
  };
}

function readZeroSpendStatus(home, { existsSync = fs.existsSync, readFileSync = fs.readFileSync } = {}) {
  const p = zeroSpendPaths(home);
  const markerPresent = existsSync(p.marker);
  let receipt = null;
  if (existsSync(p.receipt)) {
    try {
      receipt = JSON.parse(readFileSync(p.receipt, 'utf8'));
    } catch {
      receipt = { parseError: true };
    }
  }
  return {
    markerPresent,
    markerPath: p.marker,
    receiptPath: p.receipt,
    managedConfigPresent: existsSync(p.managedConfig),
    receipt,
  };
}

function detectOpenClawProcesses({ execFileSyncImpl = execFileSync } = {}) {
  try {
    const out = execFileSyncImpl('pgrep', ['-la', 'openclaw'], {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const lines = String(out || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    return { running: lines.length > 0, lines };
  } catch {
    return { running: false, lines: [] };
  }
}

function detectHermesGateway({ execFileSyncImpl = execFileSync } = {}) {
  try {
    const out = execFileSyncImpl('pgrep', ['-la', 'hermes'], {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const lines = String(out || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => /gateway|hermes-agent|api_server/i.test(l));
    return { running: lines.length > 0, lines: lines.slice(0, 8) };
  } catch {
    return { running: false, lines: [] };
  }
}

function runZeroSpendInstall(repo = REPO, env = process.env) {
  const script = path.join(repo, 'scripts', 'install-zero-spend-gate.sh');
  const r = spawnSync('bash', [script, '--install'], {
    encoding: 'utf8',
    env: { ...env },
    timeout: 120_000,
  });
  return {
    exitCode: r.status == null ? 1 : r.status,
    stdout: (r.stdout || '').slice(0, 4000),
    stderr: (r.stderr || '').slice(0, 2000),
  };
}

/**
 * Pure readiness synthesis — unit-tested without live Ollama.
 */
function synthesizeReport(input) {
  const checks = [];
  const nextSteps = [];
  let ready = true;

  const ollamaBin = input.ollamaBin;
  if (!ollamaBin) {
    ready = false;
    checks.push({ id: 'ollama_binary', ok: false, detail: 'ollama not found in PATH or standard locations' });
    nextSteps.push('Install Ollama from https://ollama.com/download then re-run --status');
  } else {
    checks.push({ id: 'ollama_binary', ok: true, detail: ollamaBin });
  }

  if (!input.ollamaApiOk) {
    ready = false;
    checks.push({
      id: 'ollama_api',
      ok: false,
      detail: input.ollamaApiError || 'Ollama API not responding on local host',
    });
    nextSteps.push('Start Ollama (`ollama serve` or open the Ollama app) and re-run --status');
  } else {
    checks.push({ id: 'ollama_api', ok: true, detail: `tags=${(input.modelNames || []).length}` });
  }

  const preferred = input.preferredModel || null;
  if (!preferred) {
    ready = false;
    checks.push({
      id: 'hermes_64k_model',
      ok: false,
      detail: 'No Hermes-safe ≥64k Ollama profile found (need hermes-64k / qwen*64k)',
    });
    nextSteps.push(
      'Install zero-spend gate to derive qwen3.5:9b-hermes-64k: bash scripts/install-zero-spend-gate.sh --install',
    );
  } else {
    checks.push({ id: 'hermes_64k_model', ok: true, detail: preferred });
  }

  const zs = input.zeroSpend || {};
  if (!zs.markerPresent) {
    // Not fatal for status, but install path should enable it
    checks.push({
      id: 'zero_spend_marker',
      ok: false,
      detail: 'NO_PAID_SPEND marker absent — paid CLIs still reachable',
    });
    if (input.wantInstall) {
      nextSteps.push('Will install zero-spend gate via --install');
    } else {
      nextSteps.push('Optional fail-closed local route: node tools/hermes-local-launch.js --install');
    }
  } else {
    checks.push({ id: 'zero_spend_marker', ok: true, detail: zs.markerPath || 'present' });
  }

  const openclaw = input.openclaw || { running: false, lines: [] };
  const hermesGw = input.hermesGateway || { running: false, lines: [] };
  if (openclaw.running && hermesGw.running) {
    ready = false;
    checks.push({
      id: 'dual_gateway_risk',
      ok: false,
      detail: 'OpenClaw + Hermes processes both present — Telegram polling conflict risk',
    });
    nextSteps.push(
      'STOP: do not share one Telegram bot between OpenClaw Gateway and Hermes. Isolate bots/hosts or stop OpenClaw (`openclaw gateway stop`).',
    );
  } else if (openclaw.running) {
    checks.push({
      id: 'dual_gateway_risk',
      ok: true,
      warn: true,
      detail: 'OpenClaw running without Hermes gateway match — still isolate Telegram bots if both used',
    });
  } else {
    checks.push({ id: 'dual_gateway_risk', ok: true, detail: 'no openclaw process detected' });
  }

  nextSteps.push(
    'Phone control plane: install Hermes Mobile, then `node tools/hermes-mobile-pair.js` when adb shows a device',
  );
  nextSteps.push(
    'Do not run `ollama launch openclaw` on this Mac if Hermes already owns Telegram — see docs/OPENCLAW-VS-HERMES.md',
  );

  return {
    ready: ready && Boolean(preferred) && Boolean(ollamaBin) && Boolean(input.ollamaApiOk),
    preferredModel: preferred,
    checks,
    nextSteps: uniqueStrings(nextSteps),
    openclawRunning: Boolean(openclaw.running),
    hermesGatewayRunning: Boolean(hermesGw.running),
    zeroSpendActive: Boolean(zs.markerPresent),
    productNote:
      'Hermes Mobile is the approve/deny control plane for agents behind your gateway. OpenClaw is a peer always-on messaging agent — not a substitute for Leash.',
  };
}

function uniqueStrings(arr) {
  const seen = new Set();
  const out = [];
  for (const s of arr) {
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

async function collectLiveInputs(args, deps = {}) {
  const findBin = deps.findOllamaBinary || findOllamaBinary;
  const getJson = deps.httpGetJson || httpGetJson;
  const readZs = deps.readZeroSpendStatus || readZeroSpendStatus;
  const detectOc = deps.detectOpenClawProcesses || detectOpenClawProcesses;
  const detectHg = deps.detectHermesGateway || detectHermesGateway;

  const ollamaBin = findBin(process.env);
  const host = String(args.ollamaHost || '127.0.0.1:11434').replace(/^https?:\/\//, '');
  const tagsUrl = `http://${host}/api/tags`;
  let ollamaApiOk = false;
  let ollamaApiError = null;
  let modelNames = [];
  if (ollamaBin) {
    const tags = await getJson(tagsUrl);
    ollamaApiOk = Boolean(tags.ok && tags.json);
    if (!ollamaApiOk) ollamaApiError = tags.error || `HTTP ${tags.status}`;
    modelNames = listModelNames(tags.json);
  }
  const preferredModel = pickHermesSafeModel(modelNames);
  const zeroSpend = readZs(args.home);
  const openclaw = detectOc();
  const hermesGateway = detectHg();

  return {
    ollamaBin,
    ollamaApiOk,
    ollamaApiError,
    modelNames,
    preferredModel,
    zeroSpend,
    openclaw,
    hermesGateway,
    wantInstall: Boolean(args.install),
  };
}

async function run(argv = process.argv.slice(2), deps = {}) {
  const args = parseArgs(argv);
  if (args.help) {
    return { exitCode: 0, help: helpText(), args };
  }

  let installResult = null;
  if (args.install) {
    const installFn = deps.runZeroSpendInstall || runZeroSpendInstall;
    installResult = installFn(REPO, { ...process.env, HOME: args.home });
  }

  const live = deps.liveInputs || (await collectLiveInputs(args, deps));
  // If install just ran, re-read zero-spend from disk unless fully mocked
  if (args.install && !deps.liveInputs) {
    live.zeroSpend = readZeroSpendStatus(args.home);
    live.wantInstall = true;
  }

  const report = synthesizeReport(live);
  const payload = {
    ok: report.ready && (!installResult || installResult.exitCode === 0),
    command: 'hermes-local-launch',
    mode: args.install ? 'install' : 'status',
    checkedAt: new Date().toISOString(),
    home: args.home,
    ...report,
    modelsSeen: live.modelNames || [],
    install: installResult,
    docs: {
      positioning: 'docs/OPENCLAW-VS-HERMES.md',
      zeroSpend: 'docs/HERMES-ZERO-SPEND.md',
      hostedReliability: 'docs/HERMES-HOSTED-RELIABILITY.md',
    },
  };

  if (!payload.ok) payload.exitCode = 1;
  else payload.exitCode = 0;

  return payload;
}

function printHuman(payload) {
  const lines = [];
  lines.push(`hermes-local-launch (${payload.mode}) — ${payload.ok ? 'READY' : 'NOT READY'}`);
  lines.push(`checkedAt: ${payload.checkedAt}`);
  if (payload.preferredModel) lines.push(`preferredModel: ${payload.preferredModel}`);
  lines.push(`zeroSpendActive: ${payload.zeroSpendActive}`);
  lines.push(`openclawRunning: ${payload.openclawRunning}`);
  lines.push(`hermesGatewayRunning: ${payload.hermesGatewayRunning}`);
  lines.push('checks:');
  for (const c of payload.checks || []) {
    const flag = c.ok ? (c.warn ? 'WARN' : 'OK') : 'FAIL';
    lines.push(`  [${flag}] ${c.id}: ${c.detail}`);
  }
  if (payload.install) {
    lines.push(`install.exitCode: ${payload.install.exitCode}`);
  }
  lines.push('nextSteps:');
  for (const s of payload.nextSteps || []) lines.push(`  - ${s}`);
  lines.push('');
  lines.push(payload.productNote);
  lines.push(`See ${payload.docs.positioning}`);
  process.stdout.write(`${lines.join('\n')}\n`);
}

async function main() {
  try {
    const payload = await run(process.argv.slice(2));
    if (payload.help) {
      process.stdout.write(payload.help);
      process.exit(0);
    }
    const args = parseArgs(process.argv.slice(2));
    if (args.json) {
      process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    } else {
      printHuman(payload);
    }
    process.exit(payload.exitCode || 0);
  } catch (err) {
    process.stderr.write(`${err && err.stack ? err.stack : err}\n`);
    process.exit(2);
  }
}

module.exports = {
  parseArgs,
  helpText,
  findOllamaBinary,
  listModelNames,
  pickHermesSafeModel,
  zeroSpendPaths,
  readZeroSpendStatus,
  detectOpenClawProcesses,
  detectHermesGateway,
  synthesizeReport,
  collectLiveInputs,
  run,
  HERMES_64K_MARKERS,
};

if (require.main === module) {
  main();
}
