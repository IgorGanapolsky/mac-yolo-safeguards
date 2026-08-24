'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  catalog,
  evaluateCall,
  attributeWorkflow,
  PERSONAS,
  SERVER_POLICY,
} = require('../tools/mcp-persona-entitlements.js');

const BIN = path.join(__dirname, '..', 'tools', 'mcp-persona-entitlements.js');

test('catalog lists .mcp.json servers with write-risk and does not invent TrueFoundry product', () => {
  const cat = catalog();
  assert.equal(cat.ok, true);
  assert.equal(cat.product, 'not-truefoundry');
  const names = cat.servers.map((s) => s.name).sort();
  assert.deepEqual(names, ['context7', 'github', 'grepai', 'gurobi', 'semrush'].sort());
  const github = cat.servers.find((s) => s.name === 'github');
  assert.equal(github.writeRisk, 'contained-write');
  const grepai = cat.servers.find((s) => s.name === 'grepai');
  assert.equal(grepai.writeRisk, 'read-only');
  const semrush = cat.servers.find((s) => s.name === 'semrush');
  assert.equal(semrush.paid, true);
  assert.equal(SERVER_POLICY.gurobi.writeRisk, 'read-only');
  assert.ok(PERSONAS.junior.maxWriteRisk === 'read-only');
});

test('junior/guest get read-only GitHub; operator write GitHub; guest cannot Semrush', () => {
  const juniorWrite = evaluateCall({ persona: 'junior', server: 'github', action: 'write' });
  assert.equal(juniorWrite.allow, false);
  assert.equal(juniorWrite.reason, 'write_risk_denied');

  const juniorRead = evaluateCall({ persona: 'junior', server: 'github', action: 'read' });
  assert.equal(juniorRead.allow, true);

  const operatorWrite = evaluateCall({ persona: 'operator', server: 'github', action: 'write' });
  assert.equal(operatorWrite.allow, true);

  const guestSemrush = evaluateCall({ persona: 'guest', server: 'semrush', action: 'read' });
  assert.equal(guestSemrush.allow, false);
  assert.equal(guestSemrush.reason, 'paid_api_denied');

  const operatorSemrush = evaluateCall({ persona: 'operator', server: 'semrush', action: 'read' });
  assert.equal(operatorSemrush.allow, true);
});

test('gmail send is critical; operator denied; admin allowed; unknown server fail-closed', () => {
  const opSend = evaluateCall({ persona: 'operator', server: 'gmail', action: 'write', tool: 'send' });
  assert.equal(opSend.allow, false);
  assert.equal(opSend.writeRisk, 'critical');

  const adminSend = evaluateCall({ persona: 'admin', server: 'gmail', action: 'write', tool: 'send' });
  assert.equal(adminSend.allow, true);

  const draft = evaluateCall({ persona: 'operator', server: 'gmail', action: 'write', tool: 'draft' });
  assert.equal(draft.allow, true);

  const unknown = evaluateCall({ persona: 'admin', server: 'not-a-server', action: 'read' });
  assert.equal(unknown.allow, false);
  assert.equal(unknown.reason, 'unknown_server');

  const bogusPersona = evaluateCall({ persona: 'intern', server: 'github', action: 'read' });
  assert.equal(bogusPersona.reason, 'unknown_persona');
});

test('workflow attributes cost only for allowed steps and does not invent dollars', () => {
  const wf = attributeWorkflow(
    [
      { server: 'grepai', action: 'read', costUsd: 1 },
      { server: 'github', action: 'write', costUsd: 2 },
      { server: 'gmail', action: 'write', tool: 'send', costUsd: 9.99 },
      { server: 'context7', action: 'read' },
    ],
    { persona: 'operator' },
  );
  assert.equal(wf.stepCount, 4);
  assert.equal(wf.deniedCount, 1);
  assert.equal(wf.allowedCount, 3);
  assert.equal(wf.totalUsd, 3);
  assert.equal(wf.byServer.grepai, 1);
  assert.equal(wf.byServer.github, 2);
  assert.equal(wf.byServer.gmail, undefined);
});

test('CLI catalog/evaluate/workflow JSON and guest write GitHub exits 2', () => {
  const cat = spawnSync(process.execPath, [BIN, 'catalog', '--json'], { encoding: 'utf8' });
  assert.equal(cat.status, 0, cat.stderr);
  const parsed = JSON.parse(cat.stdout);
  assert.equal(parsed.ok, true);
  assert.ok(parsed.servers.some((s) => s.name === 'github'));

  const denied = spawnSync(process.execPath, [
    BIN, 'evaluate', '--json', '--persona', 'guest', '--server', 'github', '--action', 'write',
  ], { encoding: 'utf8' });
  assert.equal(denied.status, 2);
  assert.equal(JSON.parse(denied.stdout).allow, false);

  const wf = spawnSync(process.execPath, [
    BIN, 'workflow', '--json', '--persona', 'admin',
    '--steps', JSON.stringify([{ server: 'grepai', action: 'read', costUsd: 0.5 }]),
  ], { encoding: 'utf8' });
  assert.equal(wf.status, 0, wf.stderr);
  assert.equal(JSON.parse(wf.stdout).totalUsd, 0.5);
});

test('does not write Codex AGENT-498 action-trace file and does not clone a gateway', () => {
  const src = fs.readFileSync(BIN, 'utf8');
  assert.doesNotMatch(src, /agent-action-traces\.jsonl/);
  assert.match(src, /not an OAuth gateway/);
  assert.match(src, /not Okta\/Azure AD, not a Virtual MCP/);
  assert.doesNotMatch(src, /CreateMcpServer|UseMcpServer/);
  const tracePath = path.join(os.homedir(), '.mac-yolo-safeguards', 'harness-router', 'agent-action-traces.jsonl');
  const before = fs.existsSync(tracePath) ? fs.statSync(tracePath).mtimeMs : 0;
  evaluateCall({ persona: 'guest', server: 'github', action: 'read' });
  const after = fs.existsSync(tracePath) ? fs.statSync(tracePath).mtimeMs : 0;
  assert.equal(after, before);
});
