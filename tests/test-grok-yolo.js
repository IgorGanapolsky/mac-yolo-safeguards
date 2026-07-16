'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const WRAPPER = path.resolve(__dirname, '..', 'grok-yolo-wrapper.js');
const {
  DEFAULT_DENY_RULES,
  HERMES_VERIFIER_PROFILE,
  LOCAL_BASE_URL,
  LOCAL_CONTEXT_TOKENS,
  LOCAL_HERMES_PROFILE,
  LOCAL_MODEL_ALIAS,
  MODEL,
  buildHermesArgs,
  buildHermesEnv,
  buildLocalEnv,
  buildStandaloneArgs,
  externalOtelStatus,
  findOllamaBinary,
  grokDoctor,
  localConfig,
  localDoctor,
  parseModelsOutput,
  parseVersion,
  parseWrapperArgs,
  redact,
  validateLocalModel,
  versionAtLeast,
} = require(WRAPPER);

assert.strictEqual(parseVersion('grok 0.2.94 (abc123)'), '0.2.94');
assert.strictEqual(parseVersion('unknown'), null);
assert.strictEqual(versionAtLeast('0.2.99'), true);
assert.strictEqual(versionAtLeast('0.2.98'), false);
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
const localStandalone = buildStandaloneArgs(['--cwd', '/tmp/project'], {
  model: LOCAL_MODEL_ALIAS,
  local: true,
});
assert.deepStrictEqual(localStandalone.slice(0, 3), ['--model', LOCAL_MODEL_ALIAS, '--always-approve']);
assert(localStandalone.includes('--disable-web-search'));
assert(localStandalone.includes('--no-subagents'));

const hermes = buildHermesArgs('verify the diff', {
  cwd: '/tmp/project',
  maxTurns: 8,
  outputFormat: 'json',
});
assert.deepStrictEqual(hermes.slice(0, 3), ['--model', MODEL, '--always-approve']);
assert(!hermes.includes('--check'));
assert(hermes.includes('--no-subagents'));
assert(hermes.includes('--no-memory'));
assert.strictEqual(hermes[hermes.indexOf('--sandbox') + 1], 'read-only');
assert.strictEqual(hermes[hermes.indexOf('--max-turns') + 1], '8');
assert.strictEqual(hermes[hermes.indexOf('-p') + 1], 'verify the diff');
assert.strictEqual(hermes[hermes.indexOf('--output-format') + 1], 'json');
assert.throws(() => buildHermesArgs('', {}), /non-empty task/);
assert.throws(() => buildHermesArgs('x', { maxTurns: 0 }), /maxTurns/);
assert.strictEqual(HERMES_VERIFIER_PROFILE.id, 'grok45-readonly-verifier-v1');
assert.strictEqual(HERMES_VERIFIER_PROFILE.writeFileEnabled, false);
const sourceEnv = { KEEP_ME: 'yes', GROK_WRITE_FILE: '1' };
const hermesEnv = buildHermesEnv(sourceEnv);
assert.deepStrictEqual(sourceEnv, { KEEP_ME: 'yes', GROK_WRITE_FILE: '1' });
assert.strictEqual(hermesEnv.KEEP_ME, 'yes');
assert.strictEqual(hermesEnv.GROK_WRITE_FILE, '0');
assert(!standalone.includes('--sandbox'));

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
assert.strictEqual(parseWrapperArgs(['--local']).local, true);

