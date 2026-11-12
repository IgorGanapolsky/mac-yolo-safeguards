#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const tool = require('../tools/mac-yolo-secret-scan');

const TOOL = path.join(__dirname, '..', 'tools', 'mac-yolo-secret-scan.js');
// Fake secrets are assembled at runtime so no secret-looking literal sits in the repo.
const crypto = require('crypto');
// Realistic-looking random body (not repetitive, so placeholder filters leave it alone).
const R = (n, seed, alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') => {
  let out = '';
  for (let i = 0; out.length < n; i++) {
    for (const b of crypto.createHash('sha256').update(`${seed}:${i}`).digest()) out += alphabet[b % alphabet.length];
  }
  return out.slice(0, n);
};
const UP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const FAKES = {
  'anthropic-key': 'sk-' + 'ant-' + 'api03-' + R(40, 1),
  'openai-key': 'sk-' + 'proj-' + R(40, 2),
  'github-token': 'gh' + 'p_' + R(36, 3),
  'stripe-key': 'sk_' + 'live_' + R(24, 4),
  'aws-access-key': 'AK' + 'IA' + R(16, 5, UP),
  'google-api-key': 'AI' + 'za' + R(35, 6),
  'slack-token': 'xo' + 'xb-' + '1234567890-' + R(12, 7),
  'private-key': '-----' + 'BEGIN RSA PRIVATE KEY-----\\n' + R(60, 8) + '\\n-----' + 'END RSA PRIVATE KEY-----',
  'password-assignment': R(13, 9),
};
const LINES = {
  'anthropic-key': (s) => `{"text":"export KEY=${s} done"}`,
  'openai-key': (s) => `{"text":"OPENAI=${s}"}`,
  'github-token': (s) => `{"text":"token ${s} here"}`,
  'stripe-key': (s) => `{"text":"${s}"}`,
  'aws-access-key': (s) => `{"text":"id ${s}"}`,
  'google-api-key': (s) => `{"text":"key=${s}"}`,
  'slack-token': (s) => `{"text":"${s}"}`,
  'private-key': (s) => `{"text":"${s}"}`,
  'password-assignment': (s) => `{"text":"{\\"password\\": \\"${s}\\"}"}`,
};

const BENIGN = [
  '{"text":"pip install sk-learn and task-123 are fine"}',
  '{"text":"hash e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"}',
  '{"text":"id 123e4567-e89b-12d3-a456-426614174000"}',
  '{"type":"image","data":"' + 'iVBORw0KGgoAAAANSUhEUgAA'.repeat(500) + '"}',
  '{"text":"Reset your password: we never ask for it. The secret to good tests is speed."}',
  '{"text":"password: \\"short\\" and token = \\"two words here\\""}',
  '{"text":"risk-management and desk-assistant-sk-12"}',
  '{"text":"AKIA is a prefix; AKIAshort"}',
];

const secretValues = Object.values(FAKES);
function noSecrets(text) {
  for (const v of secretValues) assert.ok(!text.includes(v), 'output leaked a secret value');
}

// Pure detection: each kind found exactly once, with the right kind.
for (const [kind, secret] of Object.entries(FAKES)) {
  const found = tool.findInLine(LINES[kind](secret));
  assert.deepStrictEqual(found.map((f) => f.kind), [kind], `${kind} detected exactly once`);
}
for (const line of BENIGN) assert.deepStrictEqual(tool.findInLine(line), [], `no false positive: ${line.slice(0, 50)}`);

// The fingerprint is 4 chars, an ellipsis, 8 hex, and not the value.
assert.match(tool.fingerprint(FAKES['github-token']), /^ghp_…[0-9a-f]{8}$/);

