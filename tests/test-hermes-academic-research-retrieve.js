'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { retrieve, tokenize, scoreItem } = require('../tools/hermes-academic-research-retrieve');

test('tokenize drops short noise', () => {
  assert.deepEqual(tokenize('AI tool use'), ['ai', 'tool', 'use']);
});

test('scoreItem counts token hits', () => {
  const { score, hits } = scoreItem(
    { title: 'Agent evaluation and tool use', summary: 'benchmarks' },
    ['tool', 'evaluation'],
  );
  assert.ok(score >= 2);
  assert.ok(hits.includes('tool'));
});

test('retrieve ranks fixture pack', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'academic-rag-'));
  fs.writeFileSync(
    path.join(dir, 'latest.json'),
    JSON.stringify({
      evidence: [
        {
          id: 'arxiv:1',
          title: 'Tool use evaluation for coding agents',
          summary: 'We evaluate tool calling reliability.',
          url: 'https://export.arxiv.org/abs/1',
          source: 'arxiv',
        },
      ],
      proposals: [],
      allItems: [],
    }),
  );
  fs.writeFileSync(
    path.join(dir, 'corpus.jsonl'),
    `${JSON.stringify({
      id: 'hf:model',
      title: 'Unrelated vision model',
      summary: 'images',
      url: 'https://huggingface.co/x',
    })}\n`,
  );
  const report = retrieve({ dir, query: 'tool use evaluation', limit: 5 });
  assert.equal(report.ok, true);
  assert.ok(report.matchCount >= 1);
  assert.equal(report.matches[0].id, 'arxiv:1');
});