const probe = (binary, args) => {
  if (args[0] === 'version') return { status: 0, stdout: 'grok 0.2.99 (test)', stderr: '' };
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
assert.strictEqual(Object.hasOwn(doctor, 'apiKeyPresent'), false);
assert.strictEqual(doctor.pricing.perMillionTokens.input, 2);
assert.strictEqual(doctor.pricing.perMillionTokens.output, 6);

const apiDoctor = grokDoctor({
  binary: '/fake/grok',
  env: { XAI_API_KEY: 'fake-placeholder' },
  probe: (binary, args) => args[0] === 'version'
    ? { status: 0, stdout: 'grok 0.2.99', stderr: '' }
    : { status: 0, stdout: 'Default model: grok-4.5\nAvailable models:\n * grok-4.5 (default)\n', stderr: '' },
});
assert.strictEqual(apiDoctor.ready, true);
assert.strictEqual(apiDoctor.authMode, 'xai_api_key');
assert.strictEqual(apiDoctor.billingMode, 'xai_api_pay_as_you_go');

const oldDoctor = grokDoctor({
  binary: '/fake/grok',
  env: {},
  probe: (binary, args) => args[0] === 'version'
    ? { status: 0, stdout: 'grok 0.2.98', stderr: '' }
    : probe(binary, args),
});
assert.strictEqual(oldDoctor.ready, false);
assert.strictEqual(oldDoctor.blocker, 'grok_cli_update_required');

const localProbe = (binary, args) => {
  if (args[0] === 'version') return { status: 0, stdout: 'grok 0.2.101 (test)', stderr: '' };
  if (args[0] === 'list') {
    return { status: 0, stdout: 'NAME ID SIZE MODIFIED\nqwen3.5:9b-hermes-64k abc 7GB now\n', stderr: '' };
  }
  return { status: 2, stdout: '', stderr: 'unexpected probe' };
};
const localReady = localDoctor({
  binary: '/fake/grok',
  env: { OLLAMA_BIN: '/fake/ollama' },
  model: 'qwen3.5:9b-hermes-64k',
  probe: localProbe,
});
assert.strictEqual(localReady.ready, true);
assert.strictEqual(localReady.mode, 'local');
assert.strictEqual(localReady.model, LOCAL_MODEL_ALIAS);
assert.strictEqual(localReady.underlyingModel, 'qwen3.5:9b-hermes-64k');
assert.strictEqual(localReady.endpoint, LOCAL_BASE_URL);
assert.strictEqual(localReady.endpointScope, 'loopback');
assert.strictEqual(localReady.authMode, 'none_local');
assert.strictEqual(localReady.providerCostUsd, 0);
assert.strictEqual(localReady.ollamaBinary, '/fake/ollama');
assert.strictEqual(localReady.externalOtel.contentFree, true);
assert.strictEqual(localDoctor({
  binary: '/fake/grok',
  env: { OLLAMA_BIN: '/fake/ollama' },
  model: 'missing-model',
  probe: localProbe,
}).blocker, 'local_ollama_model_unavailable');
assert.strictEqual(findOllamaBinary({ OLLAMA_BIN: '/fake/ollama' }), '/fake/ollama');
assert.throws(() => validateLocalModel('bad model\nbase_url="https://example.com"'), /local model/);

const localToml = localConfig('qwen3.5:9b-hermes-64k');
assert.match(localToml, /default = "ollama-hermes-zero-spend"/);
assert.match(localToml, /model = "qwen3\.5:9b-hermes-64k"/);
assert.match(localToml, /base_url = "http:\/\/127\.0\.0\.1:11434\/v1"/);
assert.match(localToml, new RegExp(`context_window = ${LOCAL_CONTEXT_TOKENS}`));
assert.match(localToml, /otel_log_user_prompts = false/);
assert.match(localToml, /otel_log_tool_details = false/);
assert.doesNotMatch(localToml, /^\s*(api_key|env_key|password|authorization)\s*=/im);

assert.deepStrictEqual(externalOtelStatus({
  GROK_EXTERNAL_OTEL: '1',
  OTEL_METRICS_EXPORTER: 'otlp',
  OTEL_EXPORTER_OTLP_ENDPOINT: 'https://collector.example',
}), {
  enabled: true,
  metricsExporter: 'otlp',
  logsExporter: 'none',
  endpointConfigured: true,
  contentFree: true,
});

const secretFixture = 'XAI_API_KEY=xai-' + 'a'.repeat(24);
const redacted = redact(secretFixture);
assert(!redacted.includes('xai-'));
assert(redacted.includes('[REDACTED]'));

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'grok-yolo-test-'));
const fakeGrok = path.join(temp, 'grok');
const fakeOllama = path.join(temp, 'ollama');
fs.writeFileSync(fakeGrok, `#!/usr/bin/env bash
if [[ "$1" == "version" ]]; then
  echo "grok 0.2.99 (fake)"
elif [[ "$1" == "models" ]]; then
  echo "You are logged in with grok.com."
  echo "Default model: grok-4.5"
  echo "Available models:"
  echo "  * grok-4.5 (default)"
else
  printf '%s\\n' "$@"
fi
`, { mode: 0o755 });
fs.writeFileSync(fakeOllama, `#!/usr/bin/env bash
if [[ "$1" == "list" ]]; then
  echo "NAME ID SIZE MODIFIED"
  echo "qwen3.5:9b-hermes-64k abc 7GB now"
fi
`, { mode: 0o755 });
const dryRun = JSON.parse(execFileSync(process.execPath, [WRAPPER, '--dry-run', '--json'], {
  env: { ...process.env, GROK_BIN: fakeGrok },
  encoding: 'utf8',
}));
assert.strictEqual(dryRun.binary, fakeGrok);
assert.strictEqual(dryRun.model, MODEL);
assert(dryRun.args.includes('--always-approve'));
assert.strictEqual(dryRun.hermesProfile, null);
const hermesDryRun = JSON.parse(execFileSync(process.execPath, [
  WRAPPER, '--hermes', '--task', 'verify profile', '--dry-run', '--json',
], {
  env: { ...process.env, GROK_BIN: fakeGrok },
  encoding: 'utf8',
}));
assert.strictEqual(hermesDryRun.hermesProfile.id, 'grok45-readonly-verifier-v1');
assert.strictEqual(hermesDryRun.args[hermesDryRun.args.indexOf('--sandbox') + 1], 'read-only');
const localHome = path.join(temp, 'home');
const localDryRun = JSON.parse(execFileSync(process.execPath, [
  WRAPPER, '--local', '--dry-run', '--json', '--cwd', '/tmp/project',
], {
  env: {
    ...process.env,
    HOME: localHome,
    GROK_BIN: fakeGrok,
    OLLAMA_BIN: fakeOllama,
    GROK_YOLO_LOCAL_MODEL: 'qwen3.5:9b-hermes-64k',
  },
  encoding: 'utf8',
}));
assert.strictEqual(localDryRun.mode, 'local');
assert.strictEqual(localDryRun.model, LOCAL_MODEL_ALIAS);
assert.strictEqual(localDryRun.underlyingModel, 'qwen3.5:9b-hermes-64k');
assert.strictEqual(localDryRun.endpoint, LOCAL_BASE_URL);
assert.strictEqual(localDryRun.providerCostUsd, 0);
assert(localDryRun.args.includes('--disable-web-search'));
assert(localDryRun.args.includes('--no-subagents'));

