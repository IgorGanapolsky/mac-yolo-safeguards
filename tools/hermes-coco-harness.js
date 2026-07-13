#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  CONNECTION,
  buildCocoEnv,
  cocoDoctor,
  findSnowBinary,
  redact,
} = require('../coco-yolo-wrapper');
const repoHermesWrapper = path.resolve(__dirname, '..', 'hermes-yolo-wrapper.js');
const installedHermesWrapper = path.join(os.homedir(), '.hermes', 'hermes-yolo-wrapper.js');
const { classifyBackend } = require(fs.existsSync(repoHermesWrapper) ? repoHermesWrapper : installedHermesWrapper);

const DEFAULT_OUT = path.join(os.homedir(), '.hermes', 'receipts', 'coco', 'latest.json');
const DEFAULT_HISTORY = path.join(os.homedir(), '.hermes', 'receipts', 'coco', 'history.jsonl');
const LIVE_MARKER = 'SNOWFLAKE_COCO_HARNESS_OK';

function randomId(length = 20) {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    task: 'Snowflake: show the HERMES analytics warehouse status',
    execute: false,
    paidOk: false,
    out: DEFAULT_OUT,
    json: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--task' || arg === '--prompt') options.task = requireValue(argv, ++index, arg);
    else if (arg === '--execute' || arg === '--live') options.execute = true;
    else if (arg === '--paid-ok') options.paidOk = true;
    else if (arg === '--out') options.out = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.help && !String(options.task).trim()) throw new Error('--task must not be empty');
  return options;
}

function executeReadOnlySmoke(options = {}, dependencies = {}) {
  const env = buildCocoEnv(options.env || process.env);
  const snowBinary = options.snowBinary || findSnowBinary(env);
  if (!snowBinary) {
    return {
      attempted: false,
      status: 'blocked',
      blocker: 'snow_cli_missing',
      exitCode: 127,
      markerObserved: false,
      durationMs: 0,
    };
  }
  const runner = dependencies.runner || spawnSync;
  const started = Date.now();
  const query = `SELECT '${LIVE_MARKER}' AS MARKER, CURRENT_ROLE() AS ROLE, CURRENT_WAREHOUSE() AS WAREHOUSE`;
  const result = runner(snowBinary, ['sql', '-c', CONNECTION, '-q', query], {
    encoding: 'utf8',
    timeout: 45000,
    maxBuffer: 1024 * 1024,
    env,
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  const exitCode = result.error ? 127 : result.status == null ? 1 : result.status;
  const markerObserved = output.includes(LIVE_MARKER);
  return {
    attempted: true,
    status: exitCode === 0 && markerObserved ? 'pass' : 'fail',
    blocker: exitCode === 0 && markerObserved ? null : 'read_only_snowflake_smoke_failed',
    exitCode,
    signal: result.signal || null,
    markerObserved,
    roleObserved: /\bACCOUNTADMIN\b/.test(output) ? 'ACCOUNTADMIN' : null,
    warehouseObserved: /\bHERMES_XS\b/.test(output) ? 'HERMES_XS' : null,
    durationMs: Date.now() - started,
    error: result.error ? redact(result.error.message) : exitCode === 0 ? null : redact(output),
  };
}

function buildHarness(options = {}, dependencies = {}) {
  const task = String(options.task || 'Snowflake: show the HERMES analytics warehouse status');
  const doctor = options.doctor || (dependencies.doctor || cocoDoctor)();
  const classification = (dependencies.classifier || classifyBackend)([task], { HERMES_YOLO_BACKEND: 'auto' });
  const routeReady = classification.selectedBackend === 'snowflake-coco';
  let execution = {
    attempted: false,
    status: 'ready_not_executed',
    blocker: null,
    exitCode: null,
    markerObserved: false,
    durationMs: 0,
  };
  if (!doctor.ready) {
    execution = { ...execution, status: 'blocked', blocker: doctor.blocker || 'coco_doctor_failed' };
  } else if (!routeReady) {
    execution = { ...execution, status: 'blocked', blocker: 'prompt_did_not_route_to_snowflake_coco' };
  } else if (options.execute && !options.paidOk) {
    execution = { ...execution, status: 'blocked', blocker: 'live_snowflake_query_requires_paid_ok' };
  } else if (options.execute) {
    execution = executeReadOnlySmoke(options, dependencies);
  }

  return {
    schema: 'hermes-coco-harness/v1',
    generatedAt: options.now || new Date().toISOString(),
    host: options.host || os.hostname(),
    taskRunId: randomId(),
    route: {
      requestedBackend: classification.requestedBackend,
      selectedBackend: classification.selectedBackend,
      reason: classification.reason,
      automatic: true,
      silentFallback: false,
      qwenSelected: false,
    },
    doctor,
    controls: {
      connection: CONNECTION,
      sqlReadOnly: true,
      mcpEnabledInsideCoco: false,
      promptStored: false,
      cachedMachineLocalAuth: true,
      principalLeastPrivilege: Boolean(doctor.principalLeastPrivilege),
      policyBoundary: doctor.policyBoundary || null,
    },
    billing: {
      warehouse: 'HERMES_XS',
      size: 'X-Small',
      autoSuspendSeconds: 60,
      liveExecutionRequiresPaidOk: true,
      paidApprovalPresent: Boolean(options.paidOk),
      autoTopUpChangedByHarness: false,
    },
    execution,
    overallStatus: execution.status,
  };
}

function writeReceipt(receipt, target = DEFAULT_OUT, historyTarget = DEFAULT_HISTORY) {
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.dirname(historyTarget), { recursive: true, mode: 0o700 });
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, serialized, { mode: 0o600 });
  fs.renameSync(temporary, target);
  fs.appendFileSync(historyTarget, `${JSON.stringify(receipt)}\n`, { mode: 0o600 });
  fs.chmodSync(target, 0o600);
  fs.chmodSync(historyTarget, 0o600);
  return target;
}

function usage() {
  return `Usage:
  hermes-coco --task "Snowflake: inspect warehouse usage" --json
  hermes-coco --task "SQL: SELECT ..." --execute --paid-ok --json

Default mode verifies the automatic route without a model or warehouse call.
--execute performs one bounded read-only SQL marker query; it requires
--paid-ok because Snowflake warehouse usage can consume credits.`;
}

function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`hermes-coco: ${redact(error.message)}`);
    return 2;
  }
  if (options.help) {
    console.log(usage());
    return 0;
  }
  const receipt = buildHarness(options);
  writeReceipt(receipt, options.out, options.out === DEFAULT_OUT ? DEFAULT_HISTORY : `${options.out}.history.jsonl`);
  if (options.json) console.log(JSON.stringify(receipt, null, 2));
  else console.log(`hermes-coco: ${receipt.overallStatus}`);
  return ['pass', 'ready_not_executed'].includes(receipt.overallStatus) ? 0 : 2;
}

if (require.main === module) process.exit(main());

module.exports = {
  DEFAULT_HISTORY,
  DEFAULT_OUT,
  LIVE_MARKER,
  buildHarness,
  executeReadOnlySmoke,
  main,
  parseArgs,
  randomId,
  usage,
  writeReceipt,
};
