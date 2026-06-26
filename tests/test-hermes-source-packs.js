'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  PACKS,
  apply,
  buildAll,
  parseArgs,
  render,
} = require('../tools/hermes-source-packs');

assert.strictEqual(parseArgs(['--apply', '--json']).apply, true);
assert.throws(() => parseArgs(['--bogus']), /Unknown argument/);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-source-packs-'));
const repo = path.join(tmp, 'repo');
const hermesHome = path.join(tmp, 'hermes');
for (const dir of ['docs', 'tools', 'tests']) {
  fs.mkdirSync(path.join(repo, dir), { recursive: true });
}

const fixtures = {
  'AGENTS.md': 'Hermes routes actions. Codex executes. ThumbGate gates side effects.',
  'README.md': 'AI Agent Reliability Hardening and Stripe-safe revenue proof.',
  'docs/REVENUE-OPERATING-PLAN.md': 'Freeze one $499 diagnostic offer. Qualified buyers matter.',
  'docs/SALES-CLOSE-KIT.md': 'Score buyer fit and only ask for payment when Stripe route is ready.',
  'docs/AI-AGENT-HARDENING.md': 'Reproduce failures, rank root causes, add tests.',
  'docs/MEDIA-CONTENT-INGESTION.md': 'Create source-backed content, not generic posts.',
  'tools/hermes-self-harness.js': 'Hermes Self-Harness criticalOpenCount',
  'tools/hermes-decision-loop.js': 'Hermes reliability gate passed',
  'tools/tencentdb-memory-readiness.js': 'traceable memory refs',
  'tools/hermes-project-context.js': 'terminal.cwd',
  'tools/hermes-project-routing-audit.js': 'project routing audit',
  'tools/hermes-goal-cells.js': 'Hermes Goal Cell protocol',
  'tools/glm52-hermes-config.js': 'GLM 5.2 Hermes config',
  'tools/media-content-ingest.js': 'media content ingest',
  'tests/test-hermes-self-harness.js': 'self harness tests pass',
  'tests/test-hermes-goal-cells.js': 'goal cell tests pass',
  'tests/test-tencentdb-memory-readiness.js': 'memory readiness test',
  'tests/test-media-content-ingest.js': 'media content test',
};

for (const [relativePath, text] of Object.entries(fixtures)) {
  const fullPath = path.join(repo, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, text);
}

const report = buildAll({ repo, hermesHome });
assert.strictEqual(report.packCount, PACKS.length);
assert.ok(report.availableSourceCount > 0);
assert.ok(report.packs.find((pack) => pack.key === 'money-offer-pack'));
assert.ok(render(report).includes('Hermes Source Packs'));

const actions = apply(report);
assert.ok(actions.some((action) => action.includes('money-offer-pack')));
assert.ok(fs.existsSync(path.join(hermesHome, 'source-packs', 'index.json')));
assert.ok(fs.existsSync(path.join(hermesHome, 'source-packs', 'money-offer-pack.md')));
assert.match(
  fs.readFileSync(path.join(hermesHome, 'memories', 'MEMORY.md'), 'utf8'),
  /Hermes Source Packs are available/,
);

const index = JSON.parse(fs.readFileSync(path.join(hermesHome, 'source-packs', 'index.json'), 'utf8'));
assert.strictEqual(index.packCount, PACKS.length);
assert.ok(index.packs.every((pack) => pack.combinedSourceHash));

fs.rmSync(tmp, { recursive: true, force: true });
console.log('Hermes source packs tests: PASS');
