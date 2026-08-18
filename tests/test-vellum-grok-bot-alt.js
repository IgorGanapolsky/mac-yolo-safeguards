#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

process.env.VELLUM_BOT_SKIP_LIVE = '1';

const {
  VELLUM_MEMORY_TYPES,
  VELLUM_PRICING,
  compareProducts,
  memoryMap,
  identityPackContents,
  writeIdentityPack,
  inventoryHermes,
  promoteSpec,
  probeOfficialVellum,
  probeHermesAlt,
  runDoctor,
  scrubSecrets,
  main,
} = require('../tools/vellum-grok-bot-alt');
const { exampleSpec } = require('../tools/outcome-routine-spec');

async function run() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vellum-bot-alt-'));
  process.env.VELLUM_BOT_HOME = tmp;

  console.log('=== test-vellum-grok-bot-alt ===');

  const cmp = compareProducts();
  assert.strictEqual(cmp.competitor, true);
  assert.match(cmp.verdict, /YES/);
  assert.strictEqual(cmp.dualProduct.personalAssistant.license, 'MIT');
  assert.strictEqual(VELLUM_PRICING.mighty.usd, 30);
  assert.strictEqual(VELLUM_PRICING.super.usd, 100);
  assert.strictEqual(VELLUM_PRICING.ultra.usd, 200);
  assert.ok(cmp.hardBans.some((row) => /ThumbGate/i.test(row)));
  assert.ok(cmp.stealMatrix.length >= 6);
  console.log('  ✓ compare: competitor=true, Aug 2026 pricing, dual product');

  const mapped = memoryMap();
  assert.strictEqual(VELLUM_MEMORY_TYPES.length, 8);
  assert.deepStrictEqual(mapped.officialTypes, VELLUM_MEMORY_TYPES.slice());
  for (const tier of VELLUM_MEMORY_TYPES) {
    assert.ok(mapped.map[tier].hermes, tier);
  }
  console.log('  ✓ memory-map: official 8 types');

  const files = identityPackContents('2026-08-18T00:00:00.000Z');
  assert.ok(files['SOUL.md'].includes('not Igor'));
  assert.ok(files['IDENTITY.md'].includes('not_you: true'));
  const written = writeIdentityPack({
    dir: path.join(tmp, 'identity'),
    now: '2026-08-18T00:00:00.000Z',
  });
  assert.strictEqual(written.ok, true);
  assert.ok(fs.existsSync(path.join(tmp, 'identity', 'SOUL.md')));
  console.log('  ✓ identity-pack: not-you + write');

  const inv = inventoryHermes();
  assert.strictEqual(inv.upload, false);
  assert.ok(inv.count >= 4);
  assert.ok(inv.items.some((item) => item.kind === 'import_target' && item.upload === false));
  assert.ok(inv.items.filter((item) => item.kind !== 'import_target').every((item) => item.land === false));
  console.log('  ✓ inventory: land=false, no upload');

  const good = promoteSpec(exampleSpec(), { destDir: path.join(tmp, 'promoted') });
  assert.strictEqual(good.ok, true, JSON.stringify(good));
  assert.strictEqual(good.status, 'PROMOTED_DRAFT');
  assert.strictEqual(good.enabled, false);
  assert.ok(fs.existsSync(good.dest));

  const bad = promoteSpec({ skills: [{ name: 'only-name' }] }, { destDir: path.join(tmp, 'promoted') });
  assert.strictEqual(bad.ok, false);
  assert.strictEqual(bad.status, 'SPEC_INVALID');

  const untested = JSON.parse(JSON.stringify(exampleSpec()));
  untested.routines[0].test_run_required = false;
  const blocked = promoteSpec(untested, { destDir: path.join(tmp, 'promoted') });
  assert.strictEqual(blocked.ok, false);
  assert.strictEqual(blocked.status, 'TEST_RUN_REQUIRED');
  console.log('  ✓ promote: eval-gated, draft-only, untested refused');

  const hatch = path.join(tmp, 'hatch.log');
  fs.writeFileSync(hatch, 'INFO waitingForCredentials: true\n', 'utf8');
  const missingApp = await probeOfficialVellum({
    appPath: path.join(tmp, 'no-app'),
    lockfile: path.join(tmp, 'no-lock.json'),
    hatchLog: hatch,
    skipLive: true,
  });
  assert.strictEqual(missingApp.ready, false);
  assert.strictEqual(missingApp.status, 'NOT_INSTALLED');

  const waiting = await probeOfficialVellum({
    appPath: tmp,
    lockfile: path.join(tmp, 'no-lock.json'),
    hatchLog: hatch,
    skipLive: true,
  });
  assert.strictEqual(waiting.status, 'HATCHED_WAITING_CREDENTIALS');
  assert.strictEqual(waiting.ready, false);
  console.log('  ✓ official doctor: never READY while waitingForCredentials');

  const hermes = probeHermesAlt();
  assert.strictEqual(hermes.isOfficialVellumCloud, false);
  assert.strictEqual(hermes.isThumbgate, false);
  assert.strictEqual(hermes.spendUsd, 0);
  const doc = await runDoctor({
    official: { appPath: path.join(tmp, 'missing'), skipLive: true },
  });
  assert.strictEqual(doc.competitor, true);
  assert.strictEqual(doc.officialReady, false);
  assert.strictEqual(doc.viableAlternative, hermes.ready);
  const leaked = scrubSecrets({ guardianBootstrapSecret: 'abc', cloud: 'local' });
  assert.strictEqual(leaked.guardianBootstrapSecret, '[REDACTED]');
  assert.strictEqual(leaked.cloud, 'local');
  console.log('  ✓ doctor: Hermes $0 alt, official not faked ready');

  const bin = path.join(__dirname, '..', 'tools', 'vellum-grok-bot-alt.js');
  const help = spawnSync(process.execPath, [bin, 'help'], { encoding: 'utf8' });
  assert.strictEqual(help.status, 0);
  assert.match(help.stdout, /identity-pack/);
  const cli = spawnSync(process.execPath, [bin, 'compare'], {
    encoding: 'utf8',
    env: { ...process.env, VELLUM_BOT_SKIP_LIVE: '1' },
  });
  assert.strictEqual(cli.status, 0);
  assert.strictEqual(JSON.parse(cli.stdout).competitor, true);
  assert.strictEqual(await main(['help']), 0);
  console.log('  ✓ CLI compare + help');

  console.log('\n✅ test-vellum-grok-bot-alt PASSED');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
