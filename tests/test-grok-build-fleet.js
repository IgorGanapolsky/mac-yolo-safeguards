'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TOOL = path.join(ROOT, 'tools', 'grok-build-fleet.js');
const SAFETY = path.join(ROOT, 'hooks', 'grok-build-fleet', 'pre-tool-use-safety.js');

const {
  MANAGED_BEGIN,
  MANAGED_END,
  mergeManagedConfig,
  setUiForkSecondary,
  readUiForkSecondary,
  renderManagedConfigBlock,
  evaluateSafety,
  pickInstalledOllamaModel,
  LOCAL_MODELS,
  parseArgs,
} = require(TOOL);

// --- pure unit tests ---
assert.strictEqual(parseArgs([]).status, true);
assert.strictEqual(parseArgs(['--install']).install, true);
assert.strictEqual(parseArgs(['--doctor', '--json']).json, true);

const tags = {
  models: [
    { name: 'qwen3.5:9b-hermes-64k' },
    { name: 'qwen2.5:3b-hermes-64k' },
  ],
};
assert.strictEqual(
  pickInstalledOllamaModel(tags, 'qwen3.5:9b-hermes-64k', ['qwen3.5:9b']),
  'qwen3.5:9b-hermes-64k',
);
assert.strictEqual(
  pickInstalledOllamaModel({ models: [{ name: 'qwen3.5:9b' }] }, 'qwen3.5:9b-hermes-64k', ['qwen3.5:9b']),
  'qwen3.5:9b',
);
assert.strictEqual(pickInstalledOllamaModel({ models: [] }, 'x', []), null);

const denyForce = evaluateSafety('run_terminal_command', { command: 'git push --force origin main' });
assert.strictEqual(denyForce.decision, 'deny');
assert.match(denyForce.reason, /force/i);

const denyRm = evaluateSafety('Bash', { command: 'rm -rf /tmp/foo' });
assert.strictEqual(denyRm.decision, 'deny');

const denyEnv = evaluateSafety('read_file', { target_file: '/Users/me/proj/.env.local' });
assert.strictEqual(denyEnv.decision, 'deny');

const allowTest = evaluateSafety('run_terminal_command', { command: 'npm test' });
assert.strictEqual(allowTest.decision, 'allow');

const allowRead = evaluateSafety('read_file', { target_file: '/Users/me/proj/README.md' });
assert.strictEqual(allowRead.decision, 'allow');

const block = renderManagedConfigBlock(
  LOCAL_MODELS.map((def) => ({ def, selectedModel: def.model })),
);
assert(block.includes(MANAGED_BEGIN));
assert(block.includes(MANAGED_END));
assert(block.includes('[model.ollama-hermes-64k]'));
assert(block.includes('fork_secondary_model = "ollama-hermes-fast"'));

const mergedOnce = mergeManagedConfig('[ui]\nyolo = true\nfork_secondary_model = "grok-build"\n', block);
assert(mergedOnce.includes('yolo = true'));
assert(mergedOnce.includes('[model.ollama-hermes-64k]'));
const withUiFork = setUiForkSecondary(mergedOnce, 'ollama-hermes-fast');
assert.strictEqual(readUiForkSecondary(withUiFork), 'ollama-hermes-fast');
assert(withUiFork.includes('yolo = true'));
const mergedTwice = mergeManagedConfig(withUiFork, block);
const countBegin = (mergedTwice.match(new RegExp(MANAGED_BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
assert.strictEqual(countBegin, 1, 'managed block must be idempotent');

// --- hook script CLI ---
function runHook(payload) {
  const result = spawnSync(process.execPath, [SAFETY], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    timeout: 5000,
  });
  const out = JSON.parse((result.stdout || '{}').trim() || '{}');
  return { status: result.status, out };
}

const hookDeny = runHook({
  toolName: 'run_terminal_command',
  toolInput: { command: 'git reset --hard HEAD' },
});
assert.strictEqual(hookDeny.out.decision, 'deny');
assert.strictEqual(hookDeny.status, 2);

const hookAllow = runHook({
  toolName: 'run_terminal_command',
  toolInput: { command: 'ls -la' },
});
assert.strictEqual(hookAllow.out.decision, 'allow');
assert.strictEqual(hookAllow.status, 0);

// --- install into temp HOME ---
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'grok-build-fleet-'));
const fakeOllama = {
  models: [
    { name: 'qwen3.5:9b-hermes-64k' },
    { name: 'qwen2.5:3b-hermes-64k' },
  ],
};
const fakeLite = { data: [{ id: 'hermes-local' }] };

