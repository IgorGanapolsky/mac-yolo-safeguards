#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const distill = require('../tools/hermes-yolo-tinker-prompt-distill');

const REPO = path.resolve(__dirname, '..');
const TOOL = path.join(REPO, 'tools', 'hermes-yolo-tinker-prompt-distill.js');
const WRAPPER = path.join(REPO, 'tinker-yolo');
const BIN = path.join(REPO, 'bin', 'tinker-prompt-distill');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  process.stdout.write(`ok - ${name}\n`);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tinker-prompt-distill-'));
process.on('exit', () => fs.rmSync(root, { recursive: true, force: true }));

const LONG = `You are Hermes.\n${'SKILL DUMP '.repeat(400)}always follow every rule in this pack.`;
assert.ok(LONG.length > distill.DEFAULT_MAX_SYSTEM_CHARS);

test('replaces a long system pack and keeps teacher tool turns', () => {
  const result = distill.distillMessages([
    { role: 'system', content: LONG },
    { role: 'user', content: 'fix the lock file' },
    { role: 'assistant', content: '', tool_calls: [{ id: '1', function: { name: 'read_file' } }] },
    { role: 'tool', tool_call_id: '1', content: 'ok' },
    { role: 'assistant', content: 'done' },
  ]);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.longSystemMessages, 1);
  assert.strictEqual(result.messages[0].content, distill.DEFAULT_STUB);
  assert.ok(result.systemCharsAfter < 400);
  assert.ok(result.systemCharsBefore > 4000);
  assert.strictEqual(result.messages[2].tool_calls[0].function.name, 'read_file');
  assert.ok(!JSON.stringify(result.messages[0]).includes('SKILL DUMP'));
});

test('keeps a short system prompt unchanged', () => {
  const result = distill.distillMessages([
    { role: 'system', content: 'Be brief.' },
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'hello' },
  ]);
  assert.strictEqual(result.messages[0].content, 'Be brief.');
  assert.strictEqual(result.keptShortSystem, 1);
  assert.strictEqual(result.longSystemMessages, 0);
});

test('drops extra system dumps after the first', () => {
  const result = distill.distillMessages([
    { role: 'system', content: LONG },
    { role: 'system', content: LONG },
    { role: 'user', content: 'go' },
    { role: 'assistant', content: 'ok' },
  ]);
  assert.strictEqual(result.messages.filter((m) => m.role === 'system').length, 1);
  assert.strictEqual(result.longSystemMessages, 2);
});

test('coverage report never retains conversation text', () => {
  const dataset = path.join(root, 'conversations.jsonl');
  fs.writeFileSync(dataset, `${JSON.stringify({
    messages: [
      { role: 'system', content: LONG },
      { role: 'user', content: 'SECRET_PROMPT_BODY' },
      { role: 'assistant', content: 'SECRET_ANSWER_BODY' },
    ],
  })}\n`, { mode: 0o600 });
  fs.chmodSync(dataset, 0o600);
  const receipts = path.join(root, 'history.jsonl');
  fs.writeFileSync(receipts, `${JSON.stringify({
    schema: 'hermes-yolo/route-receipt-v2',
    route: { selectedBackend: 'grok' },
    request: { kind: 'prompt', taskDigest: 'abc' },
  })}\n`);
  const out = path.join(root, 'prompt-distill.jsonl');
  const report = distill.processDataset({
    dataset,
    out,
    receipts,
    maxSystemChars: 800,
  });
  assert.strictEqual(report.schema, distill.SCHEMA);
  assert.strictEqual(report.paidTrain, false);
  assert.strictEqual(report.hermesBaselineChanged, false);
  assert.strictEqual(report.distilledRows, 1);
  assert.strictEqual(report.longSystemMessages, 1);
  assert.ok(report.compressionRatio < 0.1);
  assert.strictEqual(report.hermesYoloReceipts.withMessages, 0);
  assert.strictEqual(report.hermesYoloReceipts.gap, 'hermes-yolo-route-receipts-have-no-chat-traces');
  const serialized = JSON.stringify(report);
  assert.strictEqual(serialized.includes('SECRET_PROMPT_BODY'), false);
  assert.strictEqual(serialized.includes('SECRET_ANSWER_BODY'), false);
  assert.strictEqual(serialized.includes('SKILL DUMP'), false);
  const written = fs.readFileSync(out, 'utf8');
  assert.strictEqual(written.includes('SKILL DUMP'), false);
  assert.ok(written.includes('fix the lock file') === false);
  assert.ok(written.includes('SECRET_PROMPT_BODY'));
  assert.strictEqual(fs.statSync(out).mode & 0o777, 0o600);
});

test('refuses to overwrite conversations.jsonl', () => {
  const dataset = path.join(root, 'src.jsonl');
  fs.writeFileSync(dataset, '{"messages":[{"role":"user","content":"a"},{"role":"assistant","content":"b"}]}\n');
  assert.throws(
    () => distill.processDataset({ dataset, out: path.join(root, 'conversations.jsonl') }),
    /conversations\.jsonl/,
  );
});

test('CLI --json and tinker-yolo prompt-distill dispatch', () => {
  const dataset = path.join(root, 'cli.jsonl');
  fs.writeFileSync(dataset, `${JSON.stringify({
    messages: [
      { role: 'system', content: LONG },
      { role: 'user', content: 'run tests' },
      { role: 'assistant', content: 'running' },
    ],
  })}\n`);
  const cli = spawnSync(process.execPath, [TOOL, '--dataset', dataset, '--json', '--limit', '1'], {
    encoding: 'utf8',
  });
  assert.strictEqual(cli.status, 0, cli.stderr);
  const payload = JSON.parse(cli.stdout);
  assert.strictEqual(payload.distilledRows, 1);
  assert.strictEqual(payload.paidTrain, false);
  assert.match(payload.recommendation, /prompt distillation/i);

  const wrapped = spawnSync(WRAPPER, ['prompt-distill', '--dataset', dataset, '--json'], {
    encoding: 'utf8',
    env: { ...process.env, TINKER_STATE_DIR: path.join(root, 'tinker-state') },
  });
  assert.strictEqual(wrapped.status, 0, `${wrapped.stderr}\n${wrapped.stdout}`);
  const wrappedPayload = JSON.parse(wrapped.stdout);
  assert.strictEqual(wrappedPayload.schema, distill.SCHEMA);
  assert.strictEqual(wrappedPayload.paidTrain, false);

  const help = spawnSync(WRAPPER, ['--help'], { encoding: 'utf8' });
  assert.match(help.stdout, /prompt-distill/);
});

test('bin wrapper is the same tool', () => {
  const src = fs.readFileSync(BIN, 'utf8');
  assert.match(src, /hermes-yolo-tinker-prompt-distill/);
});

process.stdout.write(`PASS ${passed}/7 hermes-yolo-tinker-prompt-distill\n`);
