#!/usr/bin/env node
'use strict';

/**
 * Hosted alert correlate — Digitate/ignio process steal (TNS 2026-08-25).
 * Source: /Users/igorganapolsky/Downloads/newstack.pdf
 *
 * Steal: duplicate suppression + related-route correlation + precursor
 * vs user-facing + validated-fix only. Not ignio, not CloudWatch, not Azure Monitor.
 * Do not dual-edit tools/rule-sprawl.js (OpenSearch steal).
 */

const SOURCE =
  'The New Stack / Digitate ignio (2026-08-25): Predict Incidents Before AWS or Azure Alerts Escalate';
const SCHEMA = 'hosted-alert-correlate/v1';
const DUPLICATE_WINDOW_MS = 60_000;
const PRECURSOR_COUNT = 3;

const FAMILIES = [
  { id: 'hosted_admission', re: /^\/api\/(tasks|nostr\/events|device\/tasks)/ },
  { id: 'billing', re: /^\/api\/billing\// },
  { id: 'analytics', re: /^\/api\/analytics\// },
  { id: 'health', re: /^\/api\/health/ },
];

function honesty() {
  return {
    schema: SCHEMA,
    source: SOURCE,
    clonedIgnio: false,
    clonedCloudWatch: false,
    clonedAzureMonitor: false,
    dualEditRuleSprawl: false,
    autoApply: false,
    capturedRevenueUsd: 0,
    steal: [
      'duplicate signature suppression inside a time window',
      'correlate related hosted routes into one incident',
      'precursor before user-facing; validated fix only (tests+receipt)',
    ],
    skip: [
      'AWS CloudWatch / Azure Monitor ingest',
      'Digitate ignio / TCS AIOps SKU',
      'quoting IDC 90% as our metric',
      'editing tools/rule-sprawl.js',
    ],
  };
}

function familyForPath(path) {
  const p = String(path || '').split('?')[0];
  for (const fam of FAMILIES) {
    if (fam.re.test(p)) return fam.id;
  }
  return 'other';
}

function eventSignature(ev) {
  if (ev && ev.errorClass) return `client_error:${ev.errorClass}`;
  const method = String((ev && ev.method) || 'GET').toUpperCase();
  const path = String((ev && ev.path) || '/').split('?')[0];
  const status = Number(ev && ev.status) || 0;
  return `${method} ${path} ${status}`;
}

function shouldEmitDuplicate(opts) {
  const windowMs = Number.isFinite(opts.windowMs) ? opts.windowMs : DUPLICATE_WINDOW_MS;
  const last = opts.lastBySignature && opts.lastBySignature[opts.signature];
  if (typeof last === 'number' && opts.now - last < windowMs) {
    return { emit: false, reason: 'duplicate_suppressed' };
  }
  return { emit: true, reason: 'ok' };
}

function suggestValidatedFix(opts) {
  const testsPass = Boolean(opts && opts.testsPass);
  const receiptOk = Boolean(opts && opts.receiptOk);
  if (testsPass && receiptOk) {
    return {
      action: String((opts && opts.action) || 'retry_with_receipt'),
      autoApply: false,
      validated: true,
    };
  }
  return { action: null, autoApply: false, validated: false, reason: 'unvalidated' };
}

function correlate(events, opts = {}) {
  const windowMs = Number.isFinite(opts.windowMs) ? opts.windowMs : DUPLICATE_WINDOW_MS;
  const precursorCount = Number.isFinite(opts.precursorCount) ? opts.precursorCount : PRECURSOR_COUNT;
  const list = Array.isArray(events) ? events : [];
  const errorEvents = list.filter((ev) => {
    const status = Number(ev && ev.status) || 0;
    return status >= 500 || Boolean(ev && ev.errorClass);
  });
  const lastBySignature = Object.create(null);
  const groups = Object.create(null);
  let suppressed = 0;

  for (const ev of errorEvents) {
    const ts = Number(ev.ts) || 0;
    const sig = eventSignature(ev);
    const family = familyForPath(ev.path || '');
    const key = family === 'other' ? sig : family;
    const dup = shouldEmitDuplicate({
      signature: `${key}:${sig}`,
      now: ts,
      lastBySignature,
      windowMs,
    });
    if (!dup.emit) {
      suppressed += 1;
      if (groups[key]) groups[key].count += 1;
      continue;
    }
    lastBySignature[`${key}:${sig}`] = ts;
    if (!groups[key]) {
      groups[key] = {
        id: key,
        signature: sig,
        family,
        count: 1,
        firstTs: ts,
        lastTs: ts,
      };
    } else {
      groups[key].count += 1;
      groups[key].lastTs = ts;
    }
  }

  const incidents = Object.values(groups).map((g) => {
    const userFacing = g.count >= precursorCount;
    return {
      ...g,
      precursor: g.count > 0 && !userFacing,
      userFacing,
      suggestedFix: suggestValidatedFix({
        testsPass: Boolean(opts.testsPass),
        receiptOk: Boolean(opts.receiptOk),
        action: `inspect_${g.family}`,
      }),
    };
  });

  const rawCount = errorEvents.length;
  const incidentCount = incidents.length;
  const suppressRatio = rawCount === 0 ? 0 : Number((suppressed / rawCount).toFixed(4));
  return {
    ...honesty(),
    rawCount,
    incidentCount,
    suppressed,
    suppressRatio,
    incidents,
  };
}

function main(argv) {
  const args = argv || process.argv.slice(2);
  const json = args.includes('--json');
  const demo = correlate(
    [
      { ts: 1_000, method: 'POST', path: '/api/tasks', status: 500 },
      { ts: 1_100, method: 'POST', path: '/api/tasks', status: 500 },
      { ts: 1_200, method: 'POST', path: '/api/tasks', status: 500 },
      { ts: 1_300, method: 'POST', path: '/api/nostr/events', status: 500 },
      { ts: 1_400, method: 'POST', path: '/api/tasks', status: 500 },
      { ts: 1_500, method: 'GET', path: '/api/health', status: 200 },
    ],
    { windowMs: 60_000, precursorCount: 3, testsPass: false, receiptOk: false },
  );
  process.stdout.write(`${JSON.stringify(demo, null, json ? 2 : 0)}\n`);
  return 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  SCHEMA,
  DUPLICATE_WINDOW_MS,
  honesty,
  familyForPath,
  eventSignature,
  shouldEmitDuplicate,
  suggestValidatedFix,
  correlate,
  main,
};