// Placeholders and examples are ignored; a real-looking value of the same shape is still caught.
const detect = (line) => tool.findInLine(line).map((f) => f.kind);
const ignored = [
  '{"text":"key ' + 'sk-' + 'ant-' + 'api03-' + R(30, 20) + 'EXAMPLE"}',
  '{"text":"key ' + 'sk-' + 'ant-' + 'api03-' + R(20, 21) + '-example-' + R(10, 22) + '"}',
  '{"text":"OPENAI=' + 'sk-' + 'proj-' + 'x'.repeat(40) + '"}',
  '{"text":"OPENAI=' + 'sk-' + 'proj-' + 'XXXX' + R(36, 23) + '"}',
  '{"text":"' + 'sk-' + 'proj-' + R(10, 24) + 'your_' + 'key_here_' + R(20, 25) + '"}',
  '{"text":"' + 'sk-' + 'proj-' + 'YOUR_' + 'KEY_' + R(36, 26) + '"}',
  '{"text":"' + 'sk-' + 'proj-<' + R(36, 27) + '>"}',
  '{"text":"' + 'sk-' + 'proj-' + R(20, 28) + 'REDACTED' + R(12, 29) + '"}',
  '{"text":"' + 'sk-' + 'proj-' + 'placeholder' + R(30, 30) + '"}',
  '{"text":"' + 'sk-' + 'proj-' + 'dummy' + R(30, 31) + '"}',
  '{"text":"' + 'sk_' + 'live_' + 'test_' + R(24, 32) + '"}',
  '{"text":"ghp_' + 'a'.repeat(36) + '"}',
  '{"text":"id ' + 'AKIAIOSFODNN7' + 'EXAMPLE"}',
  '{"text":"id ' + 'AK' + 'IA' + 'AAAAAAAAAAAAAAAA"}',
  '{"text":"password = \"$' + 'DB_PASSWORD_VALUE\""}',
  '{"text":"password = \"${' + 'DB_PASSWORD}\""}',
  '{"text":"token = \"process.' + 'env.API_TOKEN\""}',
  '{"text":"secret = \"os.' + 'environ_secret_value\""}',
  '{"text":"api_key = \"getenv' + 'Value1234\""}',
  '{"text":"password = \"hashPassword' + '(userInput)\""}',
  '{"text":"secret: \"' + 'a'.repeat(20) + '\""}',
  '{"text":"password: \"your_' + 'password_here\""}',
];
for (const line of ignored) assert.deepStrictEqual(detect(line), [], `ignored: ${line.slice(0, 60)}`);
assert.deepStrictEqual(detect('{"text":"export K=' + 'sk-' + 'ant-' + 'api03-' + R(40, 40) + '"}'), ['anthropic-key']);
assert.deepStrictEqual(detect('{"text":"password = \"' + 'hunter2' + 'hunter2\""}'), ['password-assignment']);
assert.deepStrictEqual(detect('{"text":"password = \"' + 'password' + '123\""}'), ['password-assignment'], 'real-looking dictionary words stay flagged');
assert.deepStrictEqual(detect('{"text":"secret = \"' + R(24, 41) + '\""}'), ['password-assignment']);

