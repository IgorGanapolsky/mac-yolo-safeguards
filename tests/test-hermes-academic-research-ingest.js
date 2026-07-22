'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  buildArxivUrl,
  buildHuggingFaceUrl,
  buildReceipt,
  parseArgs,
  parseArxivAtom,
  parseHuggingFaceModels,
  scoreItem,
} = require('../tools/hermes-academic-research-ingest');

assert.deepStrictEqual(parseArgs(['--max-results', '4', '--top', '2', '--force']).maxResults, 4);
assert.throws(() => parseArgs(['--max-results', '21']), /1 to 20/);
assert.throws(() => parseArgs(['--unknown']), /Unknown argument/);
assert.strictEqual(buildArxivUrl('agent eval', 3).hostname, 'export.arxiv.org');
assert.strictEqual(buildHuggingFaceUrl('agent eval', 3).hostname, 'huggingface.co');
assert.strictEqual(buildHuggingFaceUrl('agent eval', 3).searchParams.get('search'), 'agent');

const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry><id>https://arxiv.org/abs/2607.12345</id><updated>2026-07-21T12:00:00Z</updated>
<published>2026-07-20T12:00:00Z</published><title>Agent Evaluation for Safe Tool Use</title>
<summary>A benchmark for retrieval, governance, and tool-call security.</summary>
<author><name>Ada Example</name></author><category term="cs.AI"/></entry></feed>`;
const arxivItems = parseArxivAtom(atom);
assert.strictEqual(arxivItems.length, 1);
assert.strictEqual(arxivItems[0].id, 'arxiv:2607.12345');
assert.strictEqual(arxivItems[0].url, 'https://arxiv.org/abs/2607.12345');
assert.deepStrictEqual(arxivItems[0].authors, ['Ada Example']);

const hfItems = parseHuggingFaceModels([{
  id: 'org/agent-eval-model',
  lastModified: '2026-07-22T10:00:00Z',
  likes: 24,
  downloads: 12000,
  tags: ['license:apache-2.0', 'agents', 'evaluation'],
  pipeline_tag: 'text-generation',
}]);
assert.strictEqual(hfItems.length, 1);
assert.strictEqual(hfItems[0].license, 'apache-2.0');
assert.strictEqual(hfItems[0].url, 'https://huggingface.co/org/agent-eval-model');

const score = scoreItem(arxivItems[0], {
  now: '2026-07-22T12:00:00Z',
  query: 'agent evaluation retrieval security tool use',
  seenIds: new Set(),
  seenHashes: new Set(),
});
assert(score.total > 0.7);
assert.strictEqual(score.novelty, 1);
assert.strictEqual(score.citations, 0);

const riskyModel = parseHuggingFaceModels([{
  id: 'unknown/agent-merge-gguf',
  lastModified: '2026-07-22T10:00:00Z',
  downloads: 50000,
  tags: ['gguf', 'merge', 'agents'],
}])[0];
const riskyScore = scoreItem(riskyModel, {
  now: '2026-07-22T12:00:00Z',
  query: 'agent evaluation retrieval security tool use',
  seenIds: new Set(),
  seenHashes: new Set(),
});
assert(riskyScore.riskFlags.includes('missing_license_metadata'));
assert(riskyScore.riskFlags.includes('derived_or_quantized_artifact'));
assert.strictEqual(riskyScore.riskPenalty, 0.3);

const first = buildReceipt([...arxivItems, ...hfItems], {
  now: '2026-07-22T12:00:00Z',
  query: 'agent evaluation retrieval security tool use',
  top: 2,
  corpus: [],
});
assert.strictEqual(first.summary.new, 2);
assert.strictEqual(first.proposals.length, 2);
assert(first.evidence.some((item) => item.source === 'arxiv'));
assert(first.evidence.some((item) => item.source === 'huggingface_model'));
assert.strictEqual(first.policy.trustRemoteCode, false);
assert(first.proposals.every((proposal) => proposal.automaticAction === false));

const second = buildReceipt([...arxivItems, ...hfItems], {
  now: '2026-07-22T12:00:00Z',
  query: 'agent evaluation retrieval security tool use',
  top: 2,
  corpus: first.allItems,
  previousDigest: first.summary.sourceDigest,
});
assert.strictEqual(second.summary.new, 0);
assert.strictEqual(second.summary.unchanged, true);
assert.strictEqual(second.proposals.length, 0);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-academic-rag-'));
const fixturePath = path.join(tmp, 'fixture.json');
const outDir = path.join(tmp, 'output');
fs.writeFileSync(fixturePath, JSON.stringify([...arxivItems, ...hfItems]));
const cli = spawnSync(process.execPath, [
  path.join(__dirname, '..', 'tools', 'hermes-academic-research-ingest.js'),
  '--fixture', fixturePath,
  '--out-dir', outDir,
  '--query', 'agent evaluation retrieval security tool use',
  '--force',
  '--json',
], { encoding: 'utf8' });
assert.strictEqual(cli.status, 0, cli.stderr);
const receipt = JSON.parse(cli.stdout);
assert.strictEqual(receipt.sources[0].requestCount, 0);
for (const file of ['latest.json', 'corpus.jsonl']) {
  const filePath = path.join(outDir, file);
  assert(fs.existsSync(filePath));
  assert.strictEqual(fs.statSync(filePath).mode & 0o777, 0o600);
}
assert.strictEqual(fs.statSync(outDir).mode & 0o777, 0o700);

fs.rmSync(tmp, { recursive: true, force: true });
console.log('Hermes academic research ingestion tests: PASS');
