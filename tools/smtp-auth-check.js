#!/usr/bin/env node
'use strict';

/**
 * smtp-auth-check — prove whether a sender can actually authenticate to its relay.
 *
 * On 2026-07-31 seven consecutive sends from igor@igorganapolsky.com bounced with
 * `535 5.7.8 authentication failed` against mail.privateemail.com, and the failure was
 * discovered by hand after prospects had already been consumed. The relay itself was
 * fine — reachable on 587, advertising AUTH PLAIN LOGIN. What had actually broken was
 * upstream: igorganapolsky.com's zone had been deleted from the Cloudflare account it
 * is delegated to, so the domain SERVFAILed and the mailbox went with it.
 *
 * So this tool reports the two failures separately, because they have different fixes:
 *   AUTH   — the relay rejected the credential
 *   DOMAIN — the sender's domain does not resolve, which no password can fix
 *
 * The secret is read from the Keychain and never printed, logged, or returned. Only
 * the server's response code and a redacted summary leave this process.
 *
 *   node tools/smtp-auth-check.js --user igor@igorganapolsky.com \
 *        --host mail.privateemail.com --secret PRIVATEEMAIL_SMTP_PASSWORD
 *   node tools/smtp-auth-check.js ... --json
 */

const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const tls = require('node:tls');
const dns = require('node:dns').promises;
const { execFileSync } = require('node:child_process');

