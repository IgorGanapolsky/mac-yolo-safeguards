'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { rewireConfig } = require('../tools/moe-retire-dead-experts');

test('rewireConfig moves glm defaults to primary and backs up', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moe-rewire-'));
  const cfg = path.join(dir, 'config.yaml');
  fs.writeFileSync(
    cfg,
    [
      'model:',
      '  ollama_num_ctx: 65536',
      '  max_tokens: 2048',
      '  provider: custom:litellm-gateway',
      '  default: glm-coding',
      '  model: glm-coding',
      '  context_length: 202752',
      'providers:',
      '  litellm-gateway:',
      '    name: LiteLLM Gateway',
      '    api: http://127.0.0.1:4010/v1',
      '    default_model: glm-coding',
      '    model: glm-coding',
      '    context_length: 65536',
      'toolsets:',
      '- terminal',
      '',
    ].join('\n'),
  );
  const r = rewireConfig(cfg, 'kimi-code-fast');
  assert.equal(r.ok, true);
  assert.equal(r.changed, true);
  assert.ok(fs.existsSync(r.backupPath));
  const text = fs.readFileSync(cfg, 'utf8');
  assert.match(text, /default: kimi-code-fast/);
  assert.doesNotMatch(text, /^  default: glm-coding$/m);
  assert.match(text, /default_model: kimi-code-fast/);
  fs.rmSync(dir, { recursive: true, force: true });
});
