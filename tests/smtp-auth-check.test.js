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
const { checkDomain, classifyAuth } = require('../tools/smtp-auth-check.js');

function run(args, cwd = ROOT) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [TOOL, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (err) {
    return { code: err.status, out: String(err.stdout || '') };
  }
}

// DNS is injected, never live. The original versions required igorganapolsky.com to
// stay broken forever — so performing the prescribed remediation (restoring the zone)
// turned the suite red. That happened for real on 2026-08-01: three tests failed
// mid-session because the domain was fixed, which is the opposite of what a test should
// do. Live probing belongs outside the deterministic gate.
const fail = (code) => () => { const e = new Error(code); e.code = code; throw e; };
const stubResolver = (over = {}) => ({
  resolveNs: over.resolveNs || (async () => ['ns1.example.']),
  resolveMx: over.resolveMx || (async () => [{ exchange: 'mx1.example.', priority: 10 }]),
  resolveTxt: over.resolveTxt || (async () => [['v=spf1 include:example ~all']]),
});

test('SERVFAIL means the domain is broken — delegated but unserved', async () => {
  const r = await checkDomain('example.test', stubResolver({ resolveNs: fail('ESERVFAIL') }));
  assert.equal(r.exists, false);
  assert.equal(r.error, 'ESERVFAIL');
});

test('NXDOMAIN is broken too, and distinguished from SERVFAIL', async () => {
  // Different remedies: NXDOMAIN is a registrar problem, SERVFAIL is a deleted zone.
  const r = await checkDomain('example.test', stubResolver({ resolveNs: fail('ENOTFOUND') }));
  assert.equal(r.exists, false);
  assert.equal(r.error, 'ENOTFOUND');
});

test('a domain with NO MX still exists — outbound-only senders are legitimate', async () => {
  // resolveMx rejects ENODATA here. Treating that as "does not resolve" emitted
  // DOMAIN_BROKEN and skipped a relay auth that would have succeeded.
  const r = await checkDomain('example.test', stubResolver({ resolveMx: fail('ENODATA') }));
  assert.equal(r.exists, true, 'ENODATA on MX must not mark the domain broken');
  assert.equal(r.hasMx, false, 'but the absence of MX must be reported');
});

test('a healthy domain reports exists + MX + SPF', async () => {
  const r = await checkDomain('example.test', stubResolver());
  assert.equal(r.exists, true);
  assert.equal(r.hasMx, true);
  assert.ok(r.spf);
});

test('only a credential rejection is AUTH_FAILED', () => {
  // Labelling a relay/protocol failure as AUTH_FAILED and advising a password change is
  // precisely the misleading diagnosis this tool exists to prevent.
  assert.equal(classifyAuth({ ok: true, stage: 'auth', code: 235 }), 'OK');
  assert.equal(classifyAuth({ ok: false, stage: 'auth', code: 535 }), 'AUTH_FAILED');
  assert.equal(classifyAuth({ ok: false, stage: 'auth', code: 534 }), 'AUTH_FAILED');
  assert.equal(classifyAuth({ ok: false, stage: 'auth', code: 454 }), 'AUTH_TRANSIENT',
    '454 is transient — the credential was never judged invalid');
  // 504 is 5xx (permanent) and means "mechanism not implemented" — a relay
  // configuration fact, not a judgement on the credential. Which non-AUTH_FAILED bucket
  // it lands in matters less than that it is never AUTH_FAILED, so assert the invariant.
  assert.equal(classifyAuth({ ok: false, stage: 'auth', code: 504 }), 'RELAY_PROTOCOL_ERROR');
  for (const code of [454, 504, 421, 451]) {
    assert.notEqual(classifyAuth({ ok: false, stage: 'auth', code }), 'AUTH_FAILED',
      `${code} must never be reported as a rejected credential`);
  }
  assert.equal(classifyAuth({ ok: false, stage: 'starttls', code: 454 }), 'RELAY_PROTOCOL_ERROR',
    'a STARTTLS failure never reached the credential');
  assert.equal(classifyAuth({ ok: false, stage: 'ehlo', code: 421 }), 'RELAY_PROTOCOL_ERROR');
  assert.equal(classifyAuth(null), 'RELAY_UNREACHABLE');
});

test('a broken sender exits non-zero so a gate can act on it', () => {
  // Uses a domain reserved by RFC 2606 for testing, not a production one.
  const r = run(['--user', 'someone@invalid.invalid', '--json']);
  const parsed = JSON.parse(r.out);
  assert.equal(parsed.verdict, 'DOMAIN_BROKEN');
  assert.match(parsed.advice, /No credential change can fix/,
    'must say plainly that re-entering the password will not help');
  assert.notEqual(r.code, 0);
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
  run(['--user', 'someone@invalid.invalid', '--write-health'], tmp);
  const p = path.join(tmp, 'coordination', 'sender-health.json');
  assert.ok(fs.existsSync(p), 'must write coordination/sender-health.json');
  const health = JSON.parse(fs.readFileSync(p, 'utf8'));
  const entry = health.senders['someone@invalid.invalid'];
  assert.equal(entry.status, 'blocked', 'a sender proven not to deliver must be blocked');
  assert.equal(entry.verdict, 'DOMAIN_BROKEN');
  assert.ok(entry.checkedAt, 'must record when, so a stale verdict is visible');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('the secret never appears in output', () => {
  // The tool reads from Keychain; nothing it prints may contain the value.
  const r = run(['--user', 'someone@invalid.invalid', '--json']);
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

test('secret-put never puts the value in argv', () => {
  // `security add-generic-password -w "$VALUE"` places the secret in the process
  // argument list, readable by any user via `ps` — and security(1)'s own help says
  // "Use of the -p or -w options is insecure. Specify -w as the last option to be
  // prompted." The first version of this script did exactly the insecure thing, which
  // defeated its entire purpose.
  const src = fs.readFileSync(path.join(ROOT, 'tools', 'secret-put.sh'), 'utf8');
  assert.ok(!/add-generic-password[^\n]*-w\s+["\$]/.test(src),
    'the secret must never be passed as a -w argument');
  assert.match(src, /security add-generic-password[^\n]*-w\s*$/m,
    '-w must be the last option so security(1) prompts for the value itself');
  assert.ok(!/read\s+-rs\s+VALUE/.test(src),
    'the script must not hold the secret in a shell variable either');
});
