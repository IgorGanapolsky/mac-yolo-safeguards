#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');

const repo = path.resolve(__dirname, '..');
const date = '2099-12-31';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'generated-artifact-routing-'));
const opsDir = path.join(temp, 'private-ops');
fs.mkdirSync(opsDir, { recursive: true });

function requireCli(script, args, spawnMock) {
  const originalArgv = process.argv;
  const originalSpawn = childProcess.spawnSync;
  const originalLog = console.log;
  const originalError = console.error;
  const originalExit = process.exit;
  const diagnostics = [];
  process.argv = [process.execPath, script].concat(args);
  childProcess.spawnSync = spawnMock;
  console.log = (...items) => diagnostics.push(items.join(' '));
  console.error = (...items) => diagnostics.push(items.join(' '));
  process.exit = (code) => {
    const error = new Error(`process.exit(${code})`);
    error.exitCode = code;
    throw error;
  };
  delete require.cache[require.resolve(script)];
  try {
    require(script);
  } catch (error) {
    if (error.exitCode !== undefined) {
      throw new Error(`${path.basename(script)} exited ${error.exitCode}: ${diagnostics.join('\n')}`);
    }
    throw error;
  } finally {
    process.argv = originalArgv;
    childProcess.spawnSync = originalSpawn;
    console.log = originalLog;
    console.error = originalError;
    process.exit = originalExit;
  }
}

try {
  for (const prefix of ['pipeline-status', 'prospects', 'stripe-offer-map']) {
    fs.writeFileSync(path.join(opsDir, `${prefix}-${date}.tsv`), 'fixture\n');
  }

  process.env.MAC_YOLO_OPS_DIR = opsDir;
  const commandCenterCalls = [];
  const commandCenter = path.join(repo, 'tools', 'revenue-command-center.js');
  requireCli(commandCenter, ['--date', date], (command, args) => {
    commandCenterCalls.push({ command, args: args.slice() });
    return { status: 0, stdout: '', stderr: '' };
  });

  const outputs = commandCenterCalls.flatMap(({ args }) => {
    const index = args.indexOf('--out');
    return index === -1 ? [] : [args[index + 1]];
  });
  assert.equal(outputs.length, 26, 'command center should route every report output');
  for (const output of outputs) {
    assert.equal(
      path.dirname(path.resolve(repo, output)),
      opsDir,
      `command-center output escaped private ops directory: ${output}`,
    );
  }
  assert.equal(
    fs.readdirSync(repo).filter((name) => name.includes(date)).length,
    0,
    'command center mock run must create zero dated files in the repository root',
  );

  const proposalDir = path.join(temp, 'proposal-output');
  fs.mkdirSync(proposalDir, { recursive: true });
  const closePlan = path.join(temp, 'close-target.md');
  fs.writeFileSync(closePlan, [
    '# Close target',
    '## Payment Handoff Commands',
    `node tools/proposal-plan.js --pipeline fake.tsv --prospect 'acme' --date '${date}' --buyer-segment test --source test --stripe-offer-map fake.tsv --out ignored.md`,
    '',
  ].join('\n'));
  const batchOut = path.join(proposalDir, `proposal-batch-plan-${date}.md`);
  const proposalBatch = path.join(repo, 'tools', 'proposal-batch-plan.js');
  requireCli(proposalBatch, [
    '--date', date,
    '--close-plan', closePlan,
    '--out', batchOut,
  ], (_command, args) => {
    const outIndex = args.lastIndexOf('--out');
    assert.notEqual(outIndex, -1, 'proposal child must receive --out');
    const childOut = args[outIndex + 1];
    fs.writeFileSync(childOut, [
      'Payment request status: READY',
      '- Price: $1500.00',
      '- Prior outreach action: queued via email',
      '- Prior send destination: mailto:test@example.com',
      '- Estimated Stripe fee at 2.9% + $0.30: $43.80',
      '- Estimated net after 35% reserve: $946.53',
      '## Payment Request Copy',
      'Subject: Test',
      'Body',
      'After proposal is sent:',
      '```sh',
      'echo sent',
      '```',
      'After Stripe payment clears:',
      '```sh',
      'echo cleared',
      '```',
      '',
    ].join('\n'));
    return { status: 0, stdout: '', stderr: '' };
  });
  assert.ok(fs.existsSync(batchOut), 'proposal batch report should be written');
  assert.ok(
    fs.existsSync(path.join(proposalDir, `proposal-plan-acme-${date}.md`)),
    'child proposal should stay beside the batch output',
  );
  assert.ok(
    !fs.existsSync(path.join(repo, `proposal-plan-acme-${date}.md`)),
    'child proposal must not leak into the repository root',
  );

  const hermesDir = path.join(temp, 'hermes-decisions');
  const hermesResult = childProcess.spawnSync(process.execPath, [
    path.join(repo, 'tools', 'hermes-decision-loop.js'),
    '--date', date,
    '--json',
  ], {
    cwd: repo,
    env: { ...process.env, MAC_YOLO_HERMES_DECISION_DIR: hermesDir },
    encoding: 'utf8',
    timeout: 30_000,
  });
  assert.ok([0, 1].includes(hermesResult.status), hermesResult.stderr || 'Hermes decision loop failed');
  assert.ok(fs.existsSync(path.join(hermesDir, `hermes-decision-${date}.md`)));
  assert.ok(fs.existsSync(path.join(hermesDir, `hermes-decisions-${date}.jsonl`)));
  assert.ok(!fs.existsSync(path.join(repo, `hermes-decision-${date}.md`)));
  assert.ok(!fs.existsSync(path.join(repo, `hermes-decisions-${date}.jsonl`)));

  console.log('generated artifact routing: 3/3 passed');
} finally {
  delete process.env.MAC_YOLO_OPS_DIR;
  fs.rmSync(temp, { recursive: true, force: true });
}
