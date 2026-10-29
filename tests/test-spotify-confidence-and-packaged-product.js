#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  listFlags,
  resolveFlagWithExposure,
  synthesizeWhatIsWorthBuilding,
} = require('../tools/spotify-confidence-flags-steal');
const { handleRpcRequest, callTool } = require('../tools/mac-yolo-mcp-server');
const { runSelfTest } = require('../tools/mac-yolo-service');

const REPO = path.resolve(__dirname, '..');

function main() {
  // 1. Spotify Confidence flags (state=ACTIVE) + schema validation
  const active = listFlags({ state: 'ACTIVE' });
  assert.strictEqual(active.ok, true);
  assert.strictEqual(active.returnedCount, 4);
  assert.ok(active.flags.every((f) => f.state === 'ACTIVE' && f.schemaValid === true));

  const archived = listFlags({ state: 'ARCHIVED' });
  assert.strictEqual(archived.returnedCount, 1);
  assert.strictEqual(archived.flags[0].key, 'legacy-unauthenticated-semrush-mcp');

  // 2. Exposure logging at evaluation time + guardrail auto-abort
  const normalResolve = resolveFlagWithExposure('yolo-sim-runaway-reaper', {
    subjectId: 'user-1',
    metrics: { loadAvg: 5.0, errorRate: 0.0 },
  });
  assert.strictEqual(normalResolve.ok, true);
  assert.strictEqual(normalResolve.variant, 'enforced');
  assert.strictEqual(normalResolve.guardrailAutoAborted, false);
  assert.ok(normalResolve.exposureEvent && normalResolve.exposureEvent.eventId.startsWith('exp_'));

  const abortedResolve = resolveFlagWithExposure('yolo-sim-runaway-reaper', {
    subjectId: 'user-1',
    metrics: { loadAvg: 307.0, errorRate: 0.0 },
  });
  assert.strictEqual(abortedResolve.ok, true);
  assert.strictEqual(abortedResolve.variant, 'control', 'Guardrail breach must auto-abort back to control');
  assert.strictEqual(abortedResolve.guardrailAutoAborted, true);
  assert.strictEqual(abortedResolve.exposureEvent.reason, 'GUARDRAIL_AUTO_ABORT_FALLBACK');

  // 3. "What is worth building" multi-signal synthesis with human approval gate
  const unapproved = synthesizeWhatIsWorthBuilding({});
  assert.strictEqual(unapproved.ok, true);
  assert.strictEqual(unapproved.humanStaysInControl, true);
  assert.ok(unapproved.recommendations.every((r) => r.status === 'awaiting_go_ahead'));

  const approved = synthesizeWhatIsWorthBuilding({
    approvedIds: ['rec-packaged-mcp-and-mac-app'],
  });
  assert.strictEqual(
    approved.recommendations.find((r) => r.id === 'rec-packaged-mcp-and-mac-app').status,
    'approved_building',
  );

  // 4. Official mac-yolo-safeguards MCP Server (JSON-RPC 2.0)
  const initResp = handleRpcRequest({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2024-11-05' },
  });
  assert.strictEqual(initResp.result.serverInfo.name, 'mac-yolo-safeguards');

  const toolsResp = handleRpcRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.strictEqual(toolsResp.result.tools.length, 9);

  const callResp = handleRpcRequest({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'yolo_business_catalog', arguments: {} },
  });
  assert.strictEqual(callResp.result.isError, false);
  const catalog = JSON.parse(callResp.result.content[0].text);
  assert.strictEqual(catalog.ok, true);
  assert.strictEqual(catalog.tiers.length, 5);
  const { verifyCatalogIsolation } = require('../tools/mac-yolo-stripe-provisioner');
  const iso = verifyCatalogIsolation(catalog.tiers);
  assert.strictEqual(iso.ok, true);
  assert.strictEqual(iso.zeroThumbgateReferences, true);
  const guardAudit = callTool('yolo_guardrails_audit', {});
  assert.strictEqual(guardAudit.ok, true);

  // 5. Local HTTP Service self-test
  const serviceTest = runSelfTest();
  assert.strictEqual(serviceTest.ok, true);

  // 6. CLI smoke of bin/mac-yolo-mcp over stdio
  const stdioRun = spawnSync(
    process.execPath,
    [path.join(REPO, 'tools', 'mac-yolo-mcp-server.js')],
    {
      input: `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })}\n`,
      encoding: 'utf8',
      timeout: 10000,
    },
  );
  assert.strictEqual(stdioRun.status, 0);
  assert.ok(stdioRun.stdout.includes('"name":"mac-yolo-safeguards"'));

  console.log('test-spotify-confidence-and-packaged-product: PASS (all 6 suites verified)');
}

main();
