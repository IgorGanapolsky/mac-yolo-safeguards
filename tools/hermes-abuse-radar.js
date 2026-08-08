#!/usr/bin/env node
'use strict';

/**
 * hermes-abuse-radar.js — WorkOS Radar pattern for pair / auth surfaces
 *
 * Newsletter (2026-08-04): "Radar … pass the signals Radar needs to detect and
 * block malicious or abusive traffic" on User Management APIs.
 *
 * Free steal for Hermes Mobile pair + ThumbGate login-adjacent endpoints:
 *   score pair/auth attempts from cheap signals (rate, invalid codes, fan-out)
 *   and recommend allow | challenge | block — no paid WorkOS Radar.
 *
 * Usage:
 *   node tools/hermes-abuse-radar.js --score --json <<EOF
 *   {"events":[{"kind":"pair_redeem","ok":false,"error":"invalid_grant"}, ...]}
 *   EOF
 */

const DEFAULT_WEIGHTS = Object.freeze({
  invalid_code: 15,
  expired_code: 8,
  rate_limited: 25,
  code_consumed: 10,
  burst_window: 20,
  many_devices: 18,
  many_ips: 22,
  success: -5,
});

const THRESHOLDS = Object.freeze({
  allow: 30,
  challenge: 60,
  // >= challenge → block
});

/**
 * Score a batch of recent events.
 * @param {Array<object>} events
 * @param {object} [options]
 */
function scoreEvents(events, options = {}) {
  const weights = { ...DEFAULT_WEIGHTS, ...(options.weights || {}) };
  const windowMs = options.windowMs || 5 * 60 * 1000;
  const now = options.now || Date.now();
  const list = Array.isArray(events) ? events : [];

  const recent = list.filter((e) => {
    const t = e.at != null ? Number(e.at) : now;
    return now - t <= windowMs;
  });

  let score = 0;
  const reasons = [];
  const devices = new Set();
  const ips = new Set();
  let failures = 0;
  let successes = 0;

  for (const e of recent) {
    if (e.deviceId) devices.add(String(e.deviceId));
    if (e.ip) ips.add(String(e.ip));

    if (e.ok === true) {
      successes += 1;
      score += weights.success;
      continue;
    }

    failures += 1;
    const err = String(e.error || e.kind || '');
    if (err === 'invalid_grant' || err === 'invalid_code') {
      score += weights.invalid_code;
      reasons.push('invalid_code');
    } else if (err === 'code_expired' || err === 'expired_code') {
      score += weights.expired_code;
      reasons.push('expired_code');
    } else if (err === 'rate_limited' || e.httpStatus === 429) {
      score += weights.rate_limited;
      reasons.push('rate_limited');
    } else if (err === 'code_consumed') {
      score += weights.code_consumed;
      reasons.push('code_consumed');
    } else if (e.ok === false) {
      score += 5;
      reasons.push('generic_failure');
    }
  }

  if (recent.length >= 8) {
    score += weights.burst_window;
    reasons.push('burst');
  }
  if (devices.size >= 4) {
    score += weights.many_devices;
    reasons.push('many_devices');
  }
  if (ips.size >= 3) {
    score += weights.many_ips;
    reasons.push('many_ips');
  }

  score = Math.max(0, Math.round(score));
  let action = 'allow';
  if (score >= THRESHOLDS.challenge) action = 'block';
  else if (score >= THRESHOLDS.allow) action = 'challenge';

  return {
    ok: true,
    score,
    action,
    thresholds: THRESHOLDS,
    stats: {
      events: recent.length,
      failures,
      successes,
      devices: devices.size,
      ips: ips.size,
    },
    reasons: [...new Set(reasons)],
  };
}

/**
 * Convenience: feed known-state emulate attempt outcomes into radar.
 */
function scoreFromRedeemResults(results, options = {}) {
  const events = (results || []).map((r, i) => ({
    at: options.now ? options.now - i * 1000 : Date.now() - i * 1000,
    kind: 'pair_redeem',
    ok: r.ok === true,
    error: r.error,
    httpStatus: r.httpStatus,
    deviceId: r.deviceId || r.session?.deviceId,
    ip: r.ip,
  }));
  return scoreEvents(events, options);
}

function parseArgs(argv) {
  const args = { json: false, score: false, demo: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--score') args.score = true;
    else if (a === '--demo') args.demo = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function readStdinSync() {
  try {
    return require('fs').readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(`Usage:
  node tools/hermes-abuse-radar.js --demo [--json]
  node tools/hermes-abuse-radar.js --score [--json] < events.json`);
    process.exit(0);
  }

  let out;
  if (args.demo) {
    const benign = scoreEvents([
      { ok: true, deviceId: 'phone1' },
      { ok: true, deviceId: 'phone1' },
    ]);
    const abuse = scoreEvents(
      Array.from({ length: 12 }, (_, i) => ({
        ok: false,
        error: 'invalid_grant',
        deviceId: `d${i % 5}`,
        ip: `1.2.3.${i % 4}`,
        at: Date.now() - i * 500,
      })),
    );
    out = { ok: true, benign, abuse };
  } else if (args.score) {
    const raw = readStdinSync();
    let payload = { events: [] };
    try {
      payload = raw.trim() ? JSON.parse(raw) : { events: [] };
    } catch (err) {
      out = { ok: false, error: 'invalid_json', message: err.message };
      console.log(JSON.stringify(out, null, 2));
      process.exit(1);
    }
    out = scoreEvents(payload.events || payload);
  } else {
    out = scoreEvents([]);
  }

  console.log(JSON.stringify(out, null, 2));
  process.exit(out && out.ok === false ? 1 : 0);
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_WEIGHTS,
  THRESHOLDS,
  scoreEvents,
  scoreFromRedeemResults,
};
