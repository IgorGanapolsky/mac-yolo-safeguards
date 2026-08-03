#!/usr/bin/env node
'use strict';

/**
 * independent-verifier.js — Dual-witness runner inspired by OpenAI ten-proofs
 * (construction + independent formal check) and walkthrough "positive dual witness".
 *
 * Runs TWO commands:
 *   A) construction / primary check
 *   B) independent verifier (must not be a trivial copy of A)
 *
 * Both must exit 0. Optionally enforces that stdout fingerprints differ
 * (catches "false green" where both commands are the same echo).
 *
 * Usage:
 *   node tools/independent-verifier.js \
 *     --a "node tools/deterministic-count.js --self-test" \
 *     --b "node tools/ship-claim-gate.js --self-test" \
 *     [--json]
 *   node tools/independent-verifier.js --self-test
 */

const { spawnSync } = require('child_process');
const crypto = require('crypto');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function run(cmd, timeoutMs = 120_000) {
  const r = spawnSync('bash', ['-lc', cmd], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 4 * 1024 * 1024,
  });
  const stdout = r.stdout || '';
  const stderr = r.stderr || '';
  return {
    cmd,
    ok: r.status === 0,
    status: r.status,
    stdout: stdout.slice(0, 4000),
    stderr: stderr.slice(0, 2000),
    fingerprint: crypto.createHash('sha256').update(stdout + '\0' + stderr).digest('hex').slice(0, 16),
  };
}

function commandsAreTrivialCopy(a, b) {
  const na = String(a || '').replace(/\s+/g, ' ').trim();
  const nb = String(b || '').replace(/\s+/g, ' ').trim();
  if (!na || !nb) return true;
  if (na === nb) return true;
  // same script path both sides only
  const strip = (s) => s.replace(/node\s+/g, '').replace(/["']/g, '');
  return strip(na) === strip(nb);
}

function verifyPair({ a, b, requireDistinctOutput = false, timeoutMs = 120_000 }) {
  const errors = [];
  if (!a || !b) errors.push('both --a and --b commands required');
  if (commandsAreTrivialCopy(a, b)) {
    errors.push('A and B must be independent commands (not the same string)');
  }
  if (errors.length) {
    return { ok: false, errors, a: null, b: null };
  }
  const ra = run(a, timeoutMs);
  const rb = run(b, timeoutMs);
  if (!ra.ok) errors.push(`A failed exit=${ra.status}: ${a}`);
  if (!rb.ok) errors.push(`B failed exit=${rb.status}: ${b}`);
  if (requireDistinctOutput && ra.ok && rb.ok && ra.fingerprint === rb.fingerprint) {
    errors.push('A and B produced identical output fingerprints — suspicious dual witness');
  }
  return {
    ok: errors.length === 0,
    errors,
    a: ra,
    b: rb,
    pattern: 'construction + independent verifier (ten-proofs / dual witness)',
  };
}

function selfTest() {
  const assert = require('assert');
  const bad = verifyPair({ a: 'true', b: 'true' });
  assert.strictEqual(bad.ok, false);
  const good = verifyPair({
    a: 'node tools/deterministic-count.js --self-test',
    b: 'node tools/reasoning-proof-ladder.js --self-test',
  });
  assert.strictEqual(good.ok, true, JSON.stringify(good.errors));
  console.log('PASS independent-verifier self-test');
}

function parseArgs(argv) {
  const out = { a: '', b: '', json: false, selfTest: false, help: false, distinct: false };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--a') out.a = argv[++i];
    else if (x === '--b') out.b = argv[++i];
    else if (x === '--json') out.json = true;
    else if (x === '--self-test') out.selfTest = true;
    else if (x === '--require-distinct-output') out.distinct = true;
    else if (x === '--help' || x === '-h') out.help = true;
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('independent-verifier --a "cmd" --b "cmd2" [--require-distinct-output] [--json]');
    process.exit(0);
  }
  if (args.selfTest) {
    selfTest();
    process.exit(0);
  }
  const r = verifyPair({
    a: args.a,
    b: args.b,
    requireDistinctOutput: args.distinct,
  });
  if (args.json) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(r.ok ? 'PASS dual-witness' : 'FAIL dual-witness');
    for (const e of r.errors) console.log('  ERROR:', e);
    if (r.a) console.log(`  A exit=${r.a.status} fp=${r.a.fingerprint}`);
    if (r.b) console.log(`  B exit=${r.b.status} fp=${r.b.fingerprint}`);
  }
  process.exit(r.ok ? 0 : 1);
}

module.exports = { verifyPair, run, commandsAreTrivialCopy };

if (require.main === module) main();
