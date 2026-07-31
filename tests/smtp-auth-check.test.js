'use strict';

// Seven consecutive sends from igor@igorganapolsky.com bounced with
// `535 5.7.8 authentication failed`, and the obvious reading — wrong password — was
// wrong. The relay was healthy (reachable on 587, advertising AUTH PLAIN LOGIN); what
// had broken was that igorganapolsky.com's zone had been deleted at the DNS provider
// it is delegated to, so the domain SERVFAILed and the mailbox went with it.
//
// The distinction is the whole point of this tool: DOMAIN_BROKEN and AUTH_FAILED have
// different fixes, and reporting only the latter sends someone to re-type a password
// that was probably correct.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const TOOL = path.join(ROOT, 'tools', 'smtp-auth-check.js');
const { checkDomain } = require('../tools/smtp-auth-check.js');

function run(args, cwd = ROOT) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [TOOL, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (err) {
    return { code: err.status, out: String(err.stdout || '') };
  }
}

test('a domain whose zone is gone reports DOMAIN_BROKEN, not an auth problem', async () => {
  const r = await checkDomain('igorganapolsky.com');
  assert.equal(r.resolves, false);
  assert.match(String(r.error), /SERVFAIL|REFUSED/i,
    'delegated-but-unserved shows as SERVFAIL; this is what a deleted zone looks like');
});

test('a healthy mail domain resolves with MX, SPF and DMARC — the check is not vacuous', async () => {
  const r = await checkDomain('gmail.com');
  assert.equal(r.resolves, true);
  assert.ok(r.mx.length > 0, 'must find MX records');
  assert.ok(r.spf, 'must find SPF');
  assert.ok(r.dmarc, 'must find DMARC');
});

test('a nonexistent domain is distinguished from an unserved zone', async () => {
  // NXDOMAIN (never registered) and SERVFAIL (registered, delegated, zone deleted) have
  // completely different remedies, so they must not collapse into one message.
  const r = await checkDomain('definitely-not-a-real-domain-xyz123.com');
  assert.equal(r.resolves, false);
  assert.match(String(r.error), /NOTFOUND|NXDOMAIN/i);
});

test('the broken sender is reported as DOMAIN_BROKEN end to end', () => {
  const r = run(['--user', 'igor@igorganapolsky.com', '--json']);
  const parsed = JSON.parse(r.out);
  assert.equal(parsed.verdict, 'DOMAIN_BROKEN');
  assert.match(parsed.advice, /No credential change can fix/,
    'must say plainly that re-entering the password will not help');
  assert.notEqual(r.code, 0, 'a broken sender must exit non-zero so a gate can act on it');
});

test('a missing Keychain entry is NO_SECRET, not a silent pass', () => {
  const r = run(['--user', 'someone@gmail.com', '--host', 'smtp.gmail.com',
                 '--secret', 'DEFINITELY_NOT_A_STORED_SECRET_XYZ', '--json']);
  const parsed = JSON.parse(r.out);
  assert.equal(parsed.verdict, 'NO_SECRET');
  assert.match(parsed.advice, /secret-put\.sh/, 'must name the command that fixes it');
  assert.notEqual(r.code, 0);
});

test('--write-health emits a gate artifact keyed by sender', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-'));
  run(['--user', 'igor@igorganapolsky.com', '--write-health'], tmp);
  const p = path.join(tmp, 'coordination', 'sender-health.json');
  assert.ok(fs.existsSync(p), 'must write coordination/sender-health.json');
  const health = JSON.parse(fs.readFileSync(p, 'utf8'));
  const entry = health.senders['igor@igorganapolsky.com'];
  assert.equal(entry.status, 'blocked', 'a sender proven not to deliver must be blocked');
  assert.equal(entry.verdict, 'DOMAIN_BROKEN');
  assert.ok(entry.checkedAt, 'must record when, so a stale verdict is visible');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('the secret never appears in output', () => {
  // The tool reads from Keychain; nothing it prints may contain the value.
  const r = run(['--user', 'igor@igorganapolsky.com', '--json']);
  assert.ok(!/password["']?\s*:\s*["'][^"']+/i.test(r.out),
    'no credential-shaped value may appear in output');
  assert.match(r.out, /"secretName"/, 'only the secret NAME is reported');
});

test('secret-put refuses a piped value', () => {
  // Accepting stdin would put the secret back into a transcript or history, which is
  // exactly what this script exists to avoid.
  const script = path.join(ROOT, 'tools', 'secret-put.sh');
  let code = 0;
  try {
    execFileSync('bash', [script, 'TEST_NAME'], { input: 'sneaky-value\n', encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (err) { code = err.status; }
  assert.equal(code, 3, 'must exit 3 when stdin is not a terminal');
});
