'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const WRAPPER = path.resolve(__dirname, '..', 'coco-yolo-wrapper.js');
const {
  CONNECTION,
  buildCocoEnv,
  buildCortexArgs,
  buildReceipt,
  cocoDoctor,
  findPlanMode,
  parseConnectionRole,
  parseCortexVersion,
  permissionDenial,
  runAcpPrompt,
  runCoco,
  runCocoPrompt,
  safeCommandSummary,
  summarizeUserArgs,
  versionAtLeast,
  writeReceipt,
} = require(WRAPPER);

assert.strictEqual(parseCortexVersion('Cortex Code v1.1.27'), '1.1.27');
assert.strictEqual(parseCortexVersion('unknown'), null);
assert.strictEqual(versionAtLeast('1.1.27'), true);
assert.strictEqual(versionAtLeast('1.1.26'), false);
assert.strictEqual(versionAtLeast('1.2.0'), true);
assert.strictEqual(parseConnectionRole('| Role | ACCOUNTADMIN |'), 'ACCOUNTADMIN');
assert.deepStrictEqual(permissionDenial([
  { optionId: 'allow', kind: 'allow_once' },
  { optionId: 'reject', kind: 'reject_once' },
]), { outcome: 'selected', optionId: 'reject' });
assert.deepStrictEqual(findPlanMode({
  configOptions: [{
    id: 'mode', category: 'mode', options: [{ value: 'standard' }, { value: 'plan' }],
  }],
}), { kind: 'config', id: 'mode', value: 'plan' });

assert.deepStrictEqual(buildCortexArgs(['inspect Snowflake']), [
  '--connection', CONNECTION,
  '--sql-read-only',
  '--no-mcp',
  '--no-auto-update',
  'inspect Snowflake',
]);
for (const unsafe of [
  ['exec', 'query'],
  ['--goal', 'query'],
  ['--bypass'],
  ['--dangerously-allow-all-tool-calls'],
  ['--no-sql-read-only'],
  ['--mcp'],
  ['--connection', 'other'],
  ['--model=something'],
  ['--print', 'query'],
]) {
  assert.throws(() => buildCortexArgs(unsafe), /disabled|managed/);
}

const cleanEnv = buildCocoEnv({ KEEP: 'yes', SNOWFLAKE_HOME: '/tmp/snow-home' });
assert.strictEqual(cleanEnv.KEEP, 'yes');
assert.strictEqual(cleanEnv.SNOWFLAKE_HOME, '/tmp/snow-home');
assert.strictEqual(cleanEnv.CORTEX_CLIENT_READ_ONLY, '1');
assert.strictEqual(cleanEnv.COCO_YOLO, '1');

const summary = summarizeUserArgs(['private prompt words']);
assert.strictEqual(summary.kind, 'prompt');
assert.strictEqual(summary.argCount, 1);
assert(!JSON.stringify(summary).includes('private'));
const safeArgs = safeCommandSummary(buildCortexArgs(['private prompt words']));
assert(safeArgs.includes('<prompt>'));
assert(!JSON.stringify(safeArgs).includes('private'));

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'coco-yolo-test-'));
const snowHome = path.join(temp, 'snow-home');
const configPath = path.join(snowHome, 'config.toml');
const connectionsPath = path.join(snowHome, 'connections.toml');
fs.mkdirSync(snowHome, { recursive: true });
fs.writeFileSync(configPath, '[cli]\n', { mode: 0o600 });
fs.writeFileSync(connectionsPath, '[hermes-coco-readonly]\n', { mode: 0o600 });

const fakeCortex = path.join(temp, 'cortex');
const fakeSnow = path.join(temp, 'snow');
fs.writeFileSync(fakeCortex, `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "Cortex Code v1.1.27"
else
  printf 'CORTEX_ARG:%s\\n' "$@"
fi
`, { mode: 0o755 });
fs.writeFileSync(fakeSnow, `#!/bin/sh
echo '| Connection name | hermes-coco-readonly |'
echo '| Status | OK |'
echo '| Role | ACCOUNTADMIN |'
`, { mode: 0o755 });

const doctor = cocoDoctor({
  env: { SNOWFLAKE_HOME: snowHome },
  cortexBinary: fakeCortex,
  snowBinary: fakeSnow,
});
assert.strictEqual(doctor.ready, true);
assert.strictEqual(doctor.version, '1.1.27');
assert.strictEqual(doctor.connectionReady, true);
assert.strictEqual(doctor.effectiveRole, 'ACCOUNTADMIN');
assert.strictEqual(doctor.principalLeastPrivilege, false);
assert.strictEqual(doctor.sqlReadOnly, true);
assert.strictEqual(doctor.mcpEnabledInsideCoco, false);
assert.strictEqual(doctor.headlessExecVerified, false);

const receiptRoot = path.join(temp, 'receipts');
const latestPath = path.join(receiptRoot, 'latest.json');
const historyPath = path.join(receiptRoot, 'history.jsonl');
const run = runCoco(['private Snowflake prompt'], {
  binary: fakeCortex,
  env: { SNOWFLAKE_HOME: snowHome },
  stdio: 'pipe',
  receiptPaths: { latestPath, historyPath },
});
assert.strictEqual(run.exitCode, 0);
const stored = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
assert.strictEqual(stored.route.selectedBackend, 'snowflake-coco');
assert.strictEqual(stored.route.sqlReadOnly, true);
assert.strictEqual(stored.route.mcpEnabledInsideCoco, false);
assert.strictEqual(stored.route.silentFallback, false);
assert.strictEqual(stored.execution.status, 'pass');
assert(!JSON.stringify(stored).includes('private Snowflake prompt'));
assert.strictEqual(fs.statSync(latestPath).mode & 0o777, 0o600);
assert.strictEqual(fs.statSync(historyPath).mode & 0o777, 0o600);

