#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  HERMES_PROVIDER,
  ISOLATED_PROFILE,
  KEYCHAIN_SERVICE,
  MODEL,
  OPENCODE_CONFIG_DIR,
  OPENCODE_MODEL,
  OPENCODE_PROVIDER,
  OPERATIONAL_CONTEXT_TOKENS,
  buildDryRun,
  buildHermesArgs,
  buildHermesEnv,
  buildOpenCodeArgs,
  buildOpenCodeConfig,
  buildOpenCodeEnv,
  buildRawRequest,
  calculateActualCost,
  directWorstCaseCost,
  doctor,
  extractResponseText,
  hermesWorstCaseCost,
  parseArgs,
  readConfigState,
  readKey,
  redact,
  runHermes,
  runOpenCode,
  runRaw,
  storeKey,
} = require('../meta-yolo-wrapper');

let checks = 0;
async function check(name, fn) {
  await fn();
  checks += 1;
  console.log(`ok - ${name}`);
}

function testCredential() {
  return ['unit', 'test', 'credential', 'material', '123456789'].join('-');
}

function isolatedConfigText() {
  return `
model:
  provider: custom:meta-muse-spark
  default: muse-spark-1.1
providers:
  meta-muse-spark:
    base_url: https://api.meta.ai/v1
    model: muse-spark-1.1
    key_env: MODEL_API_KEY
    extra_body:
      reasoning_effort: high
compression:
  enabled: false
fallback_providers: []
fallback_model: {}
`;
}

function mainConfigText() {
  return `
providers:
  meta-muse-spark:
    base_url: https://api.meta.ai/v1
    model: muse-spark-1.1
    key_env: MODEL_API_KEY
    extra_body:
      reasoning_effort: high
`;
}