// Monkey-patch via env + fake curl is hard; instead unit-test install paths by
// writing config/hooks through public APIs after stubbing probe with a local
// doctor that only checks files when network is unavailable.

const env = {
  ...process.env,
  HOME: tmpHome,
  GROK_CONFIG_PATH: path.join(tmpHome, '.grok', 'config.toml'),
  GROK_HOOKS_DIR: path.join(tmpHome, '.grok', 'hooks'),
};

// Seed a minimal config
fs.mkdirSync(path.join(tmpHome, '.grok'), { recursive: true });
fs.writeFileSync(
  env.GROK_CONFIG_PATH,
  '[cli]\ninstaller = "internal"\n\n[ui]\nyolo = true\n',
  'utf8',
);

// Create a fake grok binary
const binDir = path.join(tmpHome, '.grok', 'bin');
fs.mkdirSync(binDir, { recursive: true });
const fakeGrok = path.join(binDir, 'grok');
fs.writeFileSync(fakeGrok, '#!/bin/sh\necho "grok 0.2.101 (test)"\n', { mode: 0o755 });

// Directly merge + install hooks without live network by calling lower-level pieces
const {
  locations,
  installHookAssets,
  mergeManagedConfig: merge,
  renderManagedConfigBlock: render,
} = require(TOOL);

const locs = locations(env, ROOT);
fs.mkdirSync(path.dirname(locs.configPath), { recursive: true });
const managed = render(LOCAL_MODELS.map((def) => ({ def, selectedModel: def.model })));
const existing = fs.readFileSync(locs.configPath, 'utf8');
fs.writeFileSync(locs.configPath, merge(existing, managed), { mode: 0o600 });
const hooks = installHookAssets(locs);
assert(fs.existsSync(hooks.json));
assert(fs.existsSync(hooks.safety));
const installedJson = fs.readFileSync(hooks.json, 'utf8');
assert(installedJson.includes(hooks.safety));
assert(!installedJson.includes('{{SAFETY_HOOK}}'));

const cfg = fs.readFileSync(locs.configPath, 'utf8');
assert(cfg.includes('yolo = true'));
assert(cfg.includes('[model.ollama-hermes-64k]'));
assert(cfg.includes('qwen3.5:9b-hermes-64k'));

// Idempotent second merge
fs.writeFileSync(locs.configPath, merge(cfg, managed), { mode: 0o600 });
const cfg2 = fs.readFileSync(locs.configPath, 'utf8');
assert.strictEqual((cfg2.match(/\[model\.ollama-hermes-64k\]/g) || []).length, 1);

// Secret scan on tool + hooks (word-boundary; avoid matching "disk-destructive")
const secretScan = spawnSync(
  'rg',
  ['-n', '\\bxai-[A-Za-z0-9_-]{16,}\\b|\\bsk-[A-Za-z0-9]{20,}\\b|\\bghp_[A-Za-z0-9]{20,}\\b|\\bgithub_pat_[A-Za-z0-9_]{20,}\\b', TOOL, SAFETY],
  { encoding: 'utf8' },
);
assert.strictEqual(secretScan.status, 1, `no secret-like tokens in fleet sources\n${secretScan.stdout || ''}`);

console.log('test-grok-build-fleet: ok');
