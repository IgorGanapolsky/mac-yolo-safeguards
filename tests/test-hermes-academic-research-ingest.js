'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  atomicWriteFile,
  boundedErrorMessage,
  buildArxivUrl,
  buildHuggingFaceUrl,
  buildReceipt,
  discover,
  exitCodeForStatus,
  fetchBounded,
  parseArgs,
  parseArxivAtom,
  parseHuggingFaceModels,
  run,
  scoreItem,
} = require('../tools/hermes-academic-research-ingest');

assert.deepStrictEqual(parseArgs(['--max-results', '4', '--top', '2', '--force']).maxResults, 4);
assert.throws(() => parseArgs(['--max-results', '21']), /1 to 20/);
assert.throws(() => parseArgs(['--unknown']), /Unknown argument/);
assert.strictEqual(buildArxivUrl('agent eval', 3).hostname, 'export.arxiv.org');
assert.strictEqual(buildHuggingFaceUrl('agent eval', 3).hostname, 'huggingface.co');
assert.strictEqual(buildHuggingFaceUrl('agent eval', 3).searchParams.get('search'), 'agent');
assert.strictEqual(exitCodeForStatus('complete'), 0);
assert.strictEqual(exitCodeForStatus('partial'), 2);
assert.strictEqual(exitCodeForStatus('failed'), 1);
assert.strictEqual(boundedErrorMessage(new Error('x'.repeat(700))).length, 500);

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
assert.strictEqual(receipt.schemaVersion, 3);
assert.strictEqual(receipt.status, 'complete');
assert.strictEqual(receipt.corpus.length, 2);
assert.match(receipt.generationId, /^academic-/);
assert.match(receipt.corpusHash, /^[a-f0-9]{64}$/);
for (const file of ['latest.json', 'corpus.jsonl']) {
  const filePath = path.join(outDir, file);
  assert(fs.existsSync(filePath));
  assert.strictEqual(fs.statSync(filePath).mode & 0o777, 0o600);
}
assert.strictEqual(fs.statSync(outDir).mode & 0o777, 0o700);

const installer = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'install-hermes-academic-research-agent.sh'), 'utf8');
const launchAgent = fs.readFileSync(path.join(__dirname, '..', 'com.igor.hermes-academic-research-agent.plist'), 'utf8');
assert.match(installer, /command -v node/);
assert.match(installer, /__NODE_BIN__/);
assert.match(launchAgent, /<string>__NODE_BIN__<\/string>/);
assert.doesNotMatch(launchAgent, /<string>\/usr\/bin\/env<\/string>\s*<string>node<\/string>/);

async function verifyFetchDiagnostics() {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    const error = new TypeError('fetch failed');
    error.cause = Object.assign(new Error('socket closed'), { code: 'ECONNRESET' });
    throw error;
  };
  try {
    await assert.rejects(
      fetchBounded('https://huggingface.co/api/models?limit=1'),
      /huggingface\.co metadata request failed: TypeError; fetch failed; cause=ECONNRESET; causeMessage=socket closed/,
    );
    assert.strictEqual(calls, 1);
  } finally {
    global.fetch = originalFetch;
  }
}