const localEnvSource = {
  HOME: localHome,
  XAI_API_KEY: 'must-not-reach-child',
  OPENAI_API_KEY: 'must-not-reach-child',
  GROK_EXTERNAL_OTEL: '1',
  OTEL_METRICS_EXPORTER: 'console',
  OTEL_LOG_USER_PROMPTS: '1',
  OTEL_LOG_TOOL_DETAILS: '1',
};
const localEnv = buildLocalEnv('qwen3.5:9b-hermes-64k', localEnvSource);
assert.strictEqual(localEnv.XAI_API_KEY, '');
assert.strictEqual(localEnv.OPENAI_API_KEY, '');
assert.strictEqual(localEnv.GROK_YOLO_LOCAL_ONLY, '1');
assert.strictEqual(localEnv.GROK_TELEMETRY_ENABLED, '0');
assert.strictEqual(localEnv.OTEL_LOG_USER_PROMPTS, '0');
assert.strictEqual(localEnv.OTEL_LOG_TOOL_DETAILS, '0');
assert.strictEqual(localEnv.GROK_EXTERNAL_OTEL, '1');
assert.strictEqual(localEnv.OTEL_METRICS_EXPORTER, 'console');
const managedConfig = path.join(localEnv.GROK_HOME, 'config.toml');
assert.strictEqual(fs.statSync(managedConfig).mode & 0o777, 0o600);
assert.strictEqual(fs.readFileSync(managedConfig, 'utf8'), localToml);
assert.deepStrictEqual(localEnvSource, {
  HOME: localHome,
  XAI_API_KEY: 'must-not-reach-child',
  OPENAI_API_KEY: 'must-not-reach-child',
  GROK_EXTERNAL_OTEL: '1',
  OTEL_METRICS_EXPORTER: 'console',
  OTEL_LOG_USER_PROMPTS: '1',
  OTEL_LOG_TOOL_DETAILS: '1',
});
assert.strictEqual(LOCAL_HERMES_PROFILE.model, LOCAL_MODEL_ALIAS);
fs.rmSync(temp, { recursive: true, force: true });

console.log('Grok YOLO wrapper tests: PASS');
