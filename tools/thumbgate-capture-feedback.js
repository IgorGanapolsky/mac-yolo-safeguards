#!/usr/bin/env node
'use strict';

/**
 * thumbgate-capture-feedback.js — capture_feedback that works from an unattended run.
 *
 * AGENTS.md requires capture_feedback on incidents, but the lessons store was
 * ~/.thumbgate on the Mac: `thumbgate-lessons-doctor.js` reports "no lessons store
 * found" inside a scheduled cloud container, and thumbgate is not a configured MCP
 * server in .mcp.json. The net effect was that the one agent whose mistakes most need
 * recording — the unattended one, running while nobody watches — could not record any.
 *
 * This posts to POST /api/lessons/agent on the control plane, which is reachable from
 * anywhere (thumbgate.app/api/health answers from the scheduled container), using the
 * same ECDSA device-signing scheme as device/heartbeat. No browser, no Keychain.
 *
 * Credentials (set as env vars / CI secrets, never in a tracked file):
 *   HERMES_DEVICE_ID           registered device id
 *   HERMES_DEVICE_PRIVATE_KEY  PKCS#8 EC P-256 private key, base64
 *   THUMBGATE_BASE_URL         optional, defaults to https://thumbgate.app
 *
 * Usage:
 *   node tools/thumbgate-capture-feedback.js \
 *     --agent claude-content-pm --kind mistake --severity warn \
 *     --title "Repeated a stale blocker" \
 *     --body "Reported assign_reviewers 422 as live after #1598 had fixed it." \
 *     --rule "A blocker older than one tool call is a hypothesis; re-check before repeating it."
 *
 * Exit: 0 captured · 1 request failed · 2 usage/credential error
 */

const crypto = require('crypto');

const BASE = process.env.THUMBGATE_BASE_URL || 'https://thumbgate.app';
const KINDS = ['mistake', 'success', 'rule', 'feedback'];
const SEVERITIES = ['info', 'warn', 'critical'];

/**
 * Boolean flags must not swallow the next token. The naive version assigned
 * argv[++i] unconditionally, so a trailing `--dry-run` became `undefined` and the
 * dry-run guard fell through to a REAL network call — the exact opposite of what
 * the flag promises.
 */
function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      o[k.slice(2)] = true;
    } else {
      o[k.slice(2)] = next;
      i++;
    }
  }
  return o;
}

/**
 * Must match lib/device-auth.ts byte for byte:
 *   [METHOD, url.pathname, timestamp, nonce, sha256(body)].join("\n")
 * Note it signs the base64url HASH of the body, not the body, and the device id is
 * NOT part of it (it travels in the header). A mismatch here fails as "invalid device
 * signature", which reads like a bad key rather than a format bug — so it is
 * regression-tested against a real WebCrypto verify in tests/.
 */
function sha256Base64Url(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('base64url');
}

function canonicalString({ method, pathname, timestamp, nonce, body }) {
  return [method.toUpperCase(), pathname, timestamp, nonce, sha256Base64Url(body)].join('\n');
}

function sign(canonical, privateKeyB64) {
  const key = crypto.createPrivateKey({
    key: Buffer.from(privateKeyB64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  // Server uses WebCrypto ECDSA P-256/SHA-256, which expects the raw (r||s) form,
  // NOT the DER encoding Node emits by default. dsaEncoding fixes that.
  const sig = crypto.sign('sha256', Buffer.from(canonical, 'utf8'), { key, dsaEncoding: 'ieee-p1363' });
  return sig.toString('base64url');
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const deviceId = process.env.HERMES_DEVICE_ID;
  const privateKey = process.env.HERMES_DEVICE_PRIVATE_KEY;

  if (!deviceId || !privateKey) {
    console.error('HERMES_DEVICE_ID and HERMES_DEVICE_PRIVATE_KEY are required. Register a device and store the key as a CI secret — never in a tracked file.');
    process.exit(2);
  }
  if (!a.agent || !a.title || !a.body) {
    console.error('--agent, --title and --body are required. A lesson with no detail cannot be acted on later.');
    process.exit(2);
  }
  const kind = a.kind || 'feedback';
  const severity = a.severity || 'info';
  if (!KINDS.includes(kind)) { console.error(`--kind must be one of: ${KINDS.join(', ')}`); process.exit(2); }
  if (!SEVERITIES.includes(severity)) { console.error(`--severity must be one of: ${SEVERITIES.join(', ')}`); process.exit(2); }

  const body = JSON.stringify({
    agentId: a.agent, kind, severity,
    title: a.title, body: a.body,
    ...(a.rule ? { rule: a.rule } : {}),
    ...(a.session ? { sessionRef: a.session } : {}),
  });

  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const signature = sign(canonicalString({ method: 'POST', pathname: '/api/lessons/agent', timestamp, nonce, body }), privateKey);

  if (a['dry-run']) {
    console.log(JSON.stringify({ dryRun: true, url: `${BASE}/api/lessons/agent`, bodyChars: body.length, signed: true }, null, 2));
    process.exit(0);
  }

  const res = await fetch(`${BASE}/api/lessons/agent`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hermes-device': deviceId,
      'x-hermes-timestamp': timestamp,
      'x-hermes-nonce': nonce,
      'x-hermes-signature': signature,
    },
    body,
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`capture failed: HTTP ${res.status} ${text.slice(0, 300)}`);
    process.exit(1);
  }
  const out = JSON.parse(text);
  console.log(`captured ${out.id} (occurrence ${out.occurrences})`);
}

if (require.main === module) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}

module.exports = { canonicalString, sha256Base64Url, sign, parseArgs };
