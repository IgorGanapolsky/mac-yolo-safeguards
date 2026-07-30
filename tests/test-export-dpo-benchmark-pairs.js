'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { exportDpoPairs } = require('../tools/export-dpo-benchmark-pairs');

function withTempDir(run) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-dpo-export-'));
  try {
    return run(tempDir);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

test('exportDpoPairs fails closed with an empty file instead of a synthetic pair', () => {
  withTempDir((tempDir) => {
    const outputPath = path.join(tempDir, 'private', 'pairs.jsonl');
    const result = exportDpoPairs({
      memoriesPath: path.join(tempDir, 'missing-memories.json'),
      outputPath
    });

    assert.equal(result.status, 'insufficient_data');
    assert.equal(result.totalExported, 0);
    assert.equal(fs.readFileSync(outputPath, 'utf8'), '');
    assert.equal(fs.statSync(outputPath).mode & 0o777, 0o600);
    assert.equal(fs.statSync(path.dirname(outputPath)).mode & 0o777, 0o700);
  });
});

test('exportDpoPairs keeps only complete, human-verified, deduplicated, secret-free pairs', () => {
  withTempDir((tempDir) => {
    const memoriesPath = path.join(tempDir, 'memory-log.jsonl');
    const outputPath = path.join(tempDir, 'pairs.jsonl');
    const valid = {
      prompt: 'Why did the deployment fail?',
      chosen: 'The deployment did not run; only local tests passed.',
      rejected: 'Production is fully healthy.',
      humanVerified: true,
      annotationId: 'human-001',
      timestamp: '2026-07-30T12:00:00Z',
      source: 'thumbgate-vote'
    };
    const records = [
      valid,
      { ...valid },
      {
        ...valid,
        annotationId: 'human-002',
        prompt: ['gh', 'p_', 'A'.repeat(36)].join(''),
        chosen: 'Never export credentials.',
        rejected: 'Print credentials.'
      },
      {
        prompt: 'Machine-generated preference',
        chosen: 'A',
        rejected: 'B',
        annotationId: 'model-001',
        timestamp: '2026-07-30T12:01:00Z'
      },
      {
        ...valid,
        annotationId: '',
        prompt: 'Incomplete provenance'
      }
    ];
    fs.writeFileSync(memoriesPath, `${records.map((item) => JSON.stringify(item)).join('\n')}\n`);

    const result = exportDpoPairs({ memoriesPath, outputPath });
    const pairs = fs.readFileSync(outputPath, 'utf8').trim().split('\n').map(JSON.parse);

    assert.equal(result.status, 'ready');
    assert.equal(result.totalExported, 1);
    assert.equal(result.rejected.duplicate, 1);
    assert.equal(result.rejected.secretDetected, 1);
    assert.equal(result.rejected.notHumanVerified, 1);
    assert.equal(result.rejected.incomplete, 1);
    assert.equal(pairs[0].prompt, valid.prompt);
    assert.equal(pairs[0].annotationId, valid.annotationId);
    assert.match(pairs[0].pairDigest, /^[a-f0-9]{64}$/);
    assert.doesNotMatch(fs.readFileSync(outputPath, 'utf8'), /ghp_/);
  });
});

test('exportDpoPairs rejects malformed source JSON instead of hiding ingestion failure', () => {
  withTempDir((tempDir) => {
    const memoriesPath = path.join(tempDir, 'memory-log.jsonl');
    fs.writeFileSync(memoriesPath, '{not-json');
    assert.throws(
      () => exportDpoPairs({
        memoriesPath,
        outputPath: path.join(tempDir, 'pairs.jsonl')
      }),
      /Invalid ThumbGate memory JSONL at line 1/
    );
  });
});