// Temp HOME with transcripts in all three roots.
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mys-secret-'));
const old = (file, minutes = 10) => { const t = new Date(Date.now() - minutes * 60000); fs.utimesSync(file, t, t); };
const mk = (rel, text, minutes = 10) => {
  const f = path.join(home, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
  old(f, minutes);
  return f;
};
const kinds = Object.keys(FAKES);
const mixed = [];
for (const k of kinds) mixed.push(LINES[k](FAKES[k]), BENIGN[0]);
const claudeText = mixed.join('\n') + '\n';
const claude = mk('.claude/projects/-p/a.jsonl', claudeText);
const omp = mk('.omp/agent/sessions/s/b.jsonl', LINES['aws-access-key'](FAKES['aws-access-key']) + '\r\n' + BENIGN.join('\n'));
const grok = mk('.grok/sessions/c.jsonl', BENIGN.join('\n') + '\n');
mk('.grok/skills/readme.md', LINES['aws-access-key'](FAKES['aws-access-key']));            // wrong extension
mk('.claude/projects/-p/stale.jsonl', LINES['aws-access-key'](FAKES['aws-access-key']), 60 * 24 * 40); // outside window
const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mys-outside-'));
fs.writeFileSync(path.join(outside, 'leak.jsonl'), LINES['aws-access-key'](FAKES['aws-access-key']));
fs.symlinkSync(outside, path.join(home, '.claude', 'projects', 'link-dir'));
fs.symlinkSync(path.join(outside, 'leak.jsonl'), path.join(home, '.claude', 'projects', 'link-file.jsonl'));

const env = { ...process.env, MAC_YOLO_HOME: home };
const run = (...args) => { const out = execFileSync(process.execPath, [TOOL, ...args], { encoding: 'utf8', env }); noSecrets(out); return JSON.parse(out); };

const s = run('scan');
assert.strictEqual(s.totals.filesScanned, 3, 'symlinks, stale files and non-transcripts are not scanned');
assert.strictEqual(s.totals.filesWithSecrets, 2);
assert.strictEqual(s.totals.secrets, kinds.length + 1);
for (const k of kinds) assert.ok(s.totals.byKind[k] >= 1, `${k} counted`);
const first = s.files.find((f) => f.file === '~/.claude/projects/-p/a.jsonl');
assert.ok(first, 'home is shown as ~');
assert.deepStrictEqual(first.findings[0], { kind: 'anthropic-key', line: 1, fingerprint: tool.fingerprint(FAKES['anthropic-key']) });
assert.ok(!JSON.stringify(s).includes(home), 'real path not printed');
assert.strictEqual(run('scan', '--since-days', '90').totals.filesScanned, 4);

// Cache: a second scan answers from the cache, never stores a value, and a changed file is rescanned.
const cacheFile = path.join(home, 'Library', 'Caches', 'MacYoloSafeguards', 'secret-scan.json');
assert.ok(fs.existsSync(cacheFile));
noSecrets(fs.readFileSync(cacheFile, 'utf8'));
assert.strictEqual(fs.statSync(cacheFile).mode & 0o777, 0o600);
const warm = run('scan');
assert.strictEqual(warm.cacheHits, 3);
assert.strictEqual(warm.totals.secrets, s.totals.secrets);
assert.strictEqual(run('scan', '--no-cache').cacheHits, 0);
assert.strictEqual(run('scan', '--since-days', '90').totals.filesScanned, 4);

// Redact: only the secrets change; all other bytes are identical; mode kept; mtime kept.
fs.chmodSync(claude, 0o600);
const ompBefore = fs.readFileSync(omp, 'latin1');
const r = run('redact', claude);
assert.strictEqual(r.redacted, kinds.length);
assert.strictEqual(r.filesChanged, 1);
let expected = claudeText;
for (const k of kinds) {
  const line = LINES[k](FAKES[k]);
  expected = expected.replace(line, tool.redactLine(line).text);
}
const got = fs.readFileSync(claude, 'utf8');
assert.strictEqual(got, expected);
for (const k of kinds) assert.ok(got.includes(`[REDACTED:${k}]`));
assert.ok(got.includes(BENIGN[0]));
assert.strictEqual(fs.statSync(claude).mode & 0o777, 0o600);
assert.ok(Date.now() - fs.statSync(claude).mtimeMs > 5 * 60000, 'mtime preserved');
assert.deepStrictEqual(fs.readdirSync(path.dirname(claude)).filter((n) => n.includes('redact')), [], 'no temp files left');
assert.strictEqual(run('scan').totals.byKind['anthropic-key'], undefined, 'nothing left to find');

// --all keeps CRLF and unterminated last lines byte-for-byte.
const all = run('redact', '--all');
assert.strictEqual(all.redacted, 1);
const ompAfter = fs.readFileSync(omp, 'latin1');
assert.strictEqual(ompAfter, ompBefore.replace(FAKES['aws-access-key'], '[REDACTED:aws-access-key]'));
assert.ok(ompAfter.includes('\r\n'));
assert.ok(!ompAfter.endsWith('\n'));

// A file touched under 2 minutes ago is skipped and left alone; so are targets outside the roots.
const live = mk('.claude/projects/-p/live.jsonl', LINES['github-token'](FAKES['github-token']) + '\n', 0);
const liveBefore = fs.readFileSync(live);
const lr = run('redact', live);
assert.strictEqual(lr.skipped.length, 1);
assert.strictEqual(lr.skipped[0].reason, 'modified-in-last-2-minutes');
assert.ok(fs.readFileSync(live).equals(liveBefore));
assert.strictEqual(run('redact', '--all').skipped.length, 1);
const badRun = require('child_process').spawnSync(process.execPath, [TOOL, 'redact', path.join(outside, 'leak.jsonl')], { encoding: 'utf8', env });
assert.strictEqual(badRun.status, 1);
assert.strictEqual(JSON.parse(badRun.stdout).ok, false);
assert.ok(fs.readFileSync(path.join(outside, 'leak.jsonl'), 'utf8').includes(FAKES['aws-access-key']), 'file outside roots untouched');
assert.strictEqual(fs.readFileSync(grok, 'utf8'), BENIGN.join('\n') + '\n');

// ReDoS: 100k hostile characters per pattern each finish in under 50 ms.
const HDR = '-----' + 'BEGIN PRIVATE' + ' KEY-----';
const hostile = {
  anthropic: 'sk-' + 'ant-' + 'a'.repeat(100000),
  anthropicDashes: ('sk-' + 'ant-').repeat(20000),
  openai: 'sk-' + '-'.repeat(100000),
  github: 'gh' + 'p_' + 'a'.repeat(100000),
  githubPat: 'github' + '_pat_' + '_'.repeat(100000),
  stripe: 'sk_' + 'live_' + 'a'.repeat(15) + ' '.repeat(100000),
  aws: 'AK' + 'IA' + 'A'.repeat(100000),
  google: 'AI' + 'za' + 'a'.repeat(34) + ' '.repeat(100000),
  slack: 'xo' + 'xb-' + '-'.repeat(100000),
  keyHeaders: HDR.repeat(3700),
  keyBody: HDR + 'a'.repeat(100000),
  keySpaces: '-----BEGIN ' + ' '.repeat(100000),
  keyManyBodies: (HDR + 'a'.repeat(8000)).repeat(12),
  passwordSpaces: 'password' + ' '.repeat(100000),
  passwordMany: 'password: '.repeat(10000),
  passwordQuotes: 'password": "' + 'a'.repeat(100000),
  passwordBackslashes: 'password' + '\\'.repeat(100000),
  tokenRepeat: 'token="aaaaaaa '.repeat(7000),
};
for (const [name, input] of Object.entries(hostile)) {
  const t0 = process.hrtime.bigint();
  tool.findInLine(input.slice(0, 100000));
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 50, `${name} took ${ms.toFixed(1)} ms`);
}

// The worker-thread path (many files) finds the same things as the in-process path.
const home2 = fs.mkdtempSync(path.join(os.tmpdir(), 'mys-secret-many-'));
for (let i = 0; i < 20; i++) {
  const f = path.join(home2, '.claude', 'projects', 'p', `f${i}.jsonl`);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, BENIGN[0] + '\n' + LINES['github-token']('gh' + 'p_' + R(36, 100 + i)) + '\n');
  old(f);
}
const many = JSON.parse(execFileSync(process.execPath, [TOOL, 'scan'], { encoding: 'utf8', env: { ...env, MAC_YOLO_HOME: home2, MAC_YOLO_SECRET_WORKERS: '3' } }));
assert.strictEqual(many.totals.secrets, 20);
assert.strictEqual(many.totals.filesWithSecrets, 20);
fs.rmSync(home2, { recursive: true, force: true });

fs.rmSync(home, { recursive: true, force: true });
fs.rmSync(outside, { recursive: true, force: true });
console.log('mac-yolo-secret-scan: ok');
