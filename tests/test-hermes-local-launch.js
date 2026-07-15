#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  parseArgs,
  listModelNames,
  pickHermesSafeModel,
  synthesizeReport,
  run,
} = require('../tools/hermes-local-launch');

let n = 0;
function check(label, fn) {
  const ret = fn();
  if (ret && typeof ret.then === 'function') {
    return ret.then(() => {
      n += 1;
      console.log(`  ok - ${label}`);
    });
  }
  n += 1;
  console.log(`  ok - ${label}`);
  return undefined;
}

async function main() {
  await check('parseArgs defaults', () => {
    const a = parseArgs([]);
    assert.strictEqual(a.install, false);
    assert.strictEqual(a.json, false);
  });

  await check('parseArgs install+json', () => {
    const a = parseArgs(['--install', '--json']);
    assert.strictEqual(a.install, true);
    assert.strictEqual(a.json, true);
  });

  await check('listModelNames + pickHermesSafeModel prefers hermes-64k', () => {
    const names = listModelNames({
      models: [{ name: 'llama3.2:3b' }, { name: 'qwen3.5:9b-hermes-64k' }, { name: 'qwen2.5:3b' }],
    });
    assert.deepStrictEqual(names, ['llama3.2:3b', 'qwen3.5:9b-hermes-64k', 'qwen2.5:3b']);
    assert.strictEqual(pickHermesSafeModel(names), 'qwen3.5:9b-hermes-64k');
    assert.strictEqual(pickHermesSafeModel(['llama3.2:3b']), null);
  });

  await check('synthesizeReport ready path', () => {
    const r = synthesizeReport({
      ollamaBin: '/opt/homebrew/bin/ollama',
      ollamaApiOk: true,
      modelNames: ['qwen3.5:9b-hermes-64k'],
      preferredModel: 'qwen3.5:9b-hermes-64k',
      zeroSpend: { markerPresent: true, markerPath: '/tmp/NO_PAID_SPEND' },
      openclaw: { running: false, lines: [] },
      hermesGateway: { running: true, lines: ['123 hermes gateway'] },
      wantInstall: false,
    });
    assert.strictEqual(r.ready, true);
    assert.strictEqual(r.zeroSpendActive, true);
    assert.ok(r.checks.every((c) => c.ok || c.id === 'dual_gateway_risk'));
  });

  await check('synthesizeReport fails dual gateway + missing model', () => {
    const r = synthesizeReport({
      ollamaBin: '/opt/homebrew/bin/ollama',
      ollamaApiOk: true,
      modelNames: ['llama3.2:3b'],
      preferredModel: null,
      zeroSpend: { markerPresent: false },
      openclaw: { running: true, lines: ['999 openclaw gateway'] },
      hermesGateway: { running: true, lines: ['123 hermes'] },
      wantInstall: false,
    });
    assert.strictEqual(r.ready, false);
    const dual = r.checks.find((c) => c.id === 'dual_gateway_risk');
    assert.ok(dual && dual.ok === false);
    assert.ok(r.nextSteps.some((s) => /Telegram bot/i.test(s)));
  });

  await check('run() status with injected liveInputs is deterministic', async () => {
    const payload = await run(['--status', '--json'], {
      liveInputs: {
        ollamaBin: '/bin/ollama',
        ollamaApiOk: true,
        modelNames: ['qwen3:8b-64k'],
        preferredModel: 'qwen3:8b-64k',
        zeroSpend: { markerPresent: true, markerPath: '/x' },
        openclaw: { running: false, lines: [] },
        hermesGateway: { running: false, lines: [] },
        wantInstall: false,
      },
    });
    assert.strictEqual(payload.exitCode, 0);
    assert.strictEqual(payload.ok, true);
    assert.strictEqual(payload.preferredModel, 'qwen3:8b-64k');
    assert.match(payload.docs.positioning, /OPENCLAW-VS-HERMES/);
    assert.ok(payload.productNote.toLowerCase().includes('approve'));
  });

  await check('run() install records installResult without dual-gateway false positive', async () => {
    const payload = await run(['--install'], {
      liveInputs: {
        ollamaBin: '/bin/ollama',
        ollamaApiOk: true,
        modelNames: ['qwen3.5:9b-hermes-64k'],
        preferredModel: 'qwen3.5:9b-hermes-64k',
        zeroSpend: { markerPresent: true, markerPath: '/x' },
        openclaw: { running: false, lines: [] },
        hermesGateway: { running: false, lines: [] },
        wantInstall: true,
      },
      runZeroSpendInstall: () => ({ exitCode: 0, stdout: 'ok', stderr: '' }),
    });
    assert.strictEqual(payload.mode, 'install');
    assert.strictEqual(payload.install.exitCode, 0);
    assert.strictEqual(payload.ok, true);
  });

  console.log(`\nPASS ${n}/${n} hermes-local-launch`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
