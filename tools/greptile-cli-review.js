#!/usr/bin/env node
'use strict';

/**
 * Greptile CLI review harness (token-free receipts).
 *
 * Takes advantage of Greptile when GitHub PR free credits are exhausted:
 * the dashboard "CLI Credits" pool is separate from Code Review credits.
 *
 * Never stores redeem tokens, API keys, or full card numbers.
 *
 * Usage:
 *   node tools/greptile-cli-review.js [--json] [--base main] [--instructions "..."]
 *   node tools/greptile-cli-review.js --status
 *   node tools/greptile-cli-review.js --doctor
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCHEMA = 'greptile-cli-review/v1';

function homeDir(env = process.env) {
  return env.HOME || os.homedir();
}

function locations(env = process.env) {
  const home = homeDir(env);
  const dir = path.join(home, '.hermes', 'receipts', 'greptile-cli');
  return {
    receiptDir: dir,
    latest: path.join(dir, 'latest.json'),
  };
}

function findGreptile(env = process.env) {
  const candidates = [
    env.GREPTILE_BIN,
    path.join(homeDir(env), '.npm-global', 'bin', 'greptile'),
    '/opt/homebrew/bin/greptile',
    '/usr/local/bin/greptile',
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  const which = spawnSync('which', ['greptile'], { encoding: 'utf8' });
  if (which.status === 0 && which.stdout.trim()) return which.stdout.trim();
  return null;
}

function redact(text) {
  let t = String(text || '');
  t = t.replace(/token=[A-Za-z0-9._~-]{8,}/gi, 'token=REDACTED');
  t = t.replace(/\b(sk|xai|ghp|gho|github_pat)[-_][A-Za-z0-9_-]{12,}\b/g, '[REDACTED]');
  t = t.replace(/\b\d{13,19}\b/g, '[REDACTED_NUM]');
  return t;
}

function writeReceipt(payload) {
  const locs = locations();
  fs.mkdirSync(locs.receiptDir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(locs.receiptDir, `${stamp}.json`);
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  fs.writeFileSync(file, body, { mode: 0o600 });
  fs.writeFileSync(locs.latest, body, { mode: 0o600 });
  return { file, latest: locs.latest };
}

function runGreptile(binary, args, options = {}) {
  return spawnSync(binary, args, {
    encoding: 'utf8',
    cwd: options.cwd || process.cwd(),
    env: process.env,
    timeout: options.timeoutMs || 600000,
    maxBuffer: 8 * 1024 * 1024,
  });
}

function doctor() {
  const binary = findGreptile();
  if (!binary) {
    return {
      schema: SCHEMA,
      ready: false,
      blocker: 'greptile_cli_missing',
      hint: 'npm i -g greptile  (or restore ~/.npm-global/bin/greptile)',
    };
  }
  const who = runGreptile(binary, ['whoami'], { timeoutMs: 30000 });
  const version = runGreptile(binary, ['--version'], { timeoutMs: 10000 });
  const whoOut = redact(`${who.stdout || ''}${who.stderr || ''}`).trim();
  const signedIn = who.status === 0 && /signed in|@|organizations/i.test(whoOut);
  return {
    schema: SCHEMA,
    ready: Boolean(binary) && signedIn,
    binary,
    version: redact((version.stdout || version.stderr || '').trim()),
    whoami: whoOut.slice(0, 500),
    signedIn,
    blocker: signedIn ? null : 'not_signed_in_run_greptile_login',
    notes: [
      'Web Code Review free credits (50/mo) are separate from CLI Credits.',
      'When dashboard shows Limit reached, prefer greptile-cli-review for branch review.',
      'OSS Maintainer discount is already redeemed on org Hermes Mobile — Pro upgrade needs explicit human ask (may charge card unless discount line is $0).',
      'Never store greptile redeem tokens in git.',
    ],
  };
}

function review(options = {}) {
  const binary = findGreptile();
  if (!binary) {
    const d = doctor();
    return { ok: false, doctor: d };
  }
  const args = ['review', '--agent'];
  if (options.json) args.push('--json');
  if (options.base) {
    args.push('--branch', options.base);
  }
  if (options.instructions) {
    args.push('--instructions', options.instructions);
  }
  if (options.resume) args.push('--resume');

  const started = Date.now();
  const result = runGreptile(binary, args, { cwd: options.cwd });
  const durationMs = Date.now() - started;
  const stdout = redact(result.stdout || '');
  const stderr = redact(result.stderr || '');
  const payload = {
    schema: SCHEMA,
    action: 'review',
    at: new Date().toISOString(),
    hostname: os.hostname(),
    cwd: options.cwd || process.cwd(),
    base: options.base || null,
    exitCode: result.status,
    durationMs,
    ok: result.status === 0,
    stdoutTail: stdout.slice(-6000),
    stderrTail: stderr.slice(-2000),
    // no secrets / no full token URLs
  };
  const receipt = writeReceipt(payload);
  return { ok: payload.ok, payload, receipt };
}

function parseArgs(argv = process.argv.slice(2)) {
  const opts = {
    doctor: false,
    status: false,
    json: false,
    resume: false,
    base: null,
    instructions: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--doctor' || a === 'doctor') opts.doctor = true;
    else if (a === '--status' || a === 'status') opts.status = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--resume') opts.resume = true;
    else if (a === '--base' || a === '-b') {
      opts.base = argv[++i];
    } else if (a === '--instructions') {
      opts.instructions = argv[++i];
    } else if (a === '-h' || a === '--help') opts.help = true;
  }
  return opts;
}

function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  if (opts.help) {
    console.log(`Usage:
  node tools/greptile-cli-review.js --doctor
  node tools/greptile-cli-review.js --status
  node tools/greptile-cli-review.js [--base main] [--instructions "..."] [--json]
`);
    return 0;
  }
  if (opts.doctor) {
    const d = doctor();
    console.log(opts.json || true ? JSON.stringify(d, null, 2) : d);
    return d.ready ? 0 : 2;
  }
  if (opts.status) {
    const locs = locations();
    if (!fs.existsSync(locs.latest)) {
      console.log(JSON.stringify({ schema: SCHEMA, status: 'no_receipts' }, null, 2));
      return 1;
    }
    console.log(fs.readFileSync(locs.latest, 'utf8'));
    return 0;
  }
  const defaultInstructions = [
    'Prioritize secrets, force-push/rm-rf safety, multi-Mac key consistency,',
    'false ship claims, and paid-route / local-route billing mistakes.',
    'Ignore pure style. Do not print API keys or discount redeem tokens.',
  ].join(' ');
  const result = review({
    json: opts.json,
    base: opts.base || 'main',
    instructions: opts.instructions || defaultInstructions,
    resume: opts.resume,
  });
  if (opts.json) {
    console.log(JSON.stringify({ ok: result.ok, receipt: result.receipt, exitCode: result.payload && result.payload.exitCode }, null, 2));
  } else if (result.payload) {
    process.stdout.write(result.payload.stdoutTail || '');
    if (result.payload.stderrTail) process.stderr.write(result.payload.stderrTail);
    if (result.receipt) console.error(`\n[greptile-cli-review] receipt: ${result.receipt.latest}`);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
  return result.ok ? 0 : 2;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  SCHEMA,
  doctor,
  review,
  parseArgs,
  redact,
  main,
};
