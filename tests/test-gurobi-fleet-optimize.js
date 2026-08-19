#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VENV_PY = path.join(os.homedir(), '.hermes/gurobi-venv/bin/python');
const PY = fs.existsSync(VENV_PY) ? VENV_PY : 'python3';
const CLI = path.join(ROOT, 'tools/gurobi-fleet-optimize.py');
const MCP = path.join(ROOT, 'tools/gurobi-mcp-server.py');

function runCli(args) {
  return spawnSync(PY, [CLI, ...args], {
    encoding: 'utf8',
    cwd: ROOT,
    env: { ...process.env, PYTHONPATH: path.join(ROOT, 'tools') },
    timeout: 60000,
  });
}

function main() {
  // license / availability
  let r = runCli(['license', '--json']);
  if (r.status !== 0) {
    const msg = (r.stderr || r.stdout || '').toString();
    if (process.env.GITHUB_ACTIONS === 'true' || process.env.CI === 'true') {
      console.log(
        'test-gurobi-fleet-optimize: SKIP (CI without gurobipy venv) —',
        msg.slice(0, 200),
      );
      return;
    }
    assert.fail(`license probe failed: ${msg}`);
  }
  let j = JSON.parse(r.stdout);
  if (!j.gurobipy_import_ok) {
    if (process.env.GITHUB_ACTIONS === 'true' || process.env.CI === 'true') {
      console.log('test-gurobi-fleet-optimize: SKIP (gurobipy not importable on CI)');
      return;
    }
    assert.fail(`gurobipy not importable: ${JSON.stringify(j)}`);
  }
  assert.strictEqual(j.gurobipy_import_ok, true);
  assert.ok(j.probe_ok);
  assert.ok(j.limits.max_vars === 2000);

  // evaluate suite
  r = runCli(['evaluate', '--json']);
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  j = JSON.parse(r.stdout);
  assert.strictEqual(j.ok, true, JSON.stringify(j.cases?.map((c) => [c.id, c.ok])));
  assert.strictEqual(j.passed, j.total);
  assert.strictEqual(j.total, 6);
  assert.strictEqual(j.honesty.not_mock, true);
  assert.strictEqual(j.honesty.certified_proof, true);
  const caseIds = (j.cases || []).map((c) => c.id);
  assert.ok(caseIds.includes('iis_conflict'));
  assert.ok(caseIds.includes('token_budget'));
  const lp = (j.cases || []).find((c) => c.id === 'lp_diet_style');
  assert.strictEqual(lp.result.proof.certified_optimal, true);
  assert.strictEqual(lp.result.proof.not_plausible_guess, true);
  assert.ok(Number.isFinite(lp.result.proof.obj_bound));
  const iisCase = (j.cases || []).find((c) => c.id === 'iis_conflict');
  assert.ok((iisCase.result.iis_constraints || []).includes('need_one'));
  const tb = (j.cases || []).find((c) => c.id === 'token_budget');
  assert.ok(tb.result.model_stats.allocated_spend_usd <= 10);

  // dispatch file
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gurobi-'));
  const jobs = {
    tasks: [
      { id: 't1', priority: 5, skill: 'code' },
      { id: 't2', priority: 9, skill: 'outreach' },
    ],
    agents: [
      { id: 'a1', capacity: 1, skills: ['code'] },
      { id: 'a2', capacity: 1, skills: ['outreach'] },
    ],
  };
  const jobsPath = path.join(tmp, 'jobs.json');
  fs.writeFileSync(jobsPath, JSON.stringify(jobs));
  r = runCli(['dispatch', '--file', jobsPath, '--json']);
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  j = JSON.parse(r.stdout);
  assert.strictEqual(j.ok, true);
  assert.ok(j.objective >= 14);
  assert.strictEqual(j.proof.certified_optimal, true);
  assert.strictEqual(j.proof.not_plausible_guess, true);

  // exclusive adb/git_lock: at most one assigned holder
  const exclusiveJobs = {
    tasks: [
      { id: 'e2e-a', priority: 9, exclusive: ['adb'] },
      { id: 'e2e-b', priority: 8, exclusive: ['adb'] },
      { id: 'lock-a', priority: 7, exclusive: ['git_lock'] },
    ],
    agents: [
      { id: 'mac', capacity: 3 },
      { id: 'mini', capacity: 3 },
    ],
  };
  const exclusivePath = path.join(tmp, 'exclusive.json');
  fs.writeFileSync(exclusivePath, JSON.stringify(exclusiveJobs));
  r = runCli(['dispatch', '--file', exclusivePath, '--json']);
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  j = JSON.parse(r.stdout);
  assert.strictEqual(j.ok, true);
  const assignedTasks = Object.keys(j.values || {}).map((k) => k.split('->')[0]);
  const adbAssigned = assignedTasks.filter((id) => id === 'e2e-a' || id === 'e2e-b');
  assert.strictEqual(adbAssigned.length, 1, `adb exclusive broken: ${JSON.stringify(j.values)}`);
  assert.ok(assignedTasks.includes('e2e-a'), 'higher-priority adb task should win');

  // bounce_risk > 5% skipped; vertical cap 2
  const prospects = {
    prospects: [
      { id: 'hot', score: 90, bounce_risk: 0.01, vertical: 'hvac' },
      { id: 'hot2', score: 88, bounce_risk: 0.02, vertical: 'hvac' },
      { id: 'hot3', score: 87, bounce_risk: 0.02, vertical: 'hvac' },
      { id: 'bouncy', score: 99, bounce_risk: 0.2, vertical: 'plumb' },
      { id: 'ok', score: 70, bounce_risk: 0.0, vertical: 'plumb' },
    ],
    capacity: 15,
  };
  const prospectsPath = path.join(tmp, 'prospects.json');
  fs.writeFileSync(prospectsPath, JSON.stringify(prospects));
  r = runCli(['outreach', '--file', prospectsPath, '--json']);
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  j = JSON.parse(r.stdout);
  assert.strictEqual(j.ok, true);
  assert.ok(!j.values.bouncy, `bounce filter failed: ${JSON.stringify(j.values)}`);
  const hvacPicked = ['hot', 'hot2', 'hot3'].filter((id) => j.values[id]).length;
  assert.ok(hvacPicked <= 2, `vertical cap broken: ${JSON.stringify(j.values)}`);
  assert.strictEqual(j.proof.certified_optimal, true);

  // IIS CLI
  const iisModel = {
    variables: [{ name: 'x', lb: 0, ub: 1 }],
    constraints: [
      { name: 'need_one', coeffs: { x: 1 }, sense: '>=', rhs: 1 },
      { name: 'forbid_one', coeffs: { x: 1 }, sense: '<=', rhs: 0 },
    ],
  };
  const iisPath = path.join(tmp, 'iis.json');
  fs.writeFileSync(iisPath, JSON.stringify(iisModel));
  r = runCli(['iis', '--file', iisPath, '--json']);
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  j = JSON.parse(r.stdout);
  assert.strictEqual(j.is_infeasible, true);
  assert.ok((j.iis_constraints || []).includes('need_one'));

  // token-budget CLI: $12 item cannot fit under $10
  const workloads = {
    monthly_budget_usd: 10,
    workloads: [
      { id: 'cheap', frontier_cost_usd: 2, local_score: 10, frontier_score: 90 },
      { id: 'huge', frontier_cost_usd: 12, local_score: 10, frontier_score: 99 },
    ],
  };
  const wlPath = path.join(tmp, 'workloads.json');
  fs.writeFileSync(wlPath, JSON.stringify(workloads));
  r = runCli(['token-budget', '--file', wlPath, '--json']);
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  j = JSON.parse(r.stdout);
  assert.strictEqual(j.ok, true);
  assert.ok(j.model_stats.allocated_spend_usd <= 10);
  assert.ok(j.values.huge !== 1, `spend ceiling broken: ${JSON.stringify(j.values)}`);
  assert.strictEqual(j.proof.certified_optimal, true);

  // MCP initialize + tools/list + evaluate via stdio lines
  const mcp = spawnSync(
    PY,
    [MCP],
    {
      encoding: 'utf8',
      cwd: ROOT,
      env: { ...process.env, PYTHONPATH: path.join(ROOT, 'tools') },
      input:
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
        }) +
        '\n' +
        JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) +
        '\n' +
        JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'gurobi_evaluate', arguments: {} },
        }) +
        '\n',
      timeout: 60000,
    },
  );
  assert.strictEqual(mcp.status, 0, mcp.stderr || mcp.stdout);
  const lines = mcp.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  assert.ok(lines.some((m) => m.id === 1 && m.result?.serverInfo?.name === 'gurobi-optimizer'));
  const tools = lines.find((m) => m.id === 2);
  const toolNames = (tools.result.tools || []).map((t) => t.name);
  assert.ok(toolNames.includes('gurobi_solve_lp'));
  assert.ok(toolNames.includes('gurobi_diagnose_iis'));
  assert.ok(toolNames.includes('gurobi_token_budget'));
  assert.ok(lines.some((m) => m.id === 1 && m.result?.serverInfo?.version === '1.1.0'));
  const evalMsg = lines.find((m) => m.id === 3);
  const evalBody = JSON.parse(evalMsg.result.content[0].text);
  assert.strictEqual(evalBody.ok, true);

  // anti-mock: ensure old mock strings not in server
  const serverSrc = fs.readFileSync(MCP, 'utf8');
  assert.ok(!serverSrc.includes('mockSolution'));
  assert.ok(!serverSrc.includes('Math.random'));

  console.log('test-gurobi-fleet-optimize: PASS');
}

main();
