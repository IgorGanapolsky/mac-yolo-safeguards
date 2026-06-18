'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { collect, parseArgs, render } = require('../tools/openmono-roi-audit');

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

assert.deepStrictEqual(parseArgs(['--repo', '/tmp/example', '--json']), {
  repo: '/tmp/example',
  json: true,
  help: false,
});

const tempRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'openmono-roi-'));
write(path.join(tempRepo, 'tools/hermes-productivity-audit.js'), 'const LIVE_SMOKE_REUSE_MS = 300000; const publicWebhookTest = true;');
write(path.join(tempRepo, 'tools/local-inference-readiness.js'), 'fallback_providers 127.0.0.1:11434');
write(path.join(tempRepo, 'tools/graphify-readiness.js'), 'graphify-out query build');
write(path.join(tempRepo, 'tools/hermes-governance-audit.js'), 'sample-response skool_browser_dm_dry_run gateway_notify_interval tool_progress');
write(path.join(tempRepo, 'tools/hermes-decision-loop.js'), 'decision GO');
write(path.join(tempRepo, 'scripts/ci-verify.sh'), 'tests/test-secondary-browser-reclaim.sh');
write(path.join(tempRepo, 'sim-runaway-guard.sh'), '#!/bin/sh\n');
write(path.join(tempRepo, 'tests/test-secondary-browser-reclaim.sh'), '#!/bin/sh\n');
write(path.join(tempRepo, 'tests/test-hermes-productivity-audit-live-gate.js'), 'hasRecentLiveSuccess');
write(path.join(tempRepo, 'docs/OPENMONO-ANTI-HALLUCINATION.md'), 'ship-claim scripts/ci-verify.sh ThumbGate');
write(path.join(tempRepo, 'graphify-out/graph.json'), '{}');

const report = collect({ repo: tempRepo, mockTotalMem: 32 * 1024 * 1024 * 1024 });
assert.strictEqual(report.score, 100);
assert.strictEqual(report.findings.length, 0);
assert(render(report).includes('Score: 100/100'));

fs.rmSync(path.join(tempRepo, 'graphify-out/graph.json'));
const missingGraph = collect({ repo: tempRepo });
assert(missingGraph.score < 100);
assert(missingGraph.findings.some((finding) => finding.title === 'Graph/RAG readiness is executable'));

fs.rmSync(tempRepo, { recursive: true, force: true });

console.log('OpenMono ROI audit tests: PASS');
