#!/usr/bin/env node
'use strict';

// Local model memory check: which local LLMs are loaded, how much RAM they
// hold, what sits on disk, and when a smaller quantization would free memory
// for the coding agents. Read-only: it never stops or deletes a model.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const GB = 1024 ** 3;
const LOADED_SHARE_WARN = 0.4;
const BIG_MODEL_BYTES = 4 * GB;
// Bits per weight for common formats. Q4_K_M is the usual "small but good" target.
const BITS = { F32: 32, F16: 16, BF16: 16, Q8_0: 8.5, Q6_K: 6.6, Q5_K_M: 5.7, Q5_0: 5.5, Q4_K_M: 4.85, Q4_0: 4.5 };
const TARGET = 'Q4_K_M';

const PROCESS_PATTERNS = [
  { kind: 'llama.cpp', re: /(^|\/)llama-(server|cli)\b/ },
  { kind: 'MLX', re: /\bmlx_lm\b|\bmlx-lm\b/ },
  { kind: 'LM Studio', re: /LM Studio|\/lms\b|lmstudio/i },
  { kind: 'Ollama runner', re: /ollama.*\brunner\b/ },
];

function run(cmd, args, timeout = 3000) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

function ollamaLoaded(fetchJson) {
  const body = fetchJson('http://127.0.0.1:11434/api/ps');
  if (!body || !Array.isArray(body.models)) return { reachable: false, models: [] };
  return {
    reachable: true,
    models: body.models.map((m) => ({
      source: 'Ollama',
      name: m.name || m.model,
      bytes: Number(m.size) || 0,
      gpuBytes: Number(m.size_vram) || 0,
      parameters: m.details?.parameter_size || null,
      quantization: m.details?.quantization_level || null,
    })),
  };
}

function curlJson(url) {
  const out = run('curl', ['-s', '-m', '1', url], 2000);
  if (!out) return null;
  try {
    return JSON.parse(out);
  } catch {
    return null;
  }
}

function modelProcesses(psText) {
  const text = psText ?? run('ps', ['-axo', 'pid=,rss=,command=']) ?? '';
  const found = [];
  for (const line of text.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
    if (!m) continue;
    const hit = PROCESS_PATTERNS.find((p) => p.re.test(m[3]));
    if (hit) found.push({ kind: hit.kind, pid: Number(m[1]), bytes: Number(m[2]) * 1024, command: m[3].slice(0, 120) });
  }
  return found;
}

function dirBytes(dir) {
  const out = run('du', ['-sk', dir], 20000);
  const kb = out ? Number(out.split(/\s+/)[0]) : NaN;
  return Number.isFinite(kb) ? kb * 1024 : null;
}

function modelsOnDisk(home, sizeOf = dirBytes) {
  const stores = [
    { store: 'Ollama', dir: path.join(home, '.ollama', 'models') },
    { store: 'LM Studio', dir: path.join(home, '.lmstudio', 'models') },
    { store: 'LM Studio (old)', dir: path.join(home, '.cache', 'lm-studio', 'models') },
    { store: 'Hugging Face cache', dir: path.join(home, '.cache', 'huggingface', 'hub') },
  ];
  return stores
    .filter((s) => fs.existsSync(s.dir))
    .map((s) => ({ ...s, bytes: sizeOf(s.dir) }));
}

function smallerQuantBytes(model) {
  const bits = BITS[(model.quantization || '').toUpperCase()];
  if (!bits || bits <= BITS[TARGET] + 0.5 || !model.bytes) return null;
  return Math.round(model.bytes * (BITS[TARGET] / bits));
}

function gb(bytes) {
  return `${(bytes / GB).toFixed(1)} GB`;
}

function advise({ ramBytes, loaded, processes }) {
  const advice = [];
  const loadedBytes = loaded.reduce((s, m) => s + m.bytes, 0) + processes.reduce((s, p) => s + p.bytes, 0);
  const share = ramBytes ? loadedBytes / ramBytes : 0;
  if (share >= LOADED_SHARE_WARN) {
    advice.push({
      level: 'warn',
      text: `Local models hold ${gb(loadedBytes)} of ${gb(ramBytes)} RAM (${Math.round(share * 100)}%). Long agent sessions will start swapping. Unload models you are not using, for example "ollama stop <name>".`,
    });
  }
  for (const m of loaded) {
    const smaller = smallerQuantBytes(m);
    if (smaller && m.bytes >= BIG_MODEL_BYTES) {
      advice.push({
        level: 'info',
        model: m.name,
        text: `${m.name} is ${m.quantization} at ${gb(m.bytes)}. A ${TARGET} build would be about ${gb(smaller)} and frees about ${gb(m.bytes - smaller)}.`,
      });
    }
  }
  return { advice, loadedBytes, loadedShare: Number(share.toFixed(3)) };
}

function scan(opts = {}) {
  const ramBytes = opts.ramBytes ?? os.totalmem();
  const ollama = ollamaLoaded(opts.fetchJson || curlJson);
  const processes = modelProcesses(opts.psText).filter((p) => !(ollama.reachable && p.kind === 'Ollama runner'));
  const onDisk = modelsOnDisk(opts.home || os.homedir(), opts.sizeOf);
  const { advice, loadedBytes, loadedShare } = advise({ ramBytes, loaded: ollama.models, processes });
  return {
    ok: true,
    ramBytes,
    ollamaReachable: ollama.reachable,
    loaded: ollama.models,
    processes,
    processMemoryNote: 'Process memory is resident memory only. On Apple Silicon, llama.cpp and MLX keep model weights in GPU memory, which this count can miss.',
    loadedBytes,
    loadedShare,
    onDisk,
    onDiskBytes: onDisk.reduce((s, d) => s + (d.bytes || 0), 0),
    advice,
  };
}

module.exports = { scan, advise, modelProcesses, smallerQuantBytes, modelsOnDisk };

if (require.main === module) {
  const r = scan();
  if (process.argv.includes('--text')) {
    console.log(`Loaded local models: ${gb(r.loadedBytes)} of ${gb(r.ramBytes)} RAM`);
    for (const m of r.loaded) console.log(`  ${m.name} ${m.quantization || ''} ${gb(m.bytes)}`);
    for (const p of r.processes) console.log(`  ${p.kind} pid ${p.pid} ${gb(p.bytes)} resident (GPU memory not counted)`);
    for (const d of r.onDisk) console.log(`On disk, ${d.store}: ${d.bytes == null ? 'unknown' : gb(d.bytes)}`);
    for (const a of r.advice) console.log(`${a.level === 'warn' ? 'Warning' : 'Tip'}: ${a.text}`);
    if (!r.advice.length) console.log('No local model is crowding out your agents.');
  } else {
    console.log(JSON.stringify(r, null, 2));
  }
}
