'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  DEFAULT_RESEARCH_ITEMS,
  buildBrief,
  extractSignals,
  parseArgs,
  render,
  repoEvidence,
  sourceItemsFromArgs,
} = require('../tools/hermes-research-intelligence');

assert.deepStrictEqual(parseArgs(['--json', '--no-defaults', '--text', 'hybrid rag']).texts, ['hybrid rag']);
assert.throws(() => parseArgs(['--bogus']), /Unknown argument/);

const signals = extractSignals([
  {
    id: 'source-a',
    title: 'Hybrid RAG with MLX and OpenRouter',
    url: 'local',
    confidence: 'test',
    text: [
      'hybrid knowledge graph vector retrieval',
      'MLX Apple Silicon fine-tuning with an eval set',
      'OpenRouter provider routing for speculative decoding and coding model throughput',
      'autonomous skill compilation must stay candidate-only',
      'Docker Android emulator E2E tests',
    ].join(' '),
  },
]);

const keys = signals.map((signal) => signal.key);
assert(keys.includes('hybrid-rag'));
assert(keys.includes('provider-capability-routing'));
assert(keys.includes('mlx-readiness'));
assert(keys.includes('guarded-skill-compilation'));
assert(keys.includes('android-e2e-portability'));
assert(signals.every((signal) => signal.score >= signal.roi));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-research-intel-'));
const requiredFiles = [
  'tools/agent-decision-stack.js',
  'tools/graphify-readiness.js',
  'tools/hermes-source-packs.js',
  'tools/local-inference-readiness.js',
  'tools/openrouter-reasoning-plan.js',
  'tools/kimi-model-upgrade-audit.js',
  'tools/glm52-hermes-config.js',
  'tools/tencentdb-memory-readiness.js',
  'tools/hermes-self-harness.js',
  'tools/hermes-governance-audit.js',
  'tools/hermes-mobile-pair.js',
  'hermes-mobile/scripts/run-continuous-e2e.sh',
  'hermes-mobile/scripts/run-e2e.sh',
  'graphify-out/graph.json',
  'graphify-out/GRAPH_REPORT.md',
];
for (const relativePath of requiredFiles) {
  const fullPath = path.join(tmp, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, 'ok\n');
}

const evidence = repoEvidence(tmp);
assert.strictEqual(evidence.graphBuilt, true);
assert.strictEqual(evidence.missingTools.length, 0);

const brief = buildBrief({ repo: tmp, items: DEFAULT_RESEARCH_ITEMS });
assert(brief.summary.recommendationCount >= 5);
assert(brief.summary.implementNowCount >= 4);
assert(brief.recommendations.some((item) => item.key === 'hybrid-rag' && item.stage === 'implement_now'));
assert(brief.recommendations.some((item) => item.key === 'android-e2e-portability' && item.stage === 'verify_existing_lane_first'));
assert(
  brief.recommendations
    .filter((item) => item.guardrail.includes('no_training') || item.guardrail.includes('candidate_only'))
    .every((item) => item.verification.length > 0),
);
assert(render(brief).includes('No-dead-code rule'));

const filePath = path.join(tmp, 'research.txt');
fs.writeFileSync(filePath, 'OpenRouter provider routing with knowledge graph RAG.');
const items = sourceItemsFromArgs({
  defaults: false,
  texts: ['MLX Apple Silicon fine-tuning needs evals.'],
  files: [filePath],
});
assert.strictEqual(items.length, 2);
assert.strictEqual(items[0].confidence, 'operator_text');
assert.strictEqual(items[1].confidence, 'local_file');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('Hermes research intelligence tests: PASS');
