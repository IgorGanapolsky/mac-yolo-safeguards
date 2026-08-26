#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  auditReadiness,
  manifestSha256,
} = require('../tools/webmcp-agent-readiness');

const repoRoot = path.resolve(__dirname, '..');
const cli = path.join(repoRoot, 'tools', 'webmcp-agent-readiness.js');
const now = new Date('2026-08-26T21:45:00.000Z');
const captureDigest = 'a'.repeat(64);
let passed = 0;

function ok(name) {
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

function validManifest() {
  return {
    version: 1,
    site: 'https://example.com/consult',
    tools: [
      {
        name: 'get_service_options',
        title: 'Get service options',
        description: 'Return services that match the customer request.',
        inputSchema: {
          type: 'object',
          properties: {
            need: {
              type: 'string',
              description: 'What the customer needs.',
              maxLength: 500,
            },
          },
          required: ['need'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
      },
      {
        name: 'book_consult',
        title: 'Book consultation',
        description: 'Prepare a consultation booking after the user confirms.',
        inputSchema: {
          type: 'object',
          properties: {
            slot: {
              type: 'string',
              description: 'Selected appointment slot identifier.',
              maxLength: 100,
            },
          },
          required: ['slot'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
      },
    ],
    policies: {
      get_service_options: {
        effect: 'read',
        confirmation: 'not_applicable',
      },
      book_consult: {
        effect: 'consequential',
        confirmation: 'required',
      },
    },
    journeys: [
      {
        id: 'book-consult-preview',
        prompt: 'Find the right service and prepare a consultation for tomorrow.',
        expectedCalls: ['get_service_options', 'book_consult'],
        expectedArguments: [
          { need: 'consultation' },
          { slot: 'tomorrow' },
        ],
        mode: 'preview',
        performanceBudget: {
          maxDurationMs: 5000,
          maxToolCalls: 2,
          maxEstimatedCostUsd: 0.05,
        },
      },
    ],
  };
}

function validRuntime(manifest) {
  return {
    manifestSha256: manifestSha256(manifest),
    site: manifest.site,
    capturedAt: '2026-08-26T21:44:00.000Z',
    collector: { name: 'model-context-tool-inspector', version: '1.0.0' },
    artifactSha256: captureDigest,
    browser: {
      name: 'Chrome',
      version: '149.0.0.0',
      webmcpEnabled: true,
      originIsolated: true,
      toolsPermission: true,
    },
    registeredTools: ['get_service_options', 'book_consult'],
    environment: 'production',
    journeys: {
      'book-consult-preview': {
        status: 'pass',
        calls: ['get_service_options', 'book_consult'],
        arguments: [
          { need: 'consultation' },
          { slot: 'tomorrow' },
        ],
        confirmationObserved: true,
        sideEffect: 'not_executed',
        durationMs: 1200,
        estimatedCostUsd: 0.01,
        unnecessarySteps: 0,
      },
    },
  };
}

{
  const manifest = validManifest();
  const result = auditReadiness(manifest, null, { staticOnly: true, now });
  assert.strictEqual(result.status, 'STATIC_READY');
  assert.strictEqual(result.staticReady, true);
  assert.strictEqual(result.runtimeVerified, false);
  ok('valid static contract is STATIC_READY, not runtime READY');
}

{
  const manifest = validManifest();
  const result = auditReadiness(manifest, null, { now });
  assert.strictEqual(result.status, 'UNVERIFIED');
  assert.match(result.runtimeErrors.join('\n'), /runtime evidence/i);
  ok('missing browser evidence is UNVERIFIED');
}

{
  const manifest = validManifest();
  const result = auditReadiness(manifest, validRuntime(manifest), { now, artifactSha256: captureDigest });
  assert.strictEqual(result.status, 'READY');
  assert.strictEqual(result.staticReady, true);
  assert.strictEqual(result.runtimeVerified, true);
  assert.deepStrictEqual(result.errors, []);
  ok('matching fresh browser and journey evidence is READY');
}

{
  const manifest = validManifest();
  manifest.policies.book_consult.confirmation = 'agent_decides';
  const result = auditReadiness(manifest, null, { staticOnly: true, now });
  assert.strictEqual(result.status, 'BLOCKED');
  assert.match(result.staticErrors.join('\n'), /consequential.*confirmation.*required/i);
  ok('consequential tool without required confirmation is blocked');
}

{
  const manifest = validManifest();
  manifest.tools[0].description = 'x'.repeat(501);
  manifest.tools[0].inputSchema.properties.need.description = 'y'.repeat(151);
  const result = auditReadiness(manifest, null, { staticOnly: true, now });
  assert.strictEqual(result.status, 'BLOCKED');
  assert.match(result.staticErrors.join('\n'), /500 characters/);
  assert.match(result.staticErrors.join('\n'), /150 characters/);
  ok('Chrome metadata budgets are enforced');
}

{
  const manifest = validManifest();
  delete manifest.tools[0].inputSchema.properties.need.maxLength;
  const result = auditReadiness(manifest, null, { staticOnly: true, now });
  assert.strictEqual(result.status, 'BLOCKED');
  assert.match(result.staticErrors.join('\n'), /positive maxLength/i);
  ok('unbounded agent string input is blocked');
}

{
  const manifest = validManifest();
  delete manifest.tools[0].inputSchema.additionalProperties;
  const result = auditReadiness(manifest, null, { staticOnly: true, now });
  assert.strictEqual(result.status, 'BLOCKED');
  assert.match(result.staticErrors.join('\n'), /additionalProperties must be false/i);
  ok('schemas reject undeclared agent input fields');
}

{
  const manifest = validManifest();
  manifest.journeys[0].expectedCalls.push('missing_tool');
  const result = auditReadiness(manifest, null, { staticOnly: true, now });
  assert.strictEqual(result.status, 'BLOCKED');
  assert.match(result.staticErrors.join('\n'), /unknown tool.*missing_tool/i);
  ok('journeys cannot reference unregistered tools');
}

{
  const manifest = validManifest();
  manifest.journeys[0].expectedArguments = [{ need: 'consultation' }];
  const result = auditReadiness(manifest, null, { staticOnly: true, now });
  assert.strictEqual(result.status, 'BLOCKED');
  assert.match(result.staticErrors.join('\n'), /expectedArguments.*expectedCalls/i);
  ok('journey argument expectations must align with the tool sequence');
}

{
  const manifest = validManifest();
  delete manifest.journeys[0].performanceBudget;
  const result = auditReadiness(manifest, null, { staticOnly: true, now });
  assert.strictEqual(result.status, 'BLOCKED');
  assert.match(result.staticErrors.join('\n'), /performanceBudget/i);
  ok('every revenue-critical journey requires an explicit performance budget');
}

{
  const manifest = validManifest();
  manifest.journeys[0].performanceBudget.maxToolCalls = 1;
  const result = auditReadiness(manifest, null, { staticOnly: true, now });
  assert.strictEqual(result.status, 'BLOCKED');
  assert.match(result.staticErrors.join('\n'), /maxToolCalls.*expectedCalls/i);
  ok('journey design cannot exceed its own tool-call budget');
}

{
  const manifest = validManifest();
  const runtime = validRuntime(manifest);
  runtime.capturedAt = '2026-08-24T21:44:00.000Z';
  const result = auditReadiness(manifest, runtime, { now, artifactSha256: captureDigest });
  assert.strictEqual(result.status, 'UNVERIFIED');
  assert.match(result.runtimeErrors.join('\n'), /older than 24 hours/i);
  ok('stale runtime evidence is unverified');
}

{
  const manifest = validManifest();
  const runtime = validRuntime(manifest);
  runtime.manifestSha256 = '0'.repeat(64);
  const result = auditReadiness(manifest, runtime, { now, artifactSha256: captureDigest });
  assert.strictEqual(result.status, 'UNVERIFIED');
  assert.match(result.runtimeErrors.join('\n'), /manifestSha256/i);
  ok('runtime proof for a different manifest is unverified');
}

{
  const manifest = validManifest();
  const runtime = validRuntime(manifest);
  runtime.site = 'https://wrong.example/consult';
  runtime.artifactSha256 = 'not-a-digest';
  const result = auditReadiness(manifest, runtime, { now, artifactSha256: captureDigest });
  assert.strictEqual(result.status, 'UNVERIFIED');
  assert.match(result.runtimeErrors.join('\n'), /runtime site/i);
  assert.match(result.runtimeErrors.join('\n'), /artifactSha256/i);
  ok('runtime URL and raw-capture digest are bound to the report');
}

{
  const manifest = validManifest();
  const runtime = validRuntime(manifest);
  runtime.journeys['book-consult-preview'].arguments[1] = { slot: 'next-week' };
  const result = auditReadiness(manifest, runtime, { now, artifactSha256: captureDigest });
  assert.strictEqual(result.status, 'UNVERIFIED');
  assert.match(result.runtimeErrors.join('\n'), /arguments do not match/i);
  ok('runtime tool arguments must match the expected journey arguments');
}

{
  const manifest = validManifest();
  const runtime = validRuntime(manifest);
  runtime.journeys['book-consult-preview'].confirmationObserved = false;
  runtime.journeys['book-consult-preview'].sideEffect = 'verified';
  const result = auditReadiness(manifest, runtime, { now, artifactSha256: captureDigest });
  assert.strictEqual(result.status, 'UNVERIFIED');
  assert.match(result.runtimeErrors.join('\n'), /confirmationObserved/);
  assert.match(result.runtimeErrors.join('\n'), /not_executed/);
  ok('production preview cannot finalize a consequential action');
}

{
  const manifest = validManifest();
  const runtime = validRuntime(manifest);
  runtime.journeys['book-consult-preview'].durationMs = 5001;
  runtime.journeys['book-consult-preview'].estimatedCostUsd = 0.051;
  runtime.journeys['book-consult-preview'].unnecessarySteps = 1;
  const result = auditReadiness(manifest, runtime, { now, artifactSha256: captureDigest });
  assert.strictEqual(result.status, 'UNVERIFIED');
  assert.match(result.runtimeErrors.join('\n'), /durationMs.*5000/i);
  assert.match(result.runtimeErrors.join('\n'), /estimatedCostUsd.*0\.05/i);
  assert.match(result.runtimeErrors.join('\n'), /unnecessarySteps.*zero/i);
  ok('runtime journey evidence must satisfy latency, cost, and unnecessary-step budgets');
}

{
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webmcp-readiness-'));
  const manifestPath = path.join(tempDir, 'manifest.json');
  const runtimePath = path.join(tempDir, 'runtime.json');
  const artifactPath = path.join(tempDir, 'capture.jsonl');
  const reportPath = path.join(tempDir, 'report.json');
  const manifest = validManifest();
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));

  const completed = spawnSync(
    process.execPath,
    [cli, '--manifest', manifestPath, '--static-only', '--json', '--out', reportPath],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  assert.strictEqual(completed.status, 0, completed.stderr || completed.stdout);
  assert.strictEqual(JSON.parse(completed.stdout).status, 'STATIC_READY');
  assert.strictEqual(JSON.parse(fs.readFileSync(reportPath, 'utf8')).status, 'STATIC_READY');

  const unverified = spawnSync(
    process.execPath,
    [cli, '--manifest', manifestPath, '--json'],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  assert.strictEqual(unverified.status, 2, unverified.stderr || unverified.stdout);
  assert.strictEqual(JSON.parse(unverified.stdout).status, 'UNVERIFIED');

  fs.writeFileSync(artifactPath, '{"event":"tool_call"}\n');
  const runtime = validRuntime(manifest);
  runtime.capturedAt = new Date().toISOString();
  runtime.artifactSha256 = crypto
    .createHash('sha256')
    .update(fs.readFileSync(artifactPath))
    .digest('hex');
  fs.writeFileSync(runtimePath, JSON.stringify(runtime));
  const ready = spawnSync(
    process.execPath,
    [cli, '--manifest', manifestPath, '--runtime', runtimePath, '--artifact', artifactPath, '--json'],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  assert.strictEqual(ready.status, 0, ready.stderr || ready.stdout);
  assert.strictEqual(JSON.parse(ready.stdout).status, 'READY');

  fs.rmSync(tempDir, { recursive: true, force: true });
  ok('CLI writes reports and uses a distinct unverified exit code');
}

console.log(`1..${passed}`);
console.log(`All ${passed} WebMCP readiness assertions passed.`);