async function verifyPartialFailureAndAtomicity() {
  const partial = await discover({
    fixture: null,
    query: 'agent evaluation',
    maxResults: 3,
  }, {
    fetchImpl: async (url) => {
      if (url.hostname === 'export.arxiv.org') return { body: atom, contentType: 'application/atom+xml' };
      throw new Error('simulated Hugging Face reset');
    },
    now: '2026-07-30T12:00:00Z',
  });
  assert.strictEqual(partial.status, 'partial');
  assert.deepStrictEqual(partial.items.map((item) => item.id), ['arxiv:2607.12345']);
  assert.deepStrictEqual(partial.sources.map((source) => source.status), ['complete', 'failed']);
  assert.match(partial.sources[1].error, /simulated Hugging Face reset/);

  const invalidSchemas = await discover({
    fixture: null,
    query: 'agent evaluation',
    maxResults: 3,
  }, {
    fetchImpl: async (url) => ({
      body: url.hostname === 'export.arxiv.org'
        ? '<html>upstream proxy error</html>'
        : '{}',
      contentType: 'text/html',
    }),
    now: '2026-07-30T12:00:00Z',
  });
  assert.strictEqual(invalidSchemas.status, 'failed');
  assert(invalidSchemas.sources.every((source) => source.status === 'failed'));
  assert(invalidSchemas.sources.every((source) => /schema/i.test(source.error)));

  const partialOut = path.join(tmp, 'partial-output');
  let discoveryCalls = 0;
  const partialDiscover = async () => {
    discoveryCalls += 1;
    return partial;
  };
  const partialArgs = {
    outDir: partialOut,
    query: 'agent evaluation',
    top: 2,
    maxResults: 3,
    fixture: null,
    force: false,
  };
  const firstPartial = await run(partialArgs, {
    now: '2026-07-30T12:00:00Z',
    discoverImpl: partialDiscover,
  });
  const secondPartial = await run(partialArgs, {
    now: '2026-07-30T12:05:00Z',
    discoverImpl: partialDiscover,
  });
  assert.strictEqual(firstPartial.status, 'partial');
  assert.strictEqual(secondPartial.status, 'partial');
  assert.strictEqual(discoveryCalls, 2, 'partial receipt must not suppress same-day retry');

  const outageOut = path.join(tmp, 'outage-output');
  fs.mkdirSync(outageOut, { recursive: true });
  const latestPath = path.join(outageOut, 'latest.json');
  const corpusPath = path.join(outageOut, 'corpus.jsonl');
  const priorLatest = '{"status":"complete","sentinel":"last-good"}\n';
  const priorCorpus = '{"id":"sentinel:last-good"}\n';
  fs.writeFileSync(latestPath, priorLatest);
  fs.writeFileSync(corpusPath, priorCorpus);
  await assert.rejects(
    run({ ...partialArgs, outDir: outageOut, force: true }, {
      now: '2026-07-30T12:10:00Z',
      discoverImpl: async () => ({
        status: 'failed',
        items: [],
        sources: [
          { name: 'arxiv', status: 'failed', requestCount: 1, itemCount: 0, error: 'timeout' },
          { name: 'huggingface_models', status: 'failed', requestCount: 1, itemCount: 0, error: 'reset' },
        ],
      }),
    }),
    /all academic metadata sources failed/i,
  );
  assert.strictEqual(fs.readFileSync(latestPath, 'utf8'), priorLatest);
  assert.strictEqual(fs.readFileSync(corpusPath, 'utf8'), priorCorpus);
  const attempts = fs.readdirSync(path.join(outageOut, 'attempts')).filter((name) => name.endsWith('.json'));
  assert.strictEqual(attempts.length, 1);
  const failedAttempt = JSON.parse(fs.readFileSync(path.join(outageOut, 'attempts', attempts[0]), 'utf8'));
  assert.strictEqual(failedAttempt.status, 'failed');

  const commitOut = path.join(tmp, 'commit-output');
  fs.mkdirSync(commitOut, { recursive: true });
  const commitLatest = path.join(commitOut, 'latest.json');
  const commitCorpus = path.join(commitOut, 'corpus.jsonl');
  const oldSnapshot = '{"schemaVersion":3,"status":"complete","generatedAt":"2026-07-29T12:00:00.000Z","corpus":[{"id":"sentinel:old"}]}\n';
  const oldExport = '{"id":"sentinel:old"}\n';
  fs.writeFileSync(commitLatest, oldSnapshot);
  fs.writeFileSync(commitCorpus, oldExport);
  await assert.rejects(
    run({ ...partialArgs, outDir: commitOut, force: true }, {
      now: '2026-07-30T12:20:00Z',
      discoverImpl: partialDiscover,
      beforeCommit() {
        throw new Error('simulated authoritative commit failure');
      },
    }),
    /simulated authoritative commit failure/,
  );
  assert.strictEqual(fs.readFileSync(commitLatest, 'utf8'), oldSnapshot);
  assert.strictEqual(fs.readFileSync(commitCorpus, 'utf8'), oldExport);

  const exportOut = path.join(tmp, 'export-output');
  fs.mkdirSync(path.join(exportOut, '2026-07-30.json'), { recursive: true });
  const exportWarnings = [];
  const committedDespiteExportFailure = await run({ ...partialArgs, outDir: exportOut, force: true }, {
    now: '2026-07-30T12:30:00Z',
    discoverImpl: partialDiscover,
    onExportWarning: (warning) => exportWarnings.push(warning),
  });
  assert.strictEqual(committedDespiteExportFailure.status, 'partial');
  assert.strictEqual(exportWarnings.length, 1);
  assert.match(exportWarnings[0], /compatibility export failed/i);
  const authoritativeSnapshot = JSON.parse(fs.readFileSync(path.join(exportOut, 'latest.json'), 'utf8'));
  assert.strictEqual(authoritativeSnapshot.generationId, committedDespiteExportFailure.generationId);
  assert.deepStrictEqual(authoritativeSnapshot.corpus.map((item) => item.id), ['arxiv:2607.12345']);
  assert.deepStrictEqual(readJsonl(path.join(exportOut, 'corpus.jsonl')).map((item) => item.id), ['arxiv:2607.12345']);

  const atomicPath = path.join(tmp, 'atomic.json');
  fs.writeFileSync(atomicPath, 'last-good\n');
  assert.throws(() => atomicWriteFile(atomicPath, 'new-value\n', {
    beforeRename() {
      throw new Error('simulated crash before rename');
    },
  }), /simulated crash before rename/);
  assert.strictEqual(fs.readFileSync(atomicPath, 'utf8'), 'last-good\n');
  assert.deepStrictEqual(fs.readdirSync(tmp).filter((name) => name.includes('.tmp-')), []);
}

function readJsonl(filePath) {
  return fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

Promise.all([verifyFetchDiagnostics(), verifyPartialFailureAndAtomicity()])
  .then(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log('Hermes academic research ingestion tests: PASS');
  })
  .catch((error) => {
    fs.rmSync(tmp, { recursive: true, force: true });
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
