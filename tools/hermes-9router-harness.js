#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

function resolveWrapper() {
  const candidates = [
    path.resolve(__dirname, '..', '9router-yolo'),
    path.join(os.homedir(), '.hermes', '9router', 'bin', '9router-yolo'),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error('9router-yolo wrapper is missing');
  return require(found);
}

const DEFAULT_OUT = path.join(os.homedir(), '.hermes', 'receipts', 'hermes-9router', 'latest.json');
const DEFAULT_HISTORY = path.join(os.homedir(), '.hermes', 'receipts', 'hermes-9router', 'history.jsonl');

function randomId() {
  return crypto.randomBytes(10).toString('hex');
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    task: '',
    execute: false,
    json: false,
    help: false,
    out: DEFAULT_OUT,
  };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--task' || arg === '--prompt') {
      if (!argv[index + 1]) throw new Error(`${arg} requires a value`);
      options.task = argv[++index];
    } else if (arg === '--execute' || arg === '--live') options.execute = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--out') {
      if (!argv[index + 1]) throw new Error('--out requires a value');
      options.out = path.resolve(argv[++index]);
    } else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg.startsWith('-')) throw new Error(`unknown argument: ${arg}`);
    else positional.push(arg);
  }
  if (!options.task && positional.length > 0) options.task = positional.join(' ');
  if (!options.help && options.execute && !options.task.trim()) throw new Error('execution requires a prompt');
  return options;
}

function writeReceipt(receipt, target = DEFAULT_OUT, history = DEFAULT_HISTORY) {
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.dirname(history), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, target);
  fs.appendFileSync(history, `${JSON.stringify(receipt)}\n`, { mode: 0o600 });
  fs.chmodSync(target, 0o600);
  fs.chmodSync(history, 0o600);
}

async function runHarness(options = {}, dependencies = {}) {
  const wrapper = dependencies.wrapper || resolveWrapper();
  const doctor = options.doctor || await (dependencies.doctor || wrapper.doctor)();
  let execution = {
    attempted: false,
    status: doctor.ready ? 'ready_not_executed' : 'blocked',
    blocker: doctor.ready ? null : '9router_doctor_failed',
    durationMs: 0,
    markerObserved: false,
  };
  let text = '';
  if (options.execute && doctor.ready) {
    const started = Date.now();
    try {
      const result = await (dependencies.chat || wrapper.chat)(options.task);
      text = result.text;
      execution = {
        attempted: true,
        status: 'pass',
        blocker: null,
        durationMs: Date.now() - started,
        markerObserved: text === 'HERMES_9ROUTER_OK',
        upstreamReceiptSchema: result.receipt?.schema || null,
      };
    } catch (error) {
      execution = {
        attempted: true,
        status: 'fail',
        blocker: '9router_execution_failed',
        durationMs: Date.now() - started,
        markerObserved: false,
        error: String(error.message).slice(0, 160),
      };
    }
  }
  const receipt = {
    schema: 'hermes-9router-harness/v1',
    generatedAt: options.now || new Date().toISOString(),
    host: options.host || os.hostname(),
    taskRunId: randomId(),
    route: {
      requestedBackend: '9router-local',
      selectedBackend: doctor.route?.provider === 'ollama-local' ? '9router-local' : null,
      model: doctor.route?.model || null,
      explicit: true,
      automatic: false,
      silentFallback: false,
      defaultHermesRouteChanged: false,
    },
    controls: {
      loopbackOnly: doctor.server?.loopbackOnly === true,
      localProviderOnly: doctor.controls?.nonLocalProviderCount === 0,
      credentialMigration: false,
      tunnelEnabled: doctor.controls?.tunnelEnabled === true,
      rtkEnabled: doctor.controls?.rtkEnabled === true,
      promptStored: false,
      responseStored: false,
    },
    doctor: {
      ready: doctor.ready === true,
      blockers: doctor.blockers || [],
      upstreamVersion: doctor.upstream?.version || null,
      integrityVerified: doctor.upstream?.integrityVerified === true,
      rssMb: doctor.server?.rssMb ?? null,
    },
    execution,
    overallStatus: execution.status,
  };
  return { receipt, text };
}

function usage() {
  return `Usage:
  hermes-9router "prompt"
  hermes-9router --doctor --json
  node tools/hermes-9router-harness.js --task "prompt" --execute [--json]

This is an explicit local Hermes route. It never replaces hermes-yolo's default
provider, silently falls back, migrates credentials, or exposes 9Router remotely.`;
}

async function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`hermes-9router: ${error.message}`);
    return 2;
  }
  if (options.help) {
    console.log(usage());
    return 0;
  }
  const result = await runHarness(options);
  const history = options.out === DEFAULT_OUT ? DEFAULT_HISTORY : `${options.out}.history.jsonl`;
  writeReceipt(result.receipt, options.out, history);
  if (options.json) console.log(JSON.stringify(result.receipt, null, 2));
  else if (result.text) console.log(result.text);
  else console.log(`hermes-9router: ${result.receipt.overallStatus}`);
  return ['pass', 'ready_not_executed'].includes(result.receipt.overallStatus) ? 0 : 2;
}

if (require.main === module) {
  main().then((code) => { process.exitCode = code; });
}

module.exports = {
  DEFAULT_HISTORY,
  DEFAULT_OUT,
  main,
  parseArgs,
  randomId,
  resolveWrapper,
  runHarness,
  usage,
  writeReceipt,
};
