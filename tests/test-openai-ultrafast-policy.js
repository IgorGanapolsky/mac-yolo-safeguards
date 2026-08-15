#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  OpenAIUltrafastPolicy,
  budgetStatus,
  classifyTask,
  defaultPaths,
  inspectCodex,
  loadOpenAIApiKey,
} = require('../tools/openai-ultrafast-policy');

const NOW = new Date('2026-08-15T14:00:00.000Z');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function fakeResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
  };
}

async function run() {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ultrafast-policy-test-'));
  const paths = defaultPaths(tempHome);
  let passed = 0;
  const check = async (name, operation) => {
    await operation();
    passed += 1;
    process.stdout.write(`PASS ${passed}: ${name}\n`);
  };

  try {
    await check('routes only urgent high-value work and keeps secrets local', () => {
      assert.deepStrictEqual(classifyTask('Urgent production incident: inspect logs and traces now'), {
        eligible: true, route: 'ultrafast', reason: 'latency-critical-high-value',
      });
      assert.strictEqual(classifyTask('urgent typo in readme').eligible, false);
      assert.strictEqual(classifyTask('urgent production logs contain a private API key').route, 'local');
      assert.strictEqual(classifyTask('Urgent production logs include sk-proj-abcdefghijklmnop1234').route, 'local');
      assert.strictEqual(classifyTask('Urgent checkout incident for card 4242 4242 4242 4242').route, 'local');
    });

    await check('never treats ChatGPT OAuth tokens as an API key', () => {
      writeJson(paths.codexAuth, { auth_mode: 'chatgpt', OPENAI_API_KEY: 'oauth-value-not-for-api' });
      const auth = loadOpenAIApiKey({}, { paths, disableKeychain: true });
      assert.strictEqual(auth, null);
    });

    await check('reads advertised tiers and reports this account lacks Ultrafast', () => {
      writeJson(paths.codexModels, {
        models: [{ slug: 'gpt-5.6-sol', service_tiers: [{ id: 'priority', name: 'Fast' }] }],
      });
      const codex = inspectCodex(paths);
      assert.strictEqual(codex.ultrafastAdvertised, false);
      assert.deepStrictEqual(codex.advertisedTiers, ['priority']);
    });

    await check('fails closed when public/contract Ultrafast pricing is unknown', () => {
      const policy = new OpenAIUltrafastPolicy({
        env: { OPENAI_API_KEY: 'test-key' }, paths, now: () => NOW, keychainRunner: null,
      });
      const doctor = policy.doctor();
      assert.strictEqual(doctor.status, 'CONTRACT_PRICING_REQUIRED');
      assert.strictEqual(doctor.ready, false);
      const route = policy.route('Urgent production incident: analyze logs now');
      assert.strictEqual(route.selected, 'subscription-balanced');
      assert.strictEqual(route.reason, 'ultrafast-price-unknown');
    });

    await check('aggregates provider ledgers into one $10 monthly ceiling', () => {
      writeJson(paths.openrouterSpend, {
        month: '2026-08', currentSpentUsd: 7.25,
      });
      writeJson(paths.glmSpend, {
        month: '2026-08', totalCostUsd: 1.5,
      });
      const status = budgetStatus(paths, NOW);
      assert.strictEqual(status.monthlyCapUsd, 10);
      assert.strictEqual(status.committedUsd, 8.75);
      assert.strictEqual(status.availableUsd, 1.25);
    });

    await check('blocks before network when the conservative reservation exceeds the cap', async () => {
      writeJson(paths.openrouterSpend, { month: '2026-08', currentSpentUsd: 9.995 });
      writeJson(paths.glmSpend, { month: '2026-08', totalCostUsd: 0 });
      let networkCalls = 0;
      const policy = new OpenAIUltrafastPolicy({
        env: {
          OPENAI_API_KEY: 'test-key',
          OPENAI_ULTRAFAST_INPUT_USD_PER_M: '10',
          OPENAI_ULTRAFAST_OUTPUT_USD_PER_M: '60',
        },
        paths,
        now: () => NOW,
        keychainRunner: null,
        fetchImpl: async () => { networkCalls += 1; return fakeResponse({}); },
      });
      await assert.rejects(
        () => policy.execute('Urgent production incident: analyze logs now', { maxOutputTokens: 16 }),
        (error) => error.code === 'BUDGET_EXHAUSTED',
      );
      assert.strictEqual(networkCalls, 0);
    });

    await check('confirms only the exact server-returned Ultrafast tier', async () => {
      writeJson(paths.openrouterSpend, { month: '2026-08', currentSpentUsd: 0 });
      const prompt = 'Urgent production incident: analyze logs and traces now';
      const policy = new OpenAIUltrafastPolicy({
        env: {
          OPENAI_API_KEY: 'test-key',
          OPENAI_ULTRAFAST_INPUT_USD_PER_M: '10',
          OPENAI_ULTRAFAST_OUTPUT_USD_PER_M: '60',
        },
        paths,
        now: () => NOW,
        keychainRunner: null,
        fetchImpl: async (_url, request) => {
          assert.strictEqual(request.headers.Authorization, 'Bearer test-key');
          const payload = JSON.parse(request.body);
          assert.strictEqual(payload.model, 'gpt-5.6-sol');
          assert.strictEqual(payload.service_tier, 'ultrafast');
          assert.strictEqual(payload.store, false);
          return fakeResponse({
            id: 'resp_test', model: 'gpt-5.6-sol', service_tier: 'ultrafast',
            output_text: 'ULTRAFAST_ACCESS_OK',
            usage: { input_tokens: 100, output_tokens: 5 },
          });
        },
      });
      const result = await policy.execute(prompt, { maxOutputTokens: 16 });
      assert.strictEqual(result.text, 'ULTRAFAST_ACCESS_OK');
      assert.strictEqual(result.receipt.exactServerTierConfirmed, true);
      assert.strictEqual(result.receipt.promptStored, false);
      const serialized = JSON.stringify(result.receipt);
      assert(!serialized.includes(prompt));
      assert(!serialized.includes('test-key'));
      assert.strictEqual(policy.doctor().status, 'READY_CONFIRMED');
    });

    await check('charges the conservative reservation after an ambiguous network failure', async () => {
      const ambiguousHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ultrafast-ambiguous-test-'));
      const ambiguousPaths = defaultPaths(ambiguousHome);
      try {
        const policy = new OpenAIUltrafastPolicy({
          env: {
            OPENAI_API_KEY: 'test-key',
            OPENAI_ULTRAFAST_INPUT_USD_PER_M: '10',
            OPENAI_ULTRAFAST_OUTPUT_USD_PER_M: '60',
          },
          paths: ambiguousPaths,
          now: () => NOW,
          keychainRunner: null,
          fetchImpl: async () => {
            const error = new Error('connection reset after dispatch');
            error.code = 'ECONNRESET';
            throw error;
          },
        });
        await assert.rejects(
          () => policy.execute('Urgent production incident: analyze logs now', { maxOutputTokens: 8 }),
          (error) => error.code === 'ECONNRESET',
        );
        const status = budgetStatus(ambiguousPaths, NOW);
        assert(status.ultrafastSpentUsd >= 0.01);
        assert.strictEqual(status.reservedUsd, 0);
        assert.strictEqual(status.pendingChargeUsd, 0);
        const receipt = JSON.parse(fs.readFileSync(path.join(ambiguousPaths.receipts, 'latest.json'), 'utf8'));
        assert.strictEqual(receipt.status, 'ambiguous-provider-outcome');
        assert(receipt.costUsd >= 0.01);
      } finally {
        fs.rmSync(ambiguousHome, { recursive: true, force: true });
      }
    });

    await check('retries ledger contention after a billed response without losing spend', async () => {
      const retryHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ultrafast-retry-test-'));
      const retryPaths = defaultPaths(retryHome);
      let retries = 0;
      try {
        const policy = new OpenAIUltrafastPolicy({
          env: {
            OPENAI_API_KEY: 'test-key',
            OPENAI_ULTRAFAST_INPUT_USD_PER_M: '10',
            OPENAI_ULTRAFAST_OUTPUT_USD_PER_M: '60',
          },
          paths: retryPaths,
          now: () => NOW,
          keychainRunner: null,
          retryOptions: {
            attempts: 3,
            wait: () => {},
            onRetry: () => {
              retries += 1;
              fs.unlinkSync(retryPaths.lock);
            },
          },
          fetchImpl: async () => {
            fs.writeFileSync(retryPaths.lock, 'competing-writer');
            return fakeResponse({
              id: 'resp_retry', model: 'gpt-5.6-sol', service_tier: 'ultrafast',
              output_text: 'confirmed', usage: { input_tokens: 20, output_tokens: 2 },
            });
          },
        });
        const result = await policy.execute(
          'Urgent production incident: analyze logs now', { maxOutputTokens: 8 },
        );
        assert.strictEqual(result.receipt.exactServerTierConfirmed, true);
        assert.strictEqual(retries, 1);
        const status = budgetStatus(retryPaths, NOW);
        assert(status.ultrafastSpentUsd > 0);
        assert.strictEqual(status.pendingChargeUsd, 0);
      } finally {
        fs.rmSync(retryHome, { recursive: true, force: true });
      }
    });

    await check('rejects a successful response that was downgraded to Standard', async () => {
      const mismatchHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ultrafast-mismatch-test-'));
      const mismatchPaths = defaultPaths(mismatchHome);
      try {
        const policy = new OpenAIUltrafastPolicy({
          env: {
            OPENAI_API_KEY: 'test-key',
            OPENAI_ULTRAFAST_INPUT_USD_PER_M: '10',
            OPENAI_ULTRAFAST_OUTPUT_USD_PER_M: '60',
          },
          paths: mismatchPaths,
          now: () => NOW,
          keychainRunner: null,
          fetchImpl: async () => fakeResponse({
            id: 'resp_default', model: 'gpt-5.6-sol', service_tier: 'default',
            usage: { input_tokens: 20, output_tokens: 2 }, output_text: 'not proof',
          }),
        });
        await assert.rejects(
          () => policy.execute('Urgent production incident: analyze logs now', { maxOutputTokens: 8 }),
          (error) => error.code === 'ULTRAFAST_NOT_CONFIRMED'
            && error.receipt.exactServerTierConfirmed === false,
        );
        assert.strictEqual(policy.doctor().ready, false);
      } finally {
        fs.rmSync(mismatchHome, { recursive: true, force: true });
      }
    });

    await check('CLI doctor is fail-closed and does not mutate the real user state', () => {
      const cliHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ultrafast-cli-test-'));
      try {
        const result = spawnSync(
          process.execPath,
          [path.join(__dirname, '..', 'bin', 'ultrafast-yolo'), 'doctor', '--json'],
          { encoding: 'utf8', env: { ...process.env, HOME: cliHome, OPENAI_API_KEY: '' } },
        );
        assert.strictEqual(result.status, 2);
        const report = JSON.parse(result.stdout);
        assert.strictEqual(report.status, 'API_KEY_MISSING');
        assert.strictEqual(report.ready, false);
      } finally {
        fs.rmSync(cliHome, { recursive: true, force: true });
      }
    });

    process.stdout.write(`\n${passed}/${passed} ultrafast policy checks passed\n`);
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
