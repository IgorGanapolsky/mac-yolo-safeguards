#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mac-yolo-artifact-routing-'));
const date = '2099-01-02';

try {
  const decision = spawnSync(process.execPath, [
    'tools/hermes-decision-loop.js',
    '--date',
    date,
    '--json',
  ], {
    cwd: root,
    env: { ...process.env, MAC_YOLO_OPS_DIR: temp },
    encoding: 'utf8',
    timeout: 60_000,
  });

  assert(
    decision.status === 0 || decision.status === 1,
    decision.stderr || decision.stdout,
  );
  assert(fs.existsSync(path.join(temp, `hermes-decisions-${date}.jsonl`)));
  assert(fs.existsSync(path.join(temp, `hermes-decision-${date}.md`)));
  assert(!fs.existsSync(path.join(root, `hermes-decisions-${date}.jsonl`)));
  assert(!fs.existsSync(path.join(root, `hermes-decision-${date}.md`)));

  const commandCenter = fs.readFileSync(path.join(root, 'tools/revenue-command-center.js'), 'utf8');
  assert(commandCenter.includes('function reportPath(prefix, date)'));
  assert(commandCenter.includes('return defaultOut(`${prefix}-${date}.md`)'));
  assert(!/--out['"],\s*\n\s*`[^`]+\$\{dataDate\}\.md`/.test(commandCenter));
  assert(commandCenter.includes('const source = resolveDataPath'));

  const proposalBatch = fs.readFileSync(path.join(root, 'tools/proposal-batch-plan.js'), 'utf8');
  assert(proposalBatch.includes('const out = defaultOut(`proposal-plan-'));
  assert(proposalBatch.includes('args.closePlan = resolveDataPath'));

  console.log('PASS root artifact routing: Hermes behavioral proof + command-center contract');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