function readSecret(name, account = 'hermes-fleet') {
  try {
    return execFileSync('security', ['find-generic-password', '-a', account, '-s', name, '-w'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).replace(/\n$/, '');
  } catch {
    return null;
  }
}

/**
 * Domain existence and MX presence are SEPARATE facts.
 *
 * resolveMx() rejects with ENODATA for a domain that exists but publishes no MX — which
 * is normal for an outbound-only sender. Treating that as "does not resolve" produced
 * DOMAIN_BROKEN and skipped a relay authentication that would have succeeded. Only
 * NXDOMAIN (never registered) and SERVFAIL/REFUSED (delegated but unserved) mean the
 * domain itself is broken.
 *
 * `resolver` is injectable so the SERVFAIL/NXDOMAIN/ENODATA cases can be tested
 * deterministically instead of depending on the state of a live domain.
 */
const DOMAIN_DEAD_CODES = new Set(['ENOTFOUND', 'NXDOMAIN', 'ESERVFAIL', 'SERVFAIL', 'EREFUSED', 'REFUSED']);

async function checkDomain(domain, resolver = require('node:dns').promises) {
  const out = {
    domain, exists: false, mx: [], hasMx: false, spf: null, dmarc: null, error: null,
  };

  // Existence first, via NS — independent of whether the zone publishes mail records.
  try {
    await resolver.resolveNs(domain);
    out.exists = true;
  } catch (err) {
    const code = err.code || String(err.message || err);
    if (DOMAIN_DEAD_CODES.has(code)) { out.error = code; return out; }
    // ENODATA on NS is odd but not proof of absence; fall through and let MX decide.
    out.exists = true;
    out.error = code;
  }

  try {
    out.mx = (await resolver.resolveMx(domain)).map((m) => m.exchange);
    out.hasMx = out.mx.length > 0;
  } catch (err) {
    const code = err.code || String(err.message || err);
    if (DOMAIN_DEAD_CODES.has(code)) { out.exists = false; out.error = code; return out; }
    // ENODATA here means: domain exists, publishes no MX. Outbound-only senders do this.
    out.hasMx = false;
  }

  try {
    const txt = await resolver.resolveTxt(domain);
    out.spf = txt.flat().find((r) => r.startsWith('v=spf1')) || null;
  } catch { /* absent SPF is null, not an error */ }
  try {
    const txt = await resolver.resolveTxt(`_dmarc.${domain}`);
    out.dmarc = txt.flat().find((r) => r.startsWith('v=DMARC1')) || null;
  } catch { /* absent DMARC is null */ }
  return out;
}

/**
 * Only a genuine credential rejection is AUTH_FAILED.
 *
 * 535/534/530 are "your credential is wrong". A relay that rejects EHLO or STARTTLS, or
 * answers 454/504 (transient, or mechanism unsupported), never evaluated the credential
 * — labelling those AUTH_FAILED and advising a password change is exactly the misleading
 * diagnosis this tool exists to prevent.
 */
const CREDENTIAL_REJECTION_CODES = new Set([535, 534, 530]);

function classifyAuth(auth) {
  if (!auth) return 'RELAY_UNREACHABLE';
  if (auth.ok) return 'OK';
  if (auth.stage !== 'auth') return 'RELAY_PROTOCOL_ERROR';
  if (CREDENTIAL_REJECTION_CODES.has(auth.code)) return 'AUTH_FAILED';
  if (auth.code >= 400 && auth.code < 500) return 'AUTH_TRANSIENT';
  return 'RELAY_PROTOCOL_ERROR';
}

function smtpConverse(socket, script, timeoutMs) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const transcript = [];
    let step = 0;
    const timer = setTimeout(() => { socket.destroy(); reject(new Error('smtp_timeout')); }, timeoutMs);
    const finish = (result) => { clearTimeout(timer); socket.removeAllListeners('data'); resolve(result); };

    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      if (!/\r\n$/.test(buf)) return;
      // Multi-line replies use "250-"; the final line uses "250 ".
      const lines = buf.trim().split('\r\n');
      const last = lines[lines.length - 1];
      if (/^\d{3}-/.test(last)) return;
      const code = parseInt(last.slice(0, 3), 10);
      transcript.push({ step: script[step] ? script[step].label : 'greeting', code, text: last.slice(4, 120) });
      buf = '';
      const next = script[step++];
      if (!next) return finish({ transcript });
      if (next.expect && code !== next.expect) return finish({ transcript, failedAt: next.label, code, text: last });
      socket.write(next.send);
    });
    socket.on('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

async function checkAuth({ host, port, user, secret, timeoutMs = 15000 }) {
  const authPlain = Buffer.from(`\0${user}\0${secret}`).toString('base64');
  const socket = port === 465
    ? tls.connect({ host, port, servername: host })
    : net.connect({ host, port });

  const script = [
    { label: 'EHLO', send: `EHLO smtp-auth-check.local\r\n`, expect: 220 },
    { label: 'STARTTLS', send: `STARTTLS\r\n`, expect: 250 },
  ];
  // For 587 the sequence is greeting -> EHLO -> STARTTLS -> upgrade -> EHLO -> AUTH.
  // Implemented explicitly rather than via a generic driver so each failure is named.
  return new Promise((resolve, reject) => {
    let stage = 'greeting';
    let buf = '';
    const timer = setTimeout(() => { socket.destroy(); reject(new Error('smtp_timeout')); }, timeoutMs);
    const done = (r) => { clearTimeout(timer); try { socket.end(); } catch {} resolve(r); };

    const onLine = (sock, line) => {
      const code = parseInt(line.slice(0, 3), 10);
      if (stage === 'greeting') {
        if (code !== 220) return done({ ok: false, stage, code, message: line.slice(0, 120) });
        stage = 'ehlo'; sock.write('EHLO smtp-auth-check.local\r\n'); return;
      }
      if (stage === 'ehlo') {
        if (code !== 250) return done({ ok: false, stage, code, message: line.slice(0, 120) });
        if (port === 465) { stage = 'auth'; sock.write(`AUTH PLAIN ${authPlain}\r\n`); return; }
        stage = 'starttls'; sock.write('STARTTLS\r\n'); return;
      }
      if (stage === 'starttls') {
        if (code !== 220) return done({ ok: false, stage, code, message: line.slice(0, 120) });
        const secure = tls.connect({ socket: sock, servername: host }, () => {
          stage = 'ehlo2'; secure.write('EHLO smtp-auth-check.local\r\n');
        });
        attach(secure);
        return;
      }
      if (stage === 'ehlo2') {
        if (code !== 250) return done({ ok: false, stage, code, message: line.slice(0, 120) });
        stage = 'auth'; sock.write(`AUTH PLAIN ${authPlain}\r\n`); return;
      }
      if (stage === 'auth') {
        // 235 = accepted. 535 = rejected credential. Anything else is reported verbatim.
        return done({ ok: code === 235, stage, code, message: line.slice(0, 120) });
      }
    };

    const attach = (sock) => {
      let b = '';
      sock.on('data', (chunk) => {
        b += chunk.toString('utf8');
        if (!/\r\n$/.test(b)) return;
        const lines = b.trim().split('\r\n');
        const last = lines[lines.length - 1];
        if (/^\d{3}-/.test(last)) return;
        b = '';
        onLine(sock, last);
      });
      sock.on('error', (err) => { clearTimeout(timer); reject(err); });
    };
    attach(socket);
  });
}

async function main(argv) {
  const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
  const json = argv.includes('--json');
  const user = arg('user');
  const host = arg('host', 'mail.privateemail.com');
  const port = Number(arg('port', '587'));
  const secretName = arg('secret', 'PRIVATEEMAIL_SMTP_PASSWORD');

  if (!user) {
    process.stderr.write('usage: node tools/smtp-auth-check.js --user <address> [--host H] [--port 587|465] [--secret NAME]\n');
    return 2;
  }

  const domain = user.split('@')[1] || '';
  const domainResult = await checkDomain(domain);

  const result = {
    user, host, port, secretName,
    domain: domainResult,
    auth: null,
    verdict: null,
  };

  // Domain first: a sender whose domain does not resolve cannot deliver regardless of
  // whether the relay accepts the password, so reporting only AUTH would mislead.
  if (!domainResult.exists) {
    result.verdict = 'DOMAIN_BROKEN';
    result.advice = `${domain} does not resolve (${domainResult.error}). `
      + 'If the nameservers are delegated but answer REFUSED, the zone was deleted at the DNS '
      + 'provider. No credential change can fix delivery until the zone is restored.';
  } else {
    const secret = readSecret(secretName);
    if (!secret) {
      result.verdict = 'NO_SECRET';
      result.advice = `No Keychain entry for service '${secretName}' (account hermes-fleet). `
        + `Store it with: tools/secret-put.sh ${secretName}`;
    } else {
      try {
        result.auth = await checkAuth({ host, port, user, secret });
        result.verdict = classifyAuth(result.auth);
        if (result.verdict === 'AUTH_FAILED') {
          result.advice = `The relay evaluated the credential and rejected it (${result.auth.code}). `
            + 'Check the password and the username form — most relays want the full address.';
        } else if (result.verdict === 'AUTH_TRANSIENT') {
          result.advice = `The relay answered ${result.auth.code} at AUTH — a transient or `
            + 'unsupported-mechanism response, NOT a statement that the credential is wrong. '
            + 'Retry before changing anything.';
        } else if (result.verdict === 'RELAY_PROTOCOL_ERROR') {
          result.advice = `The relay failed at stage '${result.auth.stage}' with ${result.auth.code} `
            + 'before the credential was ever evaluated. This is a relay/protocol problem, not a '
            + 'password problem.';
        }
      } catch (err) {
        result.verdict = 'RELAY_UNREACHABLE';
        result.advice = `Could not complete an SMTP conversation with ${host}:${port} (${err.message}).`;
      }
    }
    if (result.verdict === 'OK' && !domainResult.hasMx) {
      result.warning = 'Auth succeeded and the domain resolves, but it publishes no MX record. '
        + 'Outbound-only senders do this deliberately; if you expect replies, this is a fault.';
    }
    if (result.verdict === 'OK' && !domainResult.spf) {
      result.warning = 'Auth succeeded but the domain publishes no SPF record; recipients will '
        + 'treat mail from it as unauthenticated.';
    }
  }

  // Emit the gate artifact the outreach preflight consults, so a sender proven not to
  // deliver blocks drafting instead of being rediscovered by hand after prospects are
  // consumed. NOTE: a parallel branch also writes coordination/sender-health.json —
  // if both land, one writer must win; this one is keyed by sender address.
  if (argv.includes('--write-health')) {
    const healthPath = path.join(process.cwd(), 'coordination', 'sender-health.json');
    let existing = {};
    try { existing = JSON.parse(fs.readFileSync(healthPath, 'utf8')); } catch { /* first write */ }
    existing.senders = existing.senders || {};
    existing.senders[user] = {
      status: result.verdict === 'OK' ? 'ok' : 'blocked',
      verdict: result.verdict,
      checkedAt: new Date().toISOString(),
      detail: result.advice || result.warning || null,
    };
    fs.mkdirSync(path.dirname(healthPath), { recursive: true });
    fs.writeFileSync(healthPath, `${JSON.stringify(existing, null, 2)}\n`);
    if (!json) process.stdout.write(`  wrote ${path.relative(process.cwd(), healthPath)}\n`);
  }

  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`\nsender: ${user}  relay: ${host}:${port}\n`);
    process.stdout.write(`  domain exists   : ${domainResult.exists ? 'yes' : `NO (${domainResult.error})`}\n`);
    process.stdout.write(`  MX              : ${domainResult.mx.join(', ') || '<none> (outbound-only is legitimate)'}\n`);
    process.stdout.write(`  SPF             : ${domainResult.spf ? 'present' : '<none>'}\n`);
    process.stdout.write(`  DMARC           : ${domainResult.dmarc ? 'present' : '<none>'}\n`);
    if (result.auth) process.stdout.write(`  SMTP AUTH       : ${result.auth.code} ${result.auth.ok ? 'accepted' : 'REJECTED'}\n`);
    process.stdout.write(`\n  VERDICT: ${result.verdict}\n`);
    if (result.advice) process.stdout.write(`  ${result.advice}\n`);
    if (result.warning) process.stdout.write(`  WARNING: ${result.warning}\n`);
    process.stdout.write('\n');
  }
  return result.verdict === 'OK' ? 0 : 1;
}

module.exports = { checkDomain, readSecret, classifyAuth, CREDENTIAL_REJECTION_CODES };

if (require.main === module) {
  main(process.argv.slice(2)).then((c) => process.exit(c)).catch((err) => {
    process.stderr.write(`smtp-auth-check: ${err.message}\n`);
    process.exit(2);
  });
}
