#!/usr/bin/env node
'use strict';
// test-hermes-yolo-supervisor.js — P0 harness controls for hermes-yolo runs.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Supervisor, resume, readReceipt, readEvents, DEFAULT_POLICY } = require('../tools/hermes-yolo-supervisor.js');

const ROOT = path.join(os.tmpdir(), 'hermes-yolo-supervisor-test-' + Date.now());
process.env.HERMES_RUNS_DIR = path.join(ROOT, 'runs');
process.env.HERMES_LEASE_DIR = path.join(ROOT, 'leases');

function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }
function count(events, type) { return events.filter((e) => e.type === type).length; }
// Reset the host-wide lease dir so independent admission tests don't contend for the
// same light-job slots. Each test case claims its own lease; finalize/release is what
// frees them, but the earlier budget tests intentionally leave leases behind.
function resetLeases() {
  fs.rmSync(process.env.HERMES_LEASE_DIR, { recursive: true, force: true });
  fs.mkdirSync(process.env.HERMES_LEASE_DIR, { recursive: true });
}

async function main() {
  let pass = 0; let fail = 0;
  const ok = (m) => { console.log('  [PASS]', m); pass++; };
  const no = (m, e) => { console.log('  [FAIL]', m, e ? e.message : ''); fail++; };

  // Ensure the lease directory is empty for each test run to avoid cross-run admission contention.
  fs.rmSync(ROOT, { recursive: true, force: true });
  fs.mkdirSync(process.env.HERMES_LEASE_DIR, { recursive: true });

  try {
    // 1. Supervisor creates a run directory and policy receipt.
    const s = new Supervisor({ requestedModel: 'glm-coding', toolProfile: 'interactive-code' });
    const a = s.admit();
    if (a.ok && s.state === 'admitted' && fs.existsSync(path.join(process.env.HERMES_RUNS_DIR, s.runId, 'policy.json'))) {
      // Ensure the in-memory state object is not hiding failures by writing an empty policy; verify policy content.
      const policy = JSON.parse(fs.readFileSync(path.join(process.env.HERMES_RUNS_DIR, s.runId, 'policy.json')));
      if (policy.policyVersion === 1) ok('admit creates run dir + policy');
      else no('admit creates run dir + policy', new Error(JSON.stringify(a)));
    }
    else no('admit creates run dir + policy', new Error(JSON.stringify(a)));
  } catch (e) { no('admit creates run dir + policy', e); }

  try {
    // 2. Admission is denied when too many heavy jobs are in flight.
    const LEASE_DIR = process.env.HERMES_LEASE_DIR;
    fs.mkdirSync(LEASE_DIR, { recursive: true });
    fs.writeFileSync(path.join(LEASE_DIR, 'heavy-1.json'), JSON.stringify({ runId: 'heavy-1', acquiredAt: Date.now(), profile: 'build' }));
    fs.writeFileSync(path.join(LEASE_DIR, 'heavy-2.json'), JSON.stringify({ runId: 'heavy-2', acquiredAt: Date.now(), profile: 'build' }));
    // Set maxHeavyJobs to 2 so 2 pre-existing leases exactly exhaust the budget.
    const s = new Supervisor({ toolProfile: 'build', policy: { ...DEFAULT_POLICY, maxHeavyJobs: 2 } });
    const a = s.admit();
    if (!a.ok && a.reason.includes('heavy job admission denied')) ok('heavy admission control blocks overflow');
    else no('heavy admission control blocks overflow', new Error(JSON.stringify(a)));
    fs.rmSync(LEASE_DIR, { recursive: true, force: true });
  } catch (e) { no('heavy admission control blocks overflow', e); }

  // Test 2 writes its own heavy mocks and cleans up; reset leases before the light-budget tests.
  resetLeases();

  try {
    // 3. Tool-call budget is enforced.
    const s = new Supervisor({ policy: { ...DEFAULT_POLICY, maxToolCalls: 3 } });
    s.admit();
    s.checkTool('terminal', 'echo 1');
    s.checkTool('terminal', 'echo 2');
    s.checkTool('terminal', 'echo 3');
    const r = s.checkTool('terminal', 'echo 4');
    if (!r.allow && r.reason.includes('budget exceeded')) ok('tool-call budget enforced');
    else no('tool-call budget enforced', new Error(JSON.stringify(r)));
  } catch (e) { no('tool-call budget enforced', e); }

  try {
    // 4. Identical command retry ceiling is enforced.
    resetLeases();
    const s = new Supervisor({ policy: { ...DEFAULT_POLICY, maxIdenticalCommandAttempts: 2, maxCompileAttempts: 10 } });
    s.admit();
    s.checkTool('terminal', 'cargo check', '/tmp');
    s.checkTool('terminal', 'cargo check', '/tmp');
    const r = s.checkTool('terminal', 'cargo check', '/tmp');
    if (!r.allow && r.reason.includes('identical command retry ceiling')) ok('identical command retry ceiling enforced');
    else no('identical command retry ceiling enforced', new Error(JSON.stringify(r)));
  } catch (e) { no('identical command retry ceiling enforced', e); }

  try {
    // 5. Compile attempts are tracked separately.
    resetLeases();
    const s = new Supervisor({ policy: { ...DEFAULT_POLICY, maxCompileAttempts: 1 } });
    s.admit();
    s.checkTool('compile', 'cargo build');
    const r = s.checkTool('compile', 'cargo build');
    if (!r.allow && r.reason.includes('compile attempts exceeded')) ok('compile attempt ceiling enforced');
    else no('compile attempt ceiling enforced', new Error(JSON.stringify(r)));
  } catch (e) { no('compile attempt ceiling enforced', e); }

  try {
    // 6. Heartbeat events are emitted.
    resetLeases();
    const s = new Supervisor({ policy: { ...DEFAULT_POLICY, heartbeatSeconds: 0.05 } });
    s.admit();
    await delay(600);
    // Wait for an extra event-loop turn so setInterval callbacks can fire and fs flush completes.
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    const events = readEvents(s.runId);
    if (count(events, 'heartbeat') >= 2) ok('heartbeat events emitted');
    else no('heartbeat events emitted', new Error(`heartbeat count=${count(events, 'heartbeat')}`));
  } catch (e) { no('heartbeat events emitted', e); }

  try {
    // 7. Finalize writes a terminal receipt and releases lease.
    resetLeases();
    const s = new Supervisor({ toolProfile: 'interactive-code' });
    s.admit();
    s.fail('test failure');
    const r = readReceipt(s.runId);
    if (r.state === 'failed' && r.finishedAt && !fs.existsSync(path.join(process.env.HERMES_LEASE_DIR, `light-${s.runId}.json`))) ok('finalize writes receipt and releases lease');
    else no('finalize writes receipt and releases lease', new Error(JSON.stringify(r)));
  } catch (e) { no('finalize writes receipt and releases lease', e); }

  try {
    // 8. Resume restores state and policy.
    resetLeases();
    const s = new Supervisor({ requestedModel: 'kimi-for-coding', toolProfile: 'code' });
    s.admit();
    s.checkTool('terminal', 'ls');
    s.planning();
    const { ok: resOk, supervisor } = resume(s.runId);
    const r = readReceipt(s.runId);
    if (resOk && supervisor.state === 'planning' && supervisor.requestedModel === 'kimi-for-coding' && r.state === 'planning') ok('resume restores state and policy');
    else no('resume restores state and policy', new Error(JSON.stringify({ resOk, state: supervisor && supervisor.state, r })));
  } catch (e) { no('resume restores state and policy', e); }

  try {
    // 9. Process spawn + exit capture works.
    resetLeases();
    const s = new Supervisor({ policy: { ...DEFAULT_POLICY, heartbeatSeconds: 10 } });
    s.admit();
    const res = await s.spawnWorker('node', ['-e', 'console.log("hello")']);
    if (res.code === 0 && res.stdout.includes('hello')) ok('spawn worker captures stdout and exit');
    else no('spawn worker captures stdout and exit', new Error(JSON.stringify(res)));
  } catch (e) { no('spawn worker captures stdout and exit', e); }

  try {
    // 10. Continuation commands resolve in-memory and persist content-free lineage only.
    resetLeases();
    const s = new Supervisor({
      prompt: 'show receipts',
      contextMessages: [{ role: 'assistant', content: 'Private prior claim' }],
    });
    s.admit();
    const receipt = readReceipt(s.runId);
    const events = readEvents(s.runId);
    const durable = JSON.stringify({ receipt, events });
    if (
      s.getExecutionPrompt().includes('Audit the claims')
      && receipt.continuationCommand === 'show_receipts'
      && events.some((event) => event.type === 'continuation_resolved' && event.command === 'show_receipts')
      && !durable.includes('Private prior claim')
      && !durable.includes('Audit the claims')
      && resume(s.runId).supervisor.continuationCommand === 'show_receipts'
    ) ok('continuation prompt resolves with content-free durable lineage');
    else no('continuation prompt resolves with content-free durable lineage', new Error(durable));
    s.succeed();
  } catch (e) { no('continuation prompt resolves with content-free durable lineage', e); }

  fs.rmSync(ROOT, { recursive: true, force: true });
  console.log(`hermes-yolo supervisor: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
