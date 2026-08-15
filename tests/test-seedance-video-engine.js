#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  MAX_DURATION_SECONDS,
  MAX_MULTIMODAL_REFERENCES,
  OFFICIAL_BROADWAY_PROMPT,
  STARTER_PROMPTS,
  SeedanceVideoEngine,
  parseSeedanceArgs,
  runSeedanceCommand,
} = require('../tools/seedance-video-engine');

const REPO_ROOT = path.resolve(__dirname, '..');

function tmpEngine() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seedance-'));
  return {
    dir,
    engine: new SeedanceVideoEngine({
      stateDir: dir,
      jobsPath: path.join(dir, 'jobs.json'),
      apiKey: null,
      spentUsd: 0,
    }),
  };
}

function run() {
  const { dir, engine } = tmpEngine();

  const starter = STARTER_PROMPTS['broadway-trapeze'];
  assert.strictEqual(starter.duration, 30);
  assert.strictEqual(starter.aspectRatio, '16:9');
  assert.ok(starter.prompt.includes('Broadway trapeze'));
  assert.ok(starter.prompt.includes('golden grid'));
  assert.strictEqual(starter.prompt, OFFICIAL_BROADWAY_PROMPT);
  console.log('PASS 1 official BytePlus Broadway starter prompt');

  const empty = engine.stageVideoJob({});
  assert.strictEqual(empty.spec.duration, 30);
  assert.strictEqual(empty.spec.aspectRatio, '16:9');
  assert.strictEqual(empty.manifest.status, 'STAGED');
  assert.strictEqual(empty.manifest.outputVideoUri, null);
  assert.ok(empty.manifest.parameters.rawPrompt.includes('Broadway trapeze'));
  console.log('PASS 2 empty create = 30s official prompt, STAGED not fake-render');

  const refs = Array.from({ length: 5 }, (_, i) => path.join(dir, `missing-${i}.png`));
  const withRefs = engine.generateVideoJob('two trapeze artists', {
    duration: 30,
    aspectRatio: '9:16',
    references: refs,
  });
  assert.strictEqual(withRefs.parameters.durationSeconds, 30);
  assert.strictEqual(withRefs.multimodalReferences.maxSupported, MAX_MULTIMODAL_REFERENCES);
  assert.strictEqual(withRefs.multimodalReferences.items.length, 5);
  assert.strictEqual(withRefs.multimodalReferences.items[0].status, 'MISSING');
  assert.throws(
    () => engine.bindMultimodalReferences(Array.from({ length: 51 }, (_, i) => `/tmp/r${i}.png`)),
    /Exceeded maximum multimodal references/,
  );
  console.log('PASS 3 50-ref cap + missing refs are not BOUND');

  const existing = path.join(dir, 'hero.png');
  fs.writeFileSync(existing, 'png');
  const bound = engine.bindMultimodalReferences([existing]);
  assert.strictEqual(bound[0].status, 'BOUND');
  console.log('PASS 4 existing ref is BOUND');

  assert.throws(
    () => engine.generateVideoJob('x', { apply: true, apiKey: null }),
    /refusing --apply/,
  );
  const paid = new SeedanceVideoEngine({
    stateDir: dir,
    jobsPath: path.join(dir, 'jobs.json'),
    apiKey: 'test-key',
    spentUsd: 10,
  });
  assert.throws(() => paid.generateVideoJob('x', { apply: true }), /refusing --apply/);
  console.log('PASS 5 --apply fail-closed at $10 / missing key');

  const revision = engine.reviseVideoJob(empty.jobId, {
    timeRange: '12s-18s',
    revisionPrompt: 'hands glow gold on the miss',
  });
  assert.strictEqual(revision.parentJobId, empty.jobId);
  assert.strictEqual(revision.precisionEditing.timeRange, '12s-18s');
  assert.strictEqual(revision.precisionEditing.reRenderFullVideo, false);
  assert.strictEqual(revision.status, 'STAGED_REVISION');
  assert.strictEqual(revision.outputVideoUri, null);
  assert.throws(() => engine.reviseVideoJob(empty.jobId, { timeRange: '28s-40s', revisionPrompt: 'x' }), /outside/);
  assert.throws(() => engine.reviseVideoJob('nope', { revisionPrompt: 'x' }), /unknown Seedance job/);
  console.log('PASS 6 precision revise 12s-18s, no full re-render');

  const parsed = parseSeedanceArgs(['video', '--duration', '30', '--aspect', '16:9', '--refs', existing, 'trapeze']);
  assert.strictEqual(parsed.command, 'create');
  assert.strictEqual(parsed.duration, 30);
  assert.deepStrictEqual(parsed.references, [existing]);
  const routed = runSeedanceCommand(['video'], { engine });
  assert.strictEqual(routed.exitCode, 0);
  assert.strictEqual(routed.payload.manifest.parameters.durationSeconds, MAX_DURATION_SECONDS);
  console.log('PASS 7 seed-yolo video args parse + empty default');

  const cli = path.join(REPO_ROOT, 'bin', 'seedance');
  const starterCli = spawnSync(cli, ['starter', '--json'], { encoding: 'utf8' });
  assert.strictEqual(starterCli.status, 0, starterCli.stderr);
  const starterJson = JSON.parse(starterCli.stdout);
  assert.ok(starterJson['broadway-trapeze'].prompt.includes('golden grid'));

  const doctorCli = spawnSync(cli, ['doctor', '--json'], { encoding: 'utf8' });
  assert.strictEqual(doctorCli.status, 0, doctorCli.stderr);
  const doctorJson = JSON.parse(doctorCli.stdout);
  assert.strictEqual(doctorJson.capabilities.maxOutputSeconds, 30);
  assert.strictEqual(doctorJson.capabilities.maxMultimodalReferences, 50);
  assert.strictEqual(doctorJson.budgetGuard.allowPaid, false);
  console.log('PASS 8 seedance CLI doctor+starter');

  const wrapper = path.join(REPO_ROOT, 'tools', 'seed-yolo-wrapper.js');
  const videoCli = spawnSync(process.execPath, [wrapper, 'video', '--json'], {
    encoding: 'utf8',
    timeout: 8000,
    env: { ...process.env, SEEDANCE_STATE_DIR: dir },
  });
  assert.strictEqual(videoCli.status, 0, videoCli.stderr);
  const videoJson = JSON.parse(videoCli.stdout);
  assert.ok(videoJson.jobId.startsWith('JOB-SEEDANCE-'));
  assert.strictEqual(videoJson.spec.duration, 30);
  assert.strictEqual(videoJson.manifest.status, 'STAGED');
  assert.strictEqual(videoJson.manifest.outputVideoUri, null);
  console.log('PASS 9 seed-yolo video --json stages official 30s job');

  fs.rmSync(dir, { recursive: true, force: true });
  console.log('\nALL SEEDANCE 2.5 / SEED-YOLO VIDEO TESTS PASSED (9/9)');
}

run();
