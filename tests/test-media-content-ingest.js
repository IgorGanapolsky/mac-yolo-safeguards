'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildActionPlan,
  availableTranscriber,
  ingest,
  parseArgs,
  stripVtt,
  summarizeText,
} = require('../tools/media-content-ingest');

assert.deepStrictEqual(parseArgs(['https://example.com/watch?v=1', '--json']).input, 'https://example.com/watch?v=1');

const vtt = `WEBVTT

00:00:00.000 --> 00:00:02.000
<c>Hello</c> from the video

00:00:02.000 --> 00:00:04.000
Build in public
`;
assert.strictEqual(stripVtt(vtt), 'Hello from the video\nBuild in public');
assert.ok(summarizeText('x '.repeat(2000), 80).length <= 80);
assert.deepStrictEqual(availableTranscriber((command) => command === 'whisper'), { command: 'whisper', kind: 'openai-whisper' });
assert.strictEqual(availableTranscriber(() => false), null);

const peterStyleText = `
Clarify your niche and ideal customer. Build an MVP, ship weekly, and share
progress on YouTube or LinkedIn. Make customers part of the product team with
Telegram feedback loops. Use AI agents to manage AI, delegate specs and tests,
and set daily top 3 outcomes: one build, one distribution move, one relationship move.
`;
const lanes = buildActionPlan(peterStyleText, { title: 'AI product career advice' }).map((item) => item.lane);
for (const expected of ['positioning', 'product', 'distribution', 'customer-loop', 'agent-os', 'daily-os']) {
  assert.ok(lanes.includes(expected), `expected action lane ${expected}`);
}
const systemUpgradeLanes = buildActionPlan('OpenRouter reasoning.effort maps provider controls. Graphify builds a knowledge graph from code, PDFs and diagrams.')
  .map((item) => item.lane);
assert.ok(systemUpgradeLanes.includes('reasoning-router'));
assert.ok(systemUpgradeLanes.includes('knowledge-graph'));

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-ingest-test-'));
const calls = [];
const runner = (command, args) => {
  calls.push([command, args]);
  if (command === 'yt-dlp' && args.includes('--dump-single-json')) {
    return {
      status: 0,
      stdout: JSON.stringify({
        title: 'Only 3 Customers',
        uploader: 'Boring Money Podcast',
        duration: 1234,
        webpage_url: 'https://youtube.example/video',
        description: peterStyleText,
        tags: ['business', 'ai'],
      }),
      stderr: '',
    };
  }
  if (command === 'yt-dlp' && args.includes('--skip-download')) {
    const outIndex = args.indexOf('-o') + 1;
    const outputTemplate = args[outIndex];
    const outFile = outputTemplate.replace('%(ext)s', 'en.vtt');
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, vtt);
    return { status: 0, stdout: '', stderr: '' };
  }
  return { status: 1, stdout: '', stderr: 'unexpected command' };
};

const report = ingest('https://youtube.example/video', {
  runner,
  commandExists: (command) => command === 'yt-dlp',
  keepTemp: false,
});
assert.strictEqual(report.status, 'ok');
assert.strictEqual(report.source, 'subtitles');
assert.strictEqual(report.metadata.title, 'Only 3 Customers');
assert.ok(report.transcript.text.includes('Build in public'));
assert.ok(report.actionPlan.some((item) => item.lane === 'distribution'));
assert.ok(calls.some(([command, args]) => command === 'yt-dlp' && args.includes('--dump-single-json')));
fs.rmSync(tempDir, { recursive: true, force: true });

const blocked = ingest('https://youtube.example/video', {
  commandExists: () => false,
});
assert.strictEqual(blocked.status, 'blocked');
assert.ok(blocked.errors[0].includes('yt-dlp is not installed'));

console.log('Media content ingest tests: PASS');
