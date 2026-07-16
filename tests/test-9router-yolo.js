'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const WRAPPER = path.resolve(__dirname, '..', '9router-yolo');
const INSTALLER = path.resolve(__dirname, '..', 'scripts', 'install-9router-yolo.sh');
const {
  DEFAULT_MAX_OLD_SPACE_MB,
  DEFAULT_MODEL,
  LOOPBACK_HOST,
  SAFE_SETTINGS,
  UPSTREAM_INTEGRITY,
  UPSTREAM_VERSION,
  assertLoopbackUrl,
  parseCliArgs,
  parseListenerOutput,
  promptDigest,
  requestJson,
  runtimeConfig,
  writeReceipt,
} = require(WRAPPER);

assert.strictEqual(UPSTREAM_VERSION, '0.5.30');
assert.match(UPSTREAM_INTEGRITY, /^sha512-/);
assert.strictEqual(LOOPBACK_HOST, '127.0.0.1');
assert.strictEqual(DEFAULT_MODEL, 'ollama-local/qwen2.5:3b');
assert.strictEqual(DEFAULT_MAX_OLD_SPACE_MB, 768);
assert.strictEqual(SAFE_SETTINGS.tunnelEnabled, false);
assert.strictEqual(SAFE_SETTINGS.tailscaleEnabled, false);
assert.strictEqual(SAFE_SETTINGS.rtkEnabled, false);
assert.strictEqual(SAFE_SETTINGS.enableObservability, true);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), '9router-yolo-test-'));
const config = runtimeConfig({ HOME: temp });
assert.strictEqual(config.endpoint, 'http://127.0.0.1:20128');
assert.strictEqual(config.model, 'ollama-local/qwen2.5:3b');
assert.strictEqual(config.dataDir, path.join(temp, '.hermes', '9router', 'data'));
assert.strictEqual(config.prefix, path.join(temp, '.local', 'share', '9router', 'npm'));

assert.strictEqual(assertLoopbackUrl('http://localhost:11434/', 'test'), 'http://localhost:11434');
assert.throws(() => assertLoopbackUrl('https://127.0.0.1:11434', 'test'), /must use http/);
assert.throws(() => assertLoopbackUrl('http://10.0.0.1:11434', 'test'), /loopback/);
assert.throws(() => runtimeConfig({ HOME: temp, NINE_ROUTER_MODEL: 'openai/gpt-5' }), /ollama-local/);
assert.throws(() => runtimeConfig({ HOME: temp, NINE_ROUTER_PORT: '80' }), /1024/);
assert.throws(() => runtimeConfig({ HOME: temp, NINE_ROUTER_MAX_OLD_SPACE_MB: '6144' }), /2048/);

const localListener = parseListenerOutput(
  'node 123 user 16u IPv4 0x0 0t0 TCP 127.0.0.1:20128 (LISTEN)\n',
  20128,
);
assert.strictEqual(localListener.occupied, true);
assert.strictEqual(localListener.loopbackOnly, true);
assert.deepStrictEqual(localListener.pids, [123]);
const exposedListener = parseListenerOutput(
  'node 321 user 16u IPv4 0x0 0t0 TCP *:20128 (LISTEN)\n',
  20128,
);
assert.strictEqual(exposedListener.loopbackOnly, false);

assert.deepStrictEqual(parseCliArgs(['--doctor', '--json']), {
  command: 'doctor', json: true, prompt: '',
});
assert.deepStrictEqual(parseCliArgs(['chat', 'hello', 'there']), {
  command: 'chat', json: false, prompt: 'hello there',
});
assert.deepStrictEqual(parseCliArgs(['hello', 'there']), {
  command: 'chat', json: false, prompt: 'hello there',
});
assert.throws(() => parseCliArgs(['start', 'extra']), /does not accept/);
assert.throws(() => parseCliArgs(['--unsafe']), /unknown option/);

const digest = promptDigest('private prompt words');
assert.strictEqual(digest.length, 16);
assert(!digest.includes('private'));

const latest = path.join(temp, 'receipts', 'latest.json');
const history = path.join(temp, 'receipts', 'history.jsonl');
writeReceipt({ ...config, latestReceipt: latest, historyReceipt: history }, {
  schema: '9router-yolo/receipt-v1',
  promptStored: false,
  promptDigest: digest,
});
assert.strictEqual(fs.statSync(latest).mode & 0o777, 0o600);
assert.strictEqual(fs.statSync(history).mode & 0o777, 0o600);
assert(!fs.readFileSync(latest, 'utf8').includes('private prompt words'));

const installer = fs.readFileSync(INSTALLER, 'utf8');
assert(installer.includes('--ignore-scripts'));
assert(installer.includes(UPSTREAM_INTEGRITY));
assert(!installer.includes('0.0.0.0'));
assert(!installer.includes('hermes-yolo-wrapper'));
assert(!installer.includes('launchctl'));
assert(!installer.includes('--tray'));

assert.match(execFileSync(process.execPath, [WRAPPER, '--version'], { encoding: 'utf8' }), /upstream=0\.5\.30/);
assert.match(execFileSync(process.execPath, [WRAPPER, '--help'], { encoding: 'utf8' }), /loopback-only/);

(async () => {
  await assert.rejects(
    requestJson('GET', 'http://example.com/api/health'),
    /refuses non-loopback/,
  );
  fs.rmSync(temp, { recursive: true, force: true });
  console.log('9Router YOLO wrapper tests: PASS');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
