#!/usr/bin/env node
/**
 * Fail (and page) when a shipped release's crash-free rate drops below threshold.
 *
 * Why this exists: Sentry APPS-3S — a FATAL WatchdogTermination on an iPad 6th gen — sat
 * unnoticed for two days at a 50% crash-free rate on release 1.5. Sentry had the data the
 * whole time; nothing looked at it and nobody was paged. Collecting crashes is not the same
 * as noticing them.
 *
 * Usage:
 *   SENTRY_AUTH_TOKEN=... node scripts/check-release-health.js [--release 1.4] [--min 95]
 *
 * Exits 1 when a release is below --min (default 95), 0 when healthy or when there is not
 * enough session data to judge (a release nobody has run is not a failing release).
 */
const ORG = process.env.SENTRY_ORG || 'max-smith-kdp-llc';
const PROJECT = process.env.SENTRY_PROJECT || 'hermes-mobile';
const MIN_CRASH_FREE = Number(getArg('--min') ?? process.env.MIN_CRASH_FREE ?? 95);
const RELEASE = getArg('--release') || null;
const MIN_SESSIONS = Number(process.env.MIN_SESSIONS ?? 20);

function getArg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
}

/** Pure: decide pass/fail/skip for one release. Unit-tested without network. */
function evaluateRelease({ version, crashFreeRate, sessions }, opts = {}) {
  const min = opts.min ?? MIN_CRASH_FREE;
  const minSessions = opts.minSessions ?? MIN_SESSIONS;
  if (typeof sessions === 'number' && sessions < minSessions) {
    return { version, status: 'skipped', reason: `only ${sessions} sessions (<${minSessions})` };
  }
  if (crashFreeRate === null || crashFreeRate === undefined) {
    return { version, status: 'skipped', reason: 'no crash-free data' };
  }
  if (crashFreeRate < min) {
    return { version, status: 'failed', crashFreeRate, reason: `${crashFreeRate}% < ${min}%` };
  }
  return { version, status: 'passed', crashFreeRate };
}

async function main() {
  const token = process.env.SENTRY_AUTH_TOKEN;
  if (!token) {
    console.error('SENTRY_AUTH_TOKEN missing — cannot check release health.');
    process.exit(2);
  }
  const url =
    `https://sentry.io/api/0/organizations/${ORG}/sessions/` +
    `?field=crash_free_rate%28session%29&field=sum%28session%29&groupBy=release` +
    `&statsPeriod=7d&project=-1&query=${encodeURIComponent(`project:${PROJECT}`)}`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    console.error(`Sentry API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    process.exit(2);
  }
  const body = await res.json();
  // Fail LOUD on an unexpected response shape. The query/field names here were written from
  // Sentry's docs and could not be verified locally (the token is CI-only), so a silent
  // "0 releases evaluated" must never be mistaken for "everything is healthy" — that is
  // exactly how APPS-3S went unnoticed.
  if (!Array.isArray(body.groups)) {
    console.error('Unexpected Sentry response: no `groups` array. Query or API shape changed.');
    console.error(JSON.stringify(body).slice(0, 300));
    process.exit(2);
  }
  if (body.groups.length === 0) {
    console.error('Sentry returned zero release groups — the query matched nothing.');
    console.error('That is a broken check, not a healthy app. Verify org/project/query.');
    process.exit(2);
  }
  const results = (body.groups || []).map((g) =>
    evaluateRelease({
      version: g.by?.release ?? 'unknown',
      crashFreeRate:
        g.totals?.['crash_free_rate(session)'] == null
          ? null
          : Math.round(g.totals['crash_free_rate(session)'] * 1000) / 10,
      sessions: g.totals?.['sum(session)'],
    }),
  ).filter((r) => !RELEASE || r.version === RELEASE);

  for (const r of results) {
    const line = `  ${r.status.padEnd(7)} ${String(r.version).padEnd(12)} ${
      r.crashFreeRate != null ? r.crashFreeRate + '% crash-free' : r.reason
    }`;
    r.status === 'failed' ? console.error(line) : console.log(line);
  }

  const failed = results.filter((r) => r.status === 'failed');
  if (failed.length) {
    console.error(`\n::error::${failed.length} release(s) below ${MIN_CRASH_FREE}% crash-free`);
    console.error('Page: Igor Ganapolsky — iganapolsky@gmail.com, (201) 639-1534');
    process.exit(1);
  }
  console.log(`\nrelease health OK (${results.length} release(s) evaluated)`);
}

module.exports = { evaluateRelease };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(2); });
