'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const WRAPPER = path.resolve(__dirname, '..', 'grok-yolo-wrapper.js');
const {
  DEFAULT_DENY_RULES,
  MODEL,
  buildHermesArgs,
  buildStandaloneArgs,
  grokDoctor,
  parseModelsOutput,
  parseVersion,
  parseWrapperArgs,
  redact,
  versionAtLeast,
} = require(WRAPPER);

assert.strictEqual(parseVersion('grok 0.2.94 (abc123)'), '0.2.94');
assert.strictEqual(parseVersion('unknown'), null);
assert.strictEqual(versionAtLeast('0.2.94'), true);
assert.strictEqual(versionAtLeast('0.2.93'), true);
assert.strictEqual(versionAtLeast('0.3.0'), true);
assert.strictEqual(versionAtLeast('0.2.92'), false);

const models = parseModelsOutput(`You are logged in with grok.com.

Default model: grok-4.5

Available models:
  * grok-4.5 (default)
  - grok-composer-2.5-fast
`);
assert.strictEqual(models.authenticatedWithGrokCom, true);
assert.strictEqual(models.defaultModel, MODEL);
assert.deepStrictEqual(models.models, ['grok-4.5', 'grok-composer-2.5-fast']);

const standalone = buildStandaloneArgs(['--cwd', '/tmp/project']);
assert.deepStrictEqual(standalone.slice(0, 3), ['--model', MODEL, '--always-approve']);
for (const deny of DEFAULT_DENY_RULES) assert(standalone.includes(deny));
assert(standalone.includes('/tmp/project'));
assert.throws(() => buildStandaloneArgs(['--model', 'something-else']), /pinned/);

const hermes = buildHermesArgs('verify the diff', {
  cwd: '/tmp/project',
  maxTurns: 8,
  outputFormat: 'json',
});
assert.deepStrictEqual(hermes.slice(0, 3), ['--model', MODEL, '--always-approve']);
assert(!hermes.includes('--check'));
assert(hermes.includes('--no-subagents'));
assert(hermes.includes('--no-memory'));
assert.strictEqual(hermes[hermes.indexOf('--max-turns') + 1], '8');
assert.strictEqual(hermes[hermes.indexOf('-p') + 1], 'verify the diff');
assert.strictEqual(hermes[hermes.indexOf('--output-format') + 1], 'json');
assert.throws(() => buildHermesArgs('', {}), /non-empty task/);
assert.throws(() => buildHermesArgs('x', { maxTurns: 0 }), /maxTurns/);

const parsed = parseWrapperArgs([
  '--hermes',
  '--task', 'check this',
  '--cwd', '/tmp/project',
  '--max-turns', '7',
  '--output-format', 'streaming-json',
]);
assert.strictEqual(parsed.hermes, true);
assert.strictEqual(parsed.task, 'check this');
assert.strictEqual(parsed.cwd, '/tmp/project');
assert.strictEqual(parsed.maxTurns, 7);
assert.strictEqual(parsed.outputFormat, 'streaming-json');
assert.strictEqual(parseWrapperArgs(['--hermes', 'verify', 'this']).task, 'verify this');

const probe = (binary, args) => {
  if (args[0] === 'version') return { status: 0, stdout: 'grok 0.2.93 (test)', stderr: '' };
  return {
    status: 0,
    stdout: 'You are logged in with grok.com.\nDefault model: grok-4.5\nAvailable models:\n * grok-4.5 (default)\n',
    stderr: '',
  };
};
const doctor = grokDoctor({ binary: '/fake/grok', env: {}, probe });
assert.strictEqual(doctor.ready, true);
assert.strictEqual(doctor.authMode, 'grok.com_oauth');
assert.strictEqual(doctor.billingMode, 'grok_plan_or_limited_free_quota');
assert.strictEqual(doctor.apiKeyPresent, false);
assert.strictEqual(doctor.pricing.perMillionTokens.input, 2);
assert.strictEqual(doctor.pricing.perMillionTokens.output, 6);

const apiDoctor = grokDoctor({
  binary: '/fake/grok',
  env: { XAI_API_KEY: 'fake-placeholder' },
  probe: (binary, args) => args[0] === 'version'
    ? { status: 0, stdout: 'grok 0.2.93', stderr: '' }
    : { status: 0, stdout: 'Default model: grok-4.5\nAvailable models:\n * grok-4.5 (default)\n', stderr: '' },
});
assert.strictEqual(apiDoctor.ready, true);
assert.strictEqual(apiDoctor.authMode, 'xai_api_key');
assert.strictEqual(apiDoctor.billingMode, 'xai_api_pay_as_you_go');

const oldDoctor = grokDoctor({
  binary: '/fake/grok',
  env: {},
  probe: (binary, args) => args[0] === 'version'
    ? { status: 0, stdout: 'grok 0.2.92', stderr: '' }
    : probe(binary, args),
});
assert.strictEqual(oldDoctor.ready, false);
assert.strictEqual(oldDoctor.blocker, 'grok_cli_update_required');

const secretFixture = 'XAI_API_KEY=xai-' + 'a'.repeat(24);
const redacted = redact(secretFixture);
assert(!redacted.includes('xai-'));
assert(redacted.includes('[REDACTED]'));

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'grok-yolo-test-'));
const fakeGrok = path.join(temp, 'grok');
fs.writeFileSync(fakeGrok, `#!/usr/bin/env bash
if [[ "$1" == "version" ]]; then
  echo "grok 0.2.93 (fake)"
elif [[ "$1" == "models" ]]; then
  echo "You are logged in with grok.com."
  echo "Default model: grok-4.5"
  echo "Available models:"
  echo "  * grok-4.5 (default)"
else
  printf '%s\\n' "$@"
fi
`, { mode: 0o755 });
const dryRun = JSON.parse(execFileSync(process.execPath, [WRAPPER, '--dry-run', '--json'], {
  env: { ...process.env, GROK_BIN: fakeGrok },
  encoding: 'utf8',
}));
assert.strictEqual(dryRun.binary, fakeGrok);
assert.strictEqual(dryRun.model, MODEL);
assert(dryRun.args.includes('--always-approve'));
fs.rmSync(temp, { recursive: true, force: true });

console.log('Grok YOLO wrapper tests: PASS');
