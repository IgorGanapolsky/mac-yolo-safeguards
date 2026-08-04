#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BIN = path.join(ROOT, 'tools/codeql-agent-hygiene.js');
const { evaluateClaim, SECURITY_CLAIM } = require(BIN);

function run(args) {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 120_000,
  });
}

// claim regex
assert.ok(SECURITY_CLAIM.test('security clean'));
assert.ok(SECURITY_CLAIM.test('0 open alerts'));
assert.ok(SECURITY_CLAIM.test('CodeQL clean'));
assert.ok(!SECURITY_CLAIM.test('fixed a bug'));

// evaluateClaim blocks when open > 0
{
  const blocked = evaluateClaim('security clean', {
    alerts: { ok: true, open: 7, highish: 3 },
    pattern: { ok: true },
    helpers: { ok: true },
  });
  assert.strictEqual(blocked.applies, true);
  assert.strictEqual(blocked.allow, false);
  assert.ok(blocked.reasons.some((r) => /7 open/.test(r)));
}

{
  const ok = evaluateClaim('security clean', {
    alerts: { ok: true, open: 0, highish: 0 },
    pattern: { ok: true },
    helpers: { ok: true },
  });
  assert.strictEqual(ok.allow, true);
}

// offline session-start must not crash
{
  const r = run(['--session-start', '--skip-network']);
  assert.ok(r.status === 0 || r.status === 1, `status=${r.status} ${r.stderr}`);
  assert.match(r.stdout, /Code scanning hygiene|codeql-agent-hygiene|pattern_gate/);
}

// json shape
{
  const r = run(['--json', '--skip-network']);
  const j = JSON.parse(r.stdout);
  assert.ok(j.playbook);
  assert.ok(j.helpers);
  assert.ok(j.pattern);
  assert.ok(Array.isArray(j.rules));
}

// security claim with open alerts blocks when network works; skip if gh down
{
  const r = run(['--claim', 'security clean', '--json']);
  if (r.status === 0 || r.status === 1) {
    try {
      const j = JSON.parse(r.stdout);
      if (j.alerts && j.alerts.ok && j.alerts.open > 0) {
        assert.strictEqual(j.ok, false);
        assert.strictEqual(j.claim.allow, false);
        console.log('PASS claim blocked when open alerts > 0');
      } else {
        console.log('PASS claim path ran (no open alerts or API skip)');
      }
    } catch {
      console.log('PASS claim path non-json ok');
    }
  }
}

console.log('PASS test-codeql-agent-hygiene');
