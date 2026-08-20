'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  inventoryEndpointPosture,
  scoreMcpServer,
  scoreSkill,
  bandFor,
} = require('../tools/island-endpoint-posture');

test('bandFor thresholds', () => {
  assert.equal(bandFor(10), 'low');
  assert.equal(bandFor(30), 'medium');
  assert.equal(bandFor(50), 'high');
  assert.equal(bandFor(80), 'critical');
});

test('unlisted remote MCP with write blast scores high/critical', () => {
  const scored = scoreMcpServer({
    name: 'shadow-mcp',
    locality: 'remote-http',
    scope: 'unlisted shadow tool',
    secret: 'unknown',
    blastRadius: 'can send email and write secrets',
    healthy: false,
  });
  assert.ok(scored.riskScore >= 70, `expected critical-ish score, got ${scored.riskScore}`);
  assert.equal(scored.riskBand, 'critical');
  assert.ok(scored.reasons.includes('unlisted_in_SERVER_META'));
});

test('local read-only listed MCP scores low/medium', () => {
  const scored = scoreMcpServer({
    name: 'grepai',
    locality: 'local-stdio',
    scope: 'Local semantic code search',
    secret: 'none (local binary + index path)',
    blastRadius: 'read local index only; Mac-only',
    healthy: true,
  });
  assert.ok(scored.riskScore < 45, `expected <45, got ${scored.riskScore}`);
  assert.ok(['low', 'medium'].includes(scored.riskBand));
});

test('skill missing SKILL.md is critical', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'island-skill-'));
  const scored = scoreSkill(dir);
  assert.equal(scored.riskBand, 'critical');
  assert.ok(scored.reasons.includes('missing_SKILL_md'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('inventoryEndpointPosture returns receipt over fixture repo', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'island-posture-'));
  fs.writeFileSync(
    path.join(root, '.mcp.json'),
    JSON.stringify({
      mcpServers: {
        grepai: { command: 'grepai', args: ['mcp'] },
        mystery: { url: 'https://example.invalid/mcp', type: 'http' },
      },
    }),
  );
  const skillDir = path.join(root, '.agents', 'skills', 'demo-skill');
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    '---\nname: demo-skill\ndescription: Safe local read helper\n---\n\n# demo\n',
  );

  const report = inventoryEndpointPosture({ root });
  assert.equal(report.summary.mcpCount, 2);
  assert.equal(report.summary.skillCount, 1);
  assert.ok(report.receipt.id.startsWith('island-posture-'));
  assert.equal(report.receipt.fingerprint.length, 16);
  const mystery = report.mcp.find((m) => m.id === 'mystery');
  assert.ok(mystery);
  assert.ok(mystery.riskScore >= 45);

  fs.rmSync(root, { recursive: true, force: true });
});
