#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  WEIGHTS_REPO,
  routeUltramarineTask,
  buildChatBody,
  dispatchUltramarine,
} = require('../tools/ultramarine-flash-route');

const source = fs.readFileSync(path.join(__dirname, '../tools/ultramarine-flash-route.js'), 'utf8');
const cleanEnv = {
  ULTRAMARINE_SKIP_KEYCHAIN: '1',
  ULTRAMARINE_SKIP_DOTENV: '1',
  PATH: process.env.PATH,
};

function main() {
  assert.strictEqual(WEIGHTS_REPO, 'paperinstruments/Ultramarine-1-Flash');
  assert.ok(!source.includes('Ultramarine-1-Flash-LoRA'));
  assert.ok(!source.includes('savingsPct'));
  assert.ok(!source.includes('$0.13'));
  assert.ok(!source.includes('8.19'));
  assert.ok(!source.includes('59.3'));
  assert.ok(!/huggingface-local/.test(source));
  assert.ok(source.includes('dispatchUltramarine({ task, force: true }, process.env, cliCallDeps())'));

  const blocked = routeUltramarineTask({
    task: 'Reconcile the quarterly memo and the income statement.',
    inputTokens: 1000,
    outputTokens: 500,
  }, cleanEnv);
  assert.strictEqual(blocked.ok, false);
  assert.strictEqual(blocked.status, 'not_configured');
  assert.strictEqual(blocked.called, false);
  assert.strictEqual(blocked.weightsDownloaded, false);
  assert.strictEqual(blocked.measuredSavingsPct, null);
  assert.strictEqual(blocked.selectedProvider, null);
  assert.deepStrictEqual(blocked.failoverChain, ['ultramarine-api', 'fireworks', 'baseten']);
  assert.strictEqual(blocked.context.modelCardTokens, 1048576);
  assert.strictEqual(blocked.context.operationalCompactionTokens, 131072);
  assert.strictEqual(blocked.context.fitsOperationalCompaction, true);

  const refused = routeUltramarineTask({ downloadWeights: true, force: true }, cleanEnv);
  assert.strictEqual(refused.status, 'download_refused');
  assert.strictEqual(refused.weightsDownloaded, false);

  const coding = routeUltramarineTask({
    task: 'fix the menu bar css',
    credentials: { 'ultramarine-api': true },
  }, cleanEnv);
  assert.strictEqual(coding.status, 'not_knowledge_work');
  assert.strictEqual(coding.ok, false);

  const paper = routeUltramarineTask({
    task: 'Build the diligence workbook for the earnings memo.',
    credentials: { 'ultramarine-api': true, fireworks: true },
    inputTokens: 200000,
    outputTokens: 1000,
  }, cleanEnv);
  assert.strictEqual(paper.ok, true);
  assert.strictEqual(paper.selectedProvider.id, 'ultramarine-api');
  assert.strictEqual(paper.selectedProvider.model, 'ultramarine-1-flash');
  assert.strictEqual(paper.selectedProvider.vendorRatesPerMillionUsd.input, 0.15);
  assert.strictEqual(paper.selectedProvider.rateSource, 'https://www.paperinstruments.com/ultramarine');
  assert.strictEqual(paper.context.fitsModelCard, true);
  assert.strictEqual(paper.context.fitsOperationalCompaction, false);
  assert.ok(!Object.prototype.hasOwnProperty.call(paper, 'authorization'));

  const fireworks = routeUltramarineTask({
    task: 'knowledge work memo',
    preferredProvider: 'fireworks',
    credentials: { 'ultramarine-api': true, fireworks: true },
  }, cleanEnv);
  assert.strictEqual(fireworks.selectedProvider.model, 'accounts/fireworks/models/ultramarine-1-flash-us');
  assert.strictEqual(fireworks.selectedProvider.vendorRatesPerMillionUsd.output, 0.75);

  const basetenMissingUrl = routeUltramarineTask({
    task: 'knowledge work memo',
    preferredProvider: 'baseten',
    credentials: { baseten: true },
  }, cleanEnv);
  assert.strictEqual(basetenMissingUrl.status, 'not_configured');

  const baseten = routeUltramarineTask({
    force: true,
    preferredProvider: 'baseten',
    credentials: { baseten: true, basetenBaseUrl: 'https://example.baseten.test/v1/chat/completions' },
  }, cleanEnv);
  assert.strictEqual(baseten.ok, true);
  assert.strictEqual(baseten.selectedProvider.endpoint, 'https://example.baseten.test/v1/chat/completions');

  const unknown = routeUltramarineTask({
    force: true,
    preferredProvider: 'huggingface-local',
    credentials: { 'ultramarine-api': true },
  }, cleanEnv);
  assert.strictEqual(unknown.status, 'unknown_provider');

  const overflow = routeUltramarineTask({
    force: true,
    inputTokens: 1048576,
    outputTokens: 1,
    credentials: { 'ultramarine-api': true },
  }, cleanEnv);
  assert.strictEqual(overflow.status, 'context_overflow');

  const body = buildChatBody({ maxCompletionTokens: 100, task: 'memo' }, paper.selectedProvider);
  assert.strictEqual(body.temperature, 1);
  assert.strictEqual(body.top_p, 0.95);
  assert.strictEqual(body.reasoning_effort, 'max');
  assert.strictEqual(body.max_completion_tokens, 32768);
  assert.ok(!Object.prototype.hasOwnProperty.call(body, 'top_k'));

  const secret = 'test-token-not-a-real-key';
  return dispatchUltramarine({
    force: true,
    task: 'earnings memo',
    credentials: { 'ultramarine-api': true, fireworks: true },
  }, cleanEnv, {
    tokenFor(id) { return id === 'ultramarine-api' || id === 'fireworks' ? secret : ''; },
    async fetch(url, options) {
      const parsed = JSON.parse(options.body);
      assert.ok(!Object.prototype.hasOwnProperty.call(parsed, 'top_k'));
      assert.ok(String(options.headers.Authorization).includes(secret));
      if (String(url).includes('paperinstruments')) return { status: 503 };
      assert.strictEqual(parsed.model, 'accounts/fireworks/models/ultramarine-1-flash-us');
      return { status: 200 };
    },
  }).then((dispatched) => {
    assert.strictEqual(dispatched.ok, true);
    assert.strictEqual(dispatched.called, true);
    assert.strictEqual(dispatched.selectedProvider.id, 'fireworks');
    assert.strictEqual(dispatched.authorization, 'redacted');
    assert.strictEqual(JSON.stringify(dispatched).includes(secret), false);
    assert.deepStrictEqual(dispatched.attempts.map((attempt) => attempt.httpStatus), [503, 200]);

    const envToken = 'env-token-not-real';
    const dotenvToken = 'dotenv-token-not-real';
    const keychainToken = 'keychain-token-not-real';
    return dispatchUltramarine({
      force: true,
      task: 'earnings memo',
    }, { ...cleanEnv, FIREWORKS_API_KEY: envToken }, {
      async fetch(url, options) {
        assert.ok(String(url).includes('api.fireworks.ai'));
        assert.strictEqual(options.headers.Authorization, 'Bearer ' + envToken);
        return { status: 200 };
      },
    }).then((fromEnv) => {
      assert.strictEqual(fromEnv.called, true);
      assert.strictEqual(fromEnv.selectedProvider.id, 'fireworks');
      assert.strictEqual(JSON.stringify(fromEnv).includes(envToken), false);
      return dispatchUltramarine({
        force: true,
        task: 'earnings memo',
        credentials: { 'ultramarine-api': true },
      }, cleanEnv, {
        readDotenv(key) { return key === 'PAPERINSTRUMENTS_API_KEY' ? dotenvToken : ''; },
        async fetch(url, options) {
          assert.ok(String(url).includes('api.paperinstruments.com'));
          assert.strictEqual(options.headers.Authorization, 'Bearer ' + dotenvToken);
          return { status: 200 };
        },
      });
    }).then((fromDotenv) => {
      assert.strictEqual(fromDotenv.called, true);
      assert.strictEqual(JSON.stringify(fromDotenv).includes(dotenvToken), false);
      return dispatchUltramarine({
        force: true,
        task: 'earnings memo',
        credentials: { fireworks: true },
      }, cleanEnv, {
        readDotenv() { return ''; },
        keychainRead(item) { return item.service === 'FIREWORKS_API_KEY' ? keychainToken : ''; },
        async fetch(url, options) {
          assert.ok(String(url).includes('api.fireworks.ai'));
          assert.strictEqual(options.headers.Authorization, 'Bearer ' + keychainToken);
          return { status: 200 };
        },
      });
    }).then((fromKeychain) => {
      assert.strictEqual(fromKeychain.called, true);
      assert.strictEqual(JSON.stringify(fromKeychain).includes(keychainToken), false);
      return dispatchUltramarine({
        force: true,
        task: 'earnings memo',
        credentials: { 'ultramarine-api': true, fireworks: true },
      }, cleanEnv, {
        tokenFor() { return 'failover-token-not-real'; },
        async fetch(url) {
          if (String(url).includes('paperinstruments')) throw new Error('connection reset');
          return { status: 200 };
        },
      });
    }).then((failedOver) => {
      assert.strictEqual(failedOver.ok, true);
      assert.strictEqual(failedOver.selectedProvider.id, 'fireworks');
      assert.strictEqual(failedOver.attempts[0].error, 'request_failed');
      assert.strictEqual(JSON.stringify(failedOver).includes('connection reset'), false);
      assert.strictEqual(JSON.stringify(failedOver).includes('failover-token-not-real'), false);
      return dispatchUltramarine({
        force: true,
        task: 'earnings memo',
        credentials: { 'ultramarine-api': true },
      }, cleanEnv, {
        tokenFor() { return 'should-not-send'; },
      });
    }).then((noFetch) => {
      assert.strictEqual(noFetch.called, false);
      assert.strictEqual(JSON.stringify(noFetch).includes('should-not-send'), false);

    const cli = spawnSync(process.execPath, [path.join(__dirname, '../tools/ultramarine-flash-route.js'), '--status'], {
      env: cleanEnv,
      encoding: 'utf8',
    });
    assert.strictEqual(cli.status, 2);
    assert.ok(cli.stdout.includes('not configured'));
    assert.ok(cli.stdout.includes('paperinstruments/Ultramarine-1-Flash'));
    assert.ok(cli.stdout.includes('were not downloaded'));
    assert.ok(!cli.stdout.includes(secret));
    assert.ok(!cli.stdout.includes('$0.13'));
    console.log('test-ultramarine-flash-route: PASS');
    });
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
