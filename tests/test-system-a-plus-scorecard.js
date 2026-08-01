'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseHermesDefaults, letterFromScore } = require('../tools/system-a-plus-scorecard');

test('letterFromScore still fail-closed for A+', () => {
  assert.equal(letterFromScore(0.99, true), 'B+');
  assert.equal(letterFromScore(0.99, false, { ndcg: 0.94 }), 'A+');
});

test('parseHermesDefaults flags glm-coding primary as dead', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-cfg-'));
  const p = path.join(dir, 'config.yaml');
  fs.writeFileSync(
    p,
    [
      'model:',
      '  ollama_num_ctx: 65536',
      '  max_tokens: 2048',
      '  provider: custom:litellm-gateway',
      '  default: glm-coding',
      '  model: glm-coding',
      'providers:',
      '  litellm-gateway:',
      '    name: LiteLLM',
      '    default_model: glm-coding',
      '    model: glm-coding',
      '',
    ].join('\n'),
  );
  const bad = parseHermesDefaults(p);
  assert.equal(bad.ok, false);
  assert.ok(bad.deadHits.includes('glm-coding'));

  fs.writeFileSync(
    p,
    [
      'model:',
      '  ollama_num_ctx: 65536',
      '  max_tokens: 2048',
      '  provider: custom:litellm-gateway',
      '  default: kimi-code-fast',
      '  model: kimi-code-fast',
      'providers:',
      '  litellm-gateway:',
      '    name: LiteLLM',
      '    default_model: kimi-code-fast',
      '    model: kimi-code-fast',
      '',
    ].join('\n'),
  );
  const good = parseHermesDefaults(p);
  assert.equal(good.ok, true);
  assert.equal(good.topDefault, 'kimi-code-fast');
  fs.rmSync(dir, { recursive: true, force: true });
});
