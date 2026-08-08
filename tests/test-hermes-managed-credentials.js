#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  listCredentials,
  registerCredential,
  vendCredential,
  rotateCredential,
  BUILTIN_CATALOG,
} = require('../tools/hermes-managed-credentials');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}`);
    console.error(err.stack || err.message);
    process.exitCode = 1;
  }
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-cred-'));
const registryPath = path.join(tmpDir, 'managed-credentials.json');

test('builtin catalog includes litellm and workos labels only', () => {
  assert.ok(BUILTIN_CATALOG.some((c) => c.id === 'litellm_gateway'));
  assert.ok(BUILTIN_CATALOG.some((c) => c.id === 'workos_prod'));
  for (const c of BUILTIN_CATALOG) {
    assert.ok(!('secret' in c));
    assert.ok(!('apiKey' in c));
  }
});

test('list merges builtins', () => {
  const list = listCredentials({ registryPath });
  assert.ok(list.length >= BUILTIN_CATALOG.length);
});

test('register + vend never returns secret fields', () => {
  const reg = registerCredential(
    {
      id: 'test_provider',
      type: 'api_key',
      service: 'example.test',
      account: 'ci',
      envVar: 'TEST_PROVIDER_KEY',
    },
    { registryPath },
  );
  assert.strictEqual(reg.ok, true);
  const vend = vendCredential('test_provider', { registryPath });
  assert.strictEqual(vend.ok, true);
  assert.strictEqual(vend.credential.type, 'api_key');
  assert.ok(vend.credential.handleId.startsWith('cred_'));
  assert.strictEqual(vend.credential.retrieval.keychainService, 'example.test');
  const raw = JSON.stringify(vend);
  assert.doesNotMatch(raw, /sk-|password|secret_value/i);
});

test('never-spend blocks purchase-shaped register', () => {
  const bad = registerCredential(
    {
      id: 'evil',
      type: 'api_key',
      service: 'x',
      account: 'y',
      description: 'buy credits upgrade plan',
    },
    { registryPath },
  );
  assert.strictEqual(bad.ok, false);
  assert.strictEqual(bad.error, 'never_spend');
});

test('rotate is idempotent within window', () => {
  registerCredential(
    { id: 'rot_me', type: 'api_key', service: 'r', account: 'a' },
    { registryPath },
  );
  const first = rotateCredential('rot_me', { registryPath, intent: 'ci' });
  assert.strictEqual(first.ok, true);
  assert.strictEqual(first.idempotent, false);
  const second = rotateCredential('rot_me', { registryPath, intent: 'ci' });
  assert.strictEqual(second.ok, true);
  assert.strictEqual(second.idempotent, true);
  assert.strictEqual(second.rotation.generation, first.rotation.generation);
});

test('vend missing id fails closed', () => {
  const v = vendCredential('no_such_provider_xyz', { registryPath });
  assert.strictEqual(v.ok, false);
  assert.strictEqual(v.error, 'not_found');
});

test('registry file has mode secrets-safe content', () => {
  assert.ok(fs.existsSync(registryPath));
  const body = fs.readFileSync(registryPath, 'utf8');
  assert.doesNotMatch(body, /sk_live|password|apiKey":\s*"/);
});

if (process.exitCode) process.exit(process.exitCode);
console.log('All test-hermes-managed-credentials tests passed.');

// cleanup
try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
} catch {
  /* ignore */
}