const blockedLatest = path.join(receiptRoot, 'blocked.json');
const blockedHistory = path.join(receiptRoot, 'blocked.jsonl');
const blocked = runCoco(['exec', 'private query'], {
  binary: fakeCortex,
  env: { SNOWFLAKE_HOME: snowHome },
  receiptPaths: { latestPath: blockedLatest, historyPath: blockedHistory },
});
assert.strictEqual(blocked.exitCode, 2);
assert.strictEqual(blocked.receipt.execution.status, 'blocked');
assert(!JSON.stringify(blocked.receipt).includes('private query'));

const directReceiptPath = path.join(receiptRoot, 'direct.json');
const directHistoryPath = path.join(receiptRoot, 'direct.jsonl');
writeReceipt(buildReceipt({ userArgs: ['secret prompt'], status: 'pass', exitCode: 0 }), {
  latestPath: directReceiptPath,
  historyPath: directHistoryPath,
});
assert(!fs.readFileSync(directReceiptPath, 'utf8').includes('secret prompt'));

const doctorOutput = JSON.parse(execFileSync(process.execPath, [WRAPPER, '--doctor', '--json'], {
  encoding: 'utf8',
  env: {
    ...process.env,
    CORTEX_BIN: fakeCortex,
    SNOW_BIN: fakeSnow,
    SNOWFLAKE_HOME: snowHome,
  },
}));
assert.strictEqual(doctorOutput.ready, true);

const blockedCli = spawnSync(process.execPath, [WRAPPER, 'exec', 'unsafe'], {
  encoding: 'utf8',
  env: {
    ...process.env,
    CORTEX_BIN: fakeCortex,
    SNOW_BIN: fakeSnow,
    SNOWFLAKE_HOME: snowHome,
    COCO_YOLO_LATEST_RECEIPT_PATH: path.join(receiptRoot, 'cli-blocked.json'),
    COCO_YOLO_HISTORY_RECEIPT_PATH: path.join(receiptRoot, 'cli-blocked.jsonl'),
  },
});
assert.strictEqual(blockedCli.status, 2);
assert.match(blockedCli.stderr, /disabled/);

const fakeAcp = path.join(temp, 'fake-acp');
fs.writeFileSync(fakeAcp, `#!/usr/bin/env node
'use strict';
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
function send(message) { process.stdout.write(JSON.stringify(message) + '\\n'); }
rl.on('line', (line) => {
  const message = JSON.parse(line);
  if (message.method === 'initialize') {
    send({ jsonrpc: '2.0', id: message.id, result: {
      protocolVersion: 1,
      agentCapabilities: {},
      agentInfo: { name: 'fake-cortex', version: '1' },
      authMethods: [],
    }});
  } else if (message.method === 'session/new') {
    send({ jsonrpc: '2.0', id: message.id, result: {
      sessionId: 'fake-session',
      configOptions: [{
        id: 'mode', category: 'mode', currentValue: 'standard',
        options: [{ value: 'standard' }, { value: 'plan' }],
      }],
    }});
  } else if (message.method === 'session/set_config_option') {
    if (message.params.configId !== 'mode' || message.params.value !== 'plan') process.exit(3);
    send({ jsonrpc: '2.0', id: message.id, result: { configOptions: [] }});
  } else if (message.method === 'session/prompt') {
    send({ jsonrpc: '2.0', method: 'session/update', params: {
      sessionId: 'fake-session',
      update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'FAKE_ACP_OK' } },
    }});
    send({ jsonrpc: '2.0', id: message.id, result: { stopReason: 'end_turn' }});
  }
});
`, { mode: 0o755 });

(async () => {
  const acp = await runAcpPrompt('private prompt', {
    binary: fakeAcp,
    env: { ...process.env, SNOWFLAKE_HOME: snowHome },
    cwd: temp,
    timeoutMs: 5000,
  });
  assert.strictEqual(acp.text, 'FAKE_ACP_OK');
  assert.strictEqual(acp.stopReason, 'end_turn');
  assert.strictEqual(acp.mode, 'plan');
  assert.strictEqual(acp.protocolVersion, 1);

  const acpLatest = path.join(receiptRoot, 'acp.json');
  const acpHistory = path.join(receiptRoot, 'acp.jsonl');
  const acpRun = await runCocoPrompt(['private', 'prompt'], {
    acpRunner: async () => ({
      text: 'ACP WRAPPER OK',
      stopReason: 'end_turn',
      mode: 'plan',
      toolCalls: [],
      permissionRequestsDenied: 0,
    }),
    receiptPaths: { latestPath: acpLatest, historyPath: acpHistory },
  });
  assert.strictEqual(acpRun.exitCode, 0);
  assert.strictEqual(acpRun.text, 'ACP WRAPPER OK');
  const acpReceipt = JSON.parse(fs.readFileSync(acpLatest, 'utf8'));
  assert.strictEqual(acpReceipt.route.transport, 'acp');
  assert.strictEqual(acpReceipt.execution.readOnlyMode, 'plan');
  assert(!JSON.stringify(acpReceipt).includes('private prompt'));

  fs.rmSync(temp, { recursive: true, force: true });
  console.log('CoCo YOLO wrapper tests: PASS');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
