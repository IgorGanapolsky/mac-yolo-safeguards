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
  assert.strictEqual(j.honesty.not_mock, true);

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
  assert.ok(tools.result.tools.some((t) => t.name === 'gurobi_solve_lp'));
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
