#!/usr/bin/env node
'use strict';

/**
 * local-media-route — AMD local-ai-use pattern without requiring Lemonade install.
 *
 * Classifies multimodal requests (image/tts/stt) and prefers a local endpoint
 * when one is healthy. Chat/text stays on existing Hermes/economic routes.
 * Never claims local media is ready without a probe.
 *
 * Usage:
 *   node tools/local-media-route.js classify --task "generate an image of ..."
 *   node tools/local-media-route.js probe
 *   node tools/local-media-route.js decide --task "..."
 *   node tools/local-media-route.js self-test
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

const LEMONADE_DEFAULT = process.env.LEMONADE_URL || 'http://127.0.0.1:13305';
const OLLAMA_DEFAULT = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';

function classify(task) {
  const t = String(task || '').toLowerCase();
  if (/\b(image|picture|photo|draw|illustration|dall-?e|sd-turbo|img2img)\b/.test(t)) {
    return { modality: 'image', local_preferred: true };
  }
  if (/\b(tts|text to speech|speak this|read aloud|kokoro|elevenlabs)\b/.test(t)) {
    return { modality: 'tts', local_preferred: true };
  }
  if (/\b(stt|transcribe|whisper|speech to text|voice note)\b/.test(t)) {
    return { modality: 'stt', local_preferred: true };
  }
  return { modality: 'chat', local_preferred: false };
}

function probeUrl(urlStr, timeoutMs = 800) {
  return new Promise((resolve) => {
    let u;
    try {
      u = new URL(urlStr);
    } catch {
      resolve({ url: urlStr, ok: false, error: 'invalid_url' });
      return;
    }
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname || '/',
        method: 'GET',
        timeout: timeoutMs,
      },
      (res) => {
        res.resume();
        resolve({ url: urlStr, ok: res.statusCode >= 200 && res.statusCode < 500, status: res.statusCode });
      },
    );
    req.on('error', (err) => resolve({ url: urlStr, ok: false, error: err.code || err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ url: urlStr, ok: false, error: 'timeout' });
    });
    req.end();
  });
}

async function probe(opts = {}) {
  const lemonadeBase = opts.lemonadeUrl || LEMONADE_DEFAULT;
  const ollamaBase = opts.ollamaUrl || OLLAMA_DEFAULT;
  const [lemonade, ollama] = await Promise.all([
    probeUrl(`${lemonadeBase.replace(/\/$/, '')}/api/v1/models`),
    probeUrl(`${ollamaBase.replace(/\/$/, '')}/api/tags`),
  ]);
  return {
    lemonade: { ...lemonade, base: lemonadeBase },
    ollama: { ...ollama, base: ollamaBase },
    any_local: Boolean(lemonade.ok || ollama.ok),
  };
}

async function decide(task, opts = {}) {
  const cls = classify(task);
  if (!cls.local_preferred) {
    return {
      ok: true,
      modality: cls.modality,
      route: 'economic_router_chat',
      local: false,
      reason: 'chat/text stays on Hermes economic router / cloud LLM',
    };
  }
  const health = opts.probeResult || await probe(opts);
  if (health.lemonade.ok) {
    return {
      ok: true,
      modality: cls.modality,
      route: 'lemonade_local_media',
      local: true,
      endpoint: health.lemonade.base,
      reason: 'Lemonade healthy — multimodal on-device',
      probe: health,
    };
  }
  if (health.ollama.ok && cls.modality !== 'image') {
    return {
      ok: true,
      modality: cls.modality,
      route: 'ollama_local_audio_fallback',
      local: true,
      endpoint: health.ollama.base,
      reason: 'Ollama up; audio-ish local fallback (image still needs media server)',
      probe: health,
    };
  }
  return {
    ok: true,
    modality: cls.modality,
    route: 'cloud_media_or_skip',
    local: false,
    reason: 'No local media server probed healthy — do not claim local; use cloud media API or skip',
    probe: health,
  };
}

async function selfTest() {
  const img = classify('generate an image of a cat');
  if (img.modality !== 'image') throw new Error('image classify');
  const chat = classify('fix the hermes pair server');
  if (chat.modality !== 'chat') throw new Error('chat classify');
  const fakeProbe = {
    lemonade: { ok: false, base: LEMONADE_DEFAULT },
    ollama: { ok: false, base: OLLAMA_DEFAULT },
    any_local: false,
  };
  const d = await decide('draw a logo', { probeResult: fakeProbe });
  if (d.local !== false || d.route !== 'cloud_media_or_skip') {
    throw new Error('unhealthy probe must not claim local');
  }
  const d2 = await decide('draw a logo', {
    probeResult: {
      lemonade: { ok: true, base: 'http://127.0.0.1:13305' },
      ollama: { ok: false, base: OLLAMA_DEFAULT },
      any_local: true,
    },
  });
  if (!d2.local || d2.route !== 'lemonade_local_media') throw new Error('healthy lemonade should win');
  return { ok: true, cases: 4 };
}

async function main(argv = process.argv.slice(2)) {
  const cmd = argv[0] || 'self-test';
  if (cmd === 'self-test') {
    console.log(JSON.stringify(await selfTest()));
    return 0;
  }
  if (cmd === 'classify') {
    let task = '';
    for (let i = 1; i < argv.length; i++) {
      if (argv[i] === '--task' && argv[i + 1]) task = argv[++i];
    }
    console.log(JSON.stringify(classify(task), null, 2));
    return 0;
  }
  if (cmd === 'probe') {
    console.log(JSON.stringify(await probe(), null, 2));
    return 0;
  }
  if (cmd === 'decide') {
    let task = '';
    for (let i = 1; i < argv.length; i++) {
      if (argv[i] === '--task' && argv[i + 1]) task = argv[++i];
    }
    console.log(JSON.stringify(await decide(task), null, 2));
    return 0;
  }
  console.error('usage: local-media-route.js [classify|probe|decide|self-test]');
  return 2;
}

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = {
  classify,
  probe,
  decide,
  selfTest,
  main,
  LEMONADE_DEFAULT,
  OLLAMA_DEFAULT,
};