(async () => {
  await check('CLI pins model/provider and rejects overrides', () => {
    const args = parseArgs(['repair', 'the', 'test']);
    assert.equal(args.prompt, 'repair the test');
    assert.equal(args.mode, 'standalone');
    assert.throws(() => parseArgs(['--model', 'qwen3:8b']), /pinned/);
    assert.throws(() => parseArgs(['--provider', 'ollama']), /pinned/);
    assert.throws(() => parseArgs(['--hermes', '--raw', 'task']), /exactly one/);
    assert.throws(() => parseArgs(['task', '--max-turns', '2']), /only to --hermes/);
  });

  await check('bare and one-shot commands are dedicated OpenCode, never Hermes or GLM', () => {
    const args = parseArgs(['repair', 'the', 'test']);
    const oneShot = buildOpenCodeArgs(args.prompt, args);
    assert.deepEqual(oneShot.slice(0, 2), ['--pure', 'run']);
    assert.equal(oneShot[oneShot.indexOf('--model') + 1], OPENCODE_MODEL);
    assert.equal(oneShot[oneShot.indexOf('--variant') + 1], 'high');
    assert(oneShot.includes('--auto'));
    const tui = buildOpenCodeArgs('', args);
    assert.equal(tui[tui.indexOf('--model') + 1], OPENCODE_MODEL);
    for (const invocation of [oneShot, tui]) {
      const text = invocation.join(' ').toLowerCase();
      assert(!text.includes('hermes'));
      assert(!text.includes('glm'));
      assert(!text.includes('qwen'));
    }
  });

  await check('OpenCode runtime config pins main and small models to Meta only', () => {
    const config = buildOpenCodeConfig();
    assert.equal(config.model, OPENCODE_MODEL);
    assert.equal(config.small_model, OPENCODE_MODEL);
    assert.deepEqual(config.enabled_providers, [OPENCODE_PROVIDER]);
    assert.deepEqual(config.provider.meta.whitelist, [MODEL]);
    assert.equal(config.provider.meta.options.apiKey, '{env:MODEL_API_KEY}');
    assert.equal(config.share, 'disabled');
    const env = buildOpenCodeEnv(testCredential(), {
      OPENROUTER_API_KEY: 'other-provider-value',
      XAI_API_KEY: 'other-provider-value',
      OPENCODE_CONFIG_CONTENT: '{"model":"glm"}',
      OPENCODE_CONFIG: '/tmp/contaminated.json',
      PATH: '/usr/bin',
    });
    assert.equal(env.MODEL_API_KEY, testCredential());
    assert.equal(env.OPENROUTER_API_KEY, undefined);
    assert.equal(env.XAI_API_KEY, undefined);
    assert.equal(env.OPENCODE_CONFIG, undefined);
    assert.equal(env.OPENCODE_CONFIG_DIR, OPENCODE_CONFIG_DIR);
    assert.deepEqual(JSON.parse(env.OPENCODE_CONFIG_CONTENT), config);
    assert(env.XDG_DATA_HOME.includes('meta-muse/opencode-xdg'));
  });

  await check('Hermes invocation is bounded and explicit', () => {
    const args = parseArgs(['--hermes', 'fix tests', '--max-turns', '2']);
    const childArgs = buildHermesArgs(args.prompt, args);
    assert.deepEqual(childArgs.slice(0, 3), ['chat', '--query', 'fix tests']);
    assert(childArgs.includes(HERMES_PROVIDER));
    assert(childArgs.includes(MODEL));
    assert(childArgs.includes('--yolo'));
    assert(childArgs.includes('--checkpoints'));
    assert.equal(childArgs[childArgs.indexOf('--max-turns') + 1], '2');
  });

  await check('Hermes default satisfies its 64K minimum and stays below ten cents', () => {
    const args = parseArgs(['--hermes', 'review this change']);
    assert(OPERATIONAL_CONTEXT_TOKENS >= 65_536);
    assert.equal(args.maxTurns, 1);
    assert(hermesWorstCaseCost(args.maxTurns) < args.maxCostUsd);
  });

  await check('Hermes child environment removes competing provider keys', () => {
    const env = buildHermesEnv(testCredential(), {
      OPENROUTER_API_KEY: 'other-provider-value',
      XAI_API_KEY: 'other-provider-value',
      HERMES_INFERENCE_MODEL: 'qwen3:8b',
      PATH: '/usr/bin',
    });
    assert.equal(env.MODEL_API_KEY, testCredential());
    assert.equal(env.HERMES_HOME, ISOLATED_PROFILE);
    assert.equal(env.OPENROUTER_API_KEY, undefined);
    assert.equal(env.XAI_API_KEY, undefined);
    assert.equal(env.HERMES_INFERENCE_MODEL, undefined);
  });

  await check('cost calculations use official cached/input/output rates', () => {
    assert.equal(Number(hermesWorstCaseCost(1).toFixed(6)), 0.086272);
    assert.equal(Number(hermesWorstCaseCost(4).toFixed(6)), 0.345088);
    assert(directWorstCaseCost('hello', 1024) < 0.005);
    const actual = calculateActualCost({
      input_tokens: 1000,
      output_tokens: 200,
      input_tokens_details: { cached_tokens: 800 },
    });
    assert.equal(Number(actual.toFixed(6)), 0.00122);
  });

  await check('direct request uses Responses API reasoning shape and store=false', () => {
    const args = parseArgs(['--raw', 'hello', '--reasoning-effort', 'medium']);
    assert.deepEqual(buildRawRequest('hello', args), {
      model: MODEL,
      input: 'hello',
      store: false,
      max_output_tokens: 1024,
      reasoning: { effort: 'medium' },
    });
  });

  await check('response text extraction ignores reasoning and joins final text', () => {
    const text = extractResponseText({
      output: [
        { type: 'reasoning', content: [] },
        { type: 'message', content: [{ type: 'output_text', text: 'META' }, { type: 'output_text', text: 'OK' }] },
      ],
    });
    assert.equal(text, 'META\nOK');
  });

  await check('redaction covers Meta bearer credentials', () => {
    const candidate = ['LLM', '123', 'unit-test-value-that-is-not-real'].join('|');
    assert.equal(redact(candidate), '[REDACTED]');
    assert.equal(redact(`Bearer ${candidate}`), 'Bearer [REDACTED]');
  });

  await check('key lookup prefers official env then legacy env then Keychain', () => {
    const official = readKey({ env: { MODEL_API_KEY: testCredential() }, spawn: () => assert.fail('no keychain') });
    assert.equal(official.source, 'env:MODEL_API_KEY');
    const legacy = readKey({ env: { META_MODEL_API_KEY: testCredential() }, spawn: () => assert.fail('no keychain') });
    assert.equal(legacy.source, 'env:META_MODEL_API_KEY');
    const keychain = readKey({
      env: { USER: 'unit-user' },
      spawn: (binary, args) => {
        assert.equal(binary, '/usr/bin/security');
        assert(args.includes(KEYCHAIN_SERVICE));
        return { status: 0, stdout: `${testCredential()}\n`, stderr: '' };
      },
    });
    assert.equal(keychain.source, `keychain:${KEYCHAIN_SERVICE}`);
  });

  await check('store-key action writes only to the dedicated Keychain service', () => {
    let call;
    const stored = storeKey(testCredential(), {
      env: { USER: 'unit-user' },
      spawn: (binary, args) => {
        call = { binary, args };
        return { status: 0, stdout: '', stderr: '' };
      },
    });
    assert.equal(stored.stored, true);
    assert.equal(call.binary, '/usr/bin/security');
    assert(call.args.includes('add-generic-password'));
    assert(call.args.includes(KEYCHAIN_SERVICE));
  });

  await check('config validator proves an empty fallback chain', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-yolo-config-'));
    const config = path.join(temp, 'config.yaml');
    fs.writeFileSync(config, isolatedConfigText());
    const state = readConfigState(config, true);
    assert.equal(state.providerConfigured, true);
    assert.equal(state.isolatedReady, true);
    assert.equal(state.fallbackProvidersEmpty, true);
    assert.equal(state.fallbackModelEmpty, true);
    assert.equal(state.literalApiKeyReferenceAbsent, true);
  });

  await check('config validator rejects the literal env reference Hermes would send as a bearer token', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-yolo-bad-key-ref-'));
    const config = path.join(temp, 'config.yaml');
    fs.writeFileSync(config, isolatedConfigText().replace(
      '    key_env: MODEL_API_KEY',
      '    key_env: MODEL_API_KEY\n    api_key: env:MODEL_API_KEY',
    ));
    const state = readConfigState(config, true);
    assert.equal(state.literalApiKeyReferenceAbsent, false);
    assert.equal(state.isolatedReady, false);
  });

  await check('doctor separates standalone auth from Hermes route readiness', () => {
    const report = doctor({
      keyState: { key: testCredential(), source: 'test' },
      openCodeBinary: '/tmp/opencode',
      hermesBinary: '/tmp/hermes',
      spawn: (binary) => ({
        status: 0,
        stdout: binary === '/tmp/opencode' ? '1.17.19\n' : 'Hermes Agent v0.18.2\n',
        stderr: '',
      }),
      mainConfigState: { providerConfigured: true },
      isolatedConfigState: { isolatedReady: true },
    });
    assert.equal(report.ready, true);
    assert.equal(report.standaloneReady, true);
    assert.equal(report.hermesReady, true);
    assert.equal(report.fallbackPolicy.qwenFallbackPossibleInMetaYolo, false);

    const blocked = doctor({
      keyState: { key: null, source: 'none' },
      openCodeBinary: '/tmp/opencode',
      hermesBinary: '/tmp/hermes',
      spawn: (binary) => ({
        status: 0,
        stdout: binary === '/tmp/opencode' ? '1.17.19\n' : 'Hermes Agent v0.18.2\n',
        stderr: '',
      }),
      mainConfigState: { providerConfigured: true },
      isolatedConfigState: { isolatedReady: true },
    });
    assert.equal(blocked.standaloneReady, false);
    assert.deepEqual(blocked.blockers, ['meta_model_api_key_missing']);
  });

  await check('standalone mode executes OpenCode with an isolated Meta-only environment', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-yolo-opencode-'));
    const args = parseArgs(['repair tests', '--cwd', temp]);
    let call;
    const result = runOpenCode(args.prompt, args, {
      env: {
        OPENROUTER_API_KEY: 'other-provider-value',
        OPENCODE_CONFIG_CONTENT: '{"model":"glm"}',
        PATH: '/usr/bin',
      },
      keyState: { key: testCredential(), source: 'test' },
      openCodeBinary: '/tmp/opencode',
      directory: temp,
      spawn: (binary, childArgs, options) => {
        call = { binary, childArgs, options };
        return { status: 0, stdout: 'META-OPENCODE-OK\n', stderr: '', signal: null };
      },
    });
    assert.equal(result.ok, true);
    assert.equal(call.binary, '/tmp/opencode');
    assert.equal(call.childArgs[call.childArgs.indexOf('--model') + 1], OPENCODE_MODEL);
    assert.equal(call.options.env.OPENROUTER_API_KEY, undefined);
    assert.equal(JSON.parse(call.options.env.OPENCODE_CONFIG_CONTENT).model, OPENCODE_MODEL);
    assert.equal(result.receipt.selectedProvider, OPENCODE_PROVIDER);
    assert.equal(result.receipt.selectedModel, OPENCODE_MODEL);
    assert.equal(result.receipt.hardCostCapEnforced, false);
    assert.equal(result.receipt.routeProof, 'opencode_exact_model_plus_meta_only_allowlist_plus_isolated_state');
    const receiptText = fs.readFileSync(result.paths.latestPath, 'utf8');
    assert(!receiptText.includes('repair tests'));
    assert(!receiptText.includes(testCredential()));
  });

  await check('raw mode verifies model, usage, cost, and private prompt-free receipt', async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-yolo-raw-'));
    const args = parseArgs(['--raw', 'sensitive unit prompt']);
    let request;
    const result = await runRaw(args.prompt, args, {
      keyState: { key: testCredential(), source: 'test' },
      directory: temp,
      fetch: async (url, options) => {
        request = { url, options };
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              status: 'completed',
              model: MODEL,
              output: [{ type: 'message', content: [{ type: 'output_text', text: 'META-RAW-OK' }] }],
              usage: {
                input_tokens: 10,
                output_tokens: 5,
                total_tokens: 15,
                input_tokens_details: { cached_tokens: 0 },
                output_tokens_details: { reasoning_tokens: 2 },
              },
            };
          },
        };
      },
    });
    assert.equal(request.url, 'https://api.meta.ai/v1/responses');
    assert.equal(JSON.parse(request.options.body).store, false);
    assert.equal(result.text, 'META-RAW-OK');
    assert.equal(result.receipt.routeVerified, true);
    const receiptText = fs.readFileSync(result.paths.latestPath, 'utf8');
    assert(!receiptText.includes('sensitive unit prompt'));
    assert(!receiptText.includes(testCredential()));
    assert.equal(fs.statSync(result.paths.latestPath).mode & 0o777, 0o600);
  });

  await check('raw mode records a billed failure receipt when reasoning exhausts output', async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-yolo-raw-empty-'));
    const args = parseArgs(['--raw', 'private task', '--max-output-tokens', '32']);
    await assert.rejects(
      runRaw(args.prompt, args, {
        keyState: { key: testCredential(), source: 'test' },
        directory: temp,
        fetch: async () => ({
          ok: true,
          status: 200,
          async json() {
            return {
              status: 'incomplete',
              incomplete_details: { reason: 'max_output_tokens' },
              model: MODEL,
              output: [{ type: 'reasoning', content: [] }],
              usage: {
                input_tokens: 10,
                output_tokens: 32,
                total_tokens: 42,
                output_tokens_details: { reasoning_tokens: 32 },
              },
            };
          },
        }),
      }),
      /no final output text/,
    );
    const receipt = JSON.parse(fs.readFileSync(path.join(temp, 'latest.json'), 'utf8'));
    assert.equal(receipt.ok, false);
    assert.equal(receipt.error, 'no_final_output_text');
    assert.equal(receipt.incompleteReason, 'max_output_tokens');
    assert.equal(receipt.usage.reasoningTokens, 32);
    assert.equal(receipt.routeVerified, true);
    assert(!JSON.stringify(receipt).includes('private task'));
  });

  await check('Hermes mode executes only the fail-closed Meta route', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-yolo-hermes-'));
    const args = parseArgs(['--hermes', 'repair tests', '--max-turns', '1', '--cwd', temp]);
    let call;
    const result = runHermes(args.prompt, args, {
      env: { OPENROUTER_API_KEY: 'other-provider-value', PATH: '/usr/bin' },
      keyState: { key: testCredential(), source: 'test' },
      configState: { isolatedReady: true },
      hermesBinary: '/tmp/hermes',
      directory: temp,
      spawn: (binary, childArgs, options) => {
        call = { binary, childArgs, options };
        return { status: 0, stdout: 'META-HERMES-OK\n', stderr: '', signal: null };
      },
    });
    assert.equal(result.ok, true);
    assert.equal(call.binary, '/tmp/hermes');
    assert(call.childArgs.includes('custom:meta-muse-spark'));
    assert(call.childArgs.includes('muse-spark-1.1'));
    assert.equal(call.options.env.OPENROUTER_API_KEY, undefined);
    assert.equal(call.options.env.HERMES_HOME, ISOLATED_PROFILE);
    assert.deepEqual(result.receipt.fallbackProviders, []);
    assert.equal(result.receipt.qwenFallbackPossible, false);
    assert.equal(result.receipt.routeProof, 'explicit_provider_model_plus_empty_fallback_chain');
  });

  await check('Hermes failure receipts retain only a safe HTTP status', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-yolo-hermes-failure-'));
    const args = parseArgs(['--hermes', 'private repair task', '--max-turns', '1', '--cwd', temp]);
    const result = runHermes(args.prompt, args, {
      env: { PATH: '/usr/bin' },
      keyState: { key: testCredential(), source: 'test' },
      configState: { isolatedReady: true },
      hermesBinary: '/tmp/hermes',
      directory: temp,
      spawn: () => ({
        status: 1,
        stdout: 'HTTP 401 Unauthorized: private model output must not be stored\n',
        stderr: '',
        signal: null,
      }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.receipt.error, 'HTTP 401');
    const receiptText = fs.readFileSync(result.paths.latestPath, 'utf8');
    assert(!receiptText.includes('private repair task'));
    assert(!receiptText.includes('private model output'));
    assert(!receiptText.includes(testCredential()));
  });

  await check('dry-run is usable without a credential and stores no task text', () => {
    const plan = buildDryRun(parseArgs(['--dry-run', 'private task']));
    assert.equal(plan.promptPresent, true);
    assert.equal(plan.promptStored, false);
    assert.equal(plan.withinCostCap, null);
    assert.equal(plan.hardCostCapEnforced, false);
    assert.equal(plan.selectedModel, OPENCODE_MODEL);
    assert(!JSON.stringify(plan).includes('private task'));
  });

  await check('malformed or absent credentials fail closed', async () => {
    assert.throws(() => storeKey('short'), /malformed/);
    const args = parseArgs(['task']);
    assert.throws(
      () => runOpenCode(args.prompt, args, { keyState: { key: null, source: 'none' } }),
      (error) => error.exitCode === 78,
    );
  });

  await check('fixture config does not accidentally claim an alternate model', () => {
    assert(mainConfigText().includes('muse-spark-1.1'));
    assert(!mainConfigText().toLowerCase().includes('qwen'));
  });

  console.log(`${checks} checks passed.`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
