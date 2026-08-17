'use strict';

const assert = require('assert');
const { classify, decide, selfTest, main } = require('../tools/local-media-route');

console.log('=== test-local-media-route ===');

assert.strictEqual(classify('generate an image of Mars').modality, 'image');
assert.strictEqual(classify('transcribe this whisper file').modality, 'stt');
assert.strictEqual(classify('text to speech please').modality, 'tts');
assert.strictEqual(classify('merge the PR when green').modality, 'chat');

(async () => {
  const st = await selfTest();
  assert.strictEqual(st.ok, true);

  const offline = await decide('draw a poster', {
    probeResult: {
      lemonade: { ok: false, base: 'http://127.0.0.1:13305' },
      ollama: { ok: false, base: 'http://127.0.0.1:11434' },
      any_local: false,
    },
  });
  assert.strictEqual(offline.local, false);
  assert.strictEqual(offline.route, 'cloud_media_or_skip');

  const code = await main(['self-test']);
  assert.strictEqual(code, 0);

  console.log('✅ test-local-media-route PASSED');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
