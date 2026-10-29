#!/usr/bin/env node
'use strict';

/**
 * Gates from the Tailscale newsletter dated 2026-10-29.
 *
 * A missing Tailscale version is below the 1.104.4 Tailworm floor.
 * An on-call write needs lease.expiresAt in the future.
 * A write keyword that exists only inside a SQL comment is denied.
 * An empty attention list stays empty.
 *
 *   node tools/tailscale-newsletter-gate.js --json
 */

const crypto = require('crypto');

const MIN_SAFE_VERSION = '1.104.4';
const MIN_PARTS = [1, 104, 4];
const ATTENTION_WEIGHT = {
  waiting_approval: 100,
  ci_failed: 85,
  merge_ready: 60,
};

function parseVersion(value) {
  const match = String(value || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function versionAtLeast(value) {
  const parts = parseVersion(value);
  if (!parts) return false;
  for (let index = 0; index < 3; index += 1) {
    if (parts[index] !== MIN_PARTS[index]) return parts[index] > MIN_PARTS[index];
  }
  return true;
}

function evaluateTailworm(input = {}) {
  const version = String(input.tailscaleVersion || '').trim();
  const versionSafe = versionAtLeast(version);
  const hopCount = Number(input.sshHopCount ?? 0);
  const hasReferee = Boolean(input.refereeToken);
  const issues = [];
  if (!versionSafe) {
    issues.push(version
      ? `Tailscale ${version} is below the ${MIN_SAFE_VERSION} Tailworm floor`
      : 'Tailscale version was not supplied');
  }
  if (hopCount > 1 && !hasReferee) issues.push('Multi-hop SSH needs a referee token');
  if (input.openWebFacing) issues.push('Open-web exposure is denied');
  return {
    ok: issues.length === 0,
    versionSafe,
    minSafeVersion: MIN_SAFE_VERSION,
    issues,
  };
}

function leaseActive(lease, nowMs) {
  if (!lease || typeof lease.expiresAt !== 'string') return false;
  const expires = Date.parse(lease.expiresAt);
  return Number.isFinite(expires) && expires > nowMs;
}

const WRITE_KEYWORD = /\b(insert|update|delete|drop|alter|truncate|grant|create|replace|into)\b/i;

function stripSqlComments(sql) {
  return String(sql || '').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

function isReadOnlySql(sql) {
  const raw = String(sql || '');
  if (WRITE_KEYWORD.test(raw)) return false;
  const text = stripSqlComments(raw).trim();
  if (!text || text.includes(';')) return false;
  return /^(select|explain\s+select|show|pragma)\b/i.test(text);
}

function evaluateDbAccess(request = {}, nowMs = Date.now()) {
  const role = String(request.identityRole || 'support').toLowerCase();
  if (request.staticPasswordOnLaptop) {
    return { allowed: false, role, reason: 'static_password_on_laptop' };
  }
  const raw = String(request.sql || '');
  if (WRITE_KEYWORD.test(raw) && !WRITE_KEYWORD.test(stripSqlComments(raw))) {
    return { allowed: false, role, reason: 'comment_hidden_write' };
  }
  if (isReadOnlySql(request.sql)) {
    return { allowed: true, role, reason: 'read_only' };
  }
  if (role === 'on_call' && leaseActive(request.lease, nowMs)) {
    return { allowed: true, role, reason: 'on_call_lease' };
  }
  return {
    allowed: false,
    role,
    reason: role === 'on_call' ? 'lease_expired_or_missing' : 'support_is_read_only',
  };
}

function rankAttention(panes = []) {
  const ranked = panes
    .map((pane) => {
      const weight = ATTENTION_WEIGHT[pane.status] || 20;
      return {
        ...pane,
        priorityScore: weight + Number(pane.unreadMessages || 0) * 10,
        needsAttention: weight >= 80,
      };
    })
    .sort((left, right) => right.priorityScore - left.priorityScore
      || String(left.id).localeCompare(String(right.id)));
  const hot = ranked.filter((pane) => pane.needsAttention);
  return {
    ok: true,
    totalPanes: ranked.length,
    attentionCount: hot.length,
    top: ranked[0] || null,
    voiceSummary: hot
      .map((pane) => `${pane.agent} on ${pane.branch}: ${String(pane.status).replace(/_/g, ' ')}`)
      .join('; '),
    panes: ranked,
  };
}

function blockMarkers(name) {
  return {
    begin: `// BEGIN SCURGERY:${name}`,
    end: `// END SCURGERY:${name}`,
  };
}

function applyBlock(original, name, lines) {
  if (!/^[A-Za-z0-9_.-]+$/.test(String(name || ''))) throw new Error('invalid block name');
  const src = String(original ?? '');
  const { begin, end } = blockMarkers(name);
  if (src.includes(begin) || src.includes(end)) throw new Error('block already present');
  const body = Array.isArray(lines) ? lines.join('\n') : String(lines || '');
  if (/\/\/ (?:BEGIN|END) SCURGERY:/.test(body)) throw new Error('block body contains a marker');
  return `${src}${begin}\n${body}\n${end}\n`;
}

function removeBlock(modified, name) {
  if (!/^[A-Za-z0-9_.-]+$/.test(String(name || ''))) throw new Error('invalid block name');
  const src = String(modified ?? '');
  const { begin, end } = blockMarkers(name);
  const start = src.indexOf(begin);
  if (start === -1) return src;
  const close = `${end}\n`;
  const stop = src.indexOf(close, start + begin.length);
  if (stop === -1) throw new Error('unclosed block');
  return src.slice(0, start) + src.slice(stop + close.length);
}

function verifyBlock(original, name, lines) {
  const before = crypto.createHash('sha256').update(String(original)).digest('hex');
  const restored = removeBlock(applyBlock(original, name, lines), name);
  const after = crypto.createHash('sha256').update(restored).digest('hex');
  const byteIdentical = restored === String(original) && before === after;
  return { ok: byteIdentical, byteIdentical, beforeSha256: before, afterSha256: after };
}

function selectConnector(connectors = [], options = {}) {
  const stickinessBonus = Number(options.stickinessBonus ?? 12);
  const switchMargin = Number(options.switchMargin ?? 8);
  const current = options.currentConnectorId || '';
  const scored = connectors
    .filter((row) => row && row.healthy !== false)
    .map((row) => {
      const locality = row.locality === 'local_loopback' ? 40
        : row.locality === 'same_tailnet_lan' ? 32
          : row.locality === 'same_region_vpc' ? 24
            : 12;
      const score = locality
        - Math.min(35, Number(row.latencyMs ?? 50) * 0.25)
        - Math.min(40, Number(row.errorRate ?? 0) * 100)
        + Math.min(15, Number(row.successStreak ?? 0) * 1.5)
        + (row.id === current ? stickinessBonus : 0);
      return { id: row.id, score: Number(score.toFixed(3)) };
    })
    .sort((left, right) => right.score - left.score || String(left.id).localeCompare(String(right.id)));
  if (!scored.length) return { ok: false, selected: null, keptSticky: false, reason: 'no_healthy_connectors' };
  const best = scored[0];
  const sticky = scored.find((row) => row.id === current);
  if (sticky && sticky.id !== best.id && best.score - sticky.score < switchMargin) {
    return { ok: true, selected: sticky.id, keptSticky: true, reason: 'within_margin' };
  }
  return {
    ok: true,
    selected: best.id,
    keptSticky: Boolean(sticky && sticky.id === best.id),
    reason: 'best_signal',
  };
}

function refereeSession(session = {}) {
  const command = String(session.command || '');
  if (session.openWebFacing) return { verdict: 'DENY', reason: 'open_web' };
  if (/\brm\s+-rf\s+\/|\bmkfs\b|\bshutdown\b|\breboot\b/.test(command)) {
    return { verdict: 'DENY', reason: 'destructive' };
  }
  const worm = evaluateTailworm(session);
  if (!worm.ok) return { verdict: 'DENY', reason: worm.issues[0] };
  return { verdict: 'ALLOW', reason: 'scoped' };
}

function fixtureReport(nowMs = Date.parse('2026-10-29T16:00:00Z')) {
  const surgery = verifyBlock('{"acls":[]}\n', 'temp-oncall', ['// grant']);
  const route = selectConnector([
    { id: 'loop', locality: 'local_loopback', latencyMs: 2, errorRate: 0, successStreak: 4, healthy: true },
    { id: 'lan', locality: 'same_tailnet_lan', latencyMs: 30, errorRate: 0, successStreak: 4, healthy: true },
  ], { currentConnectorId: 'lan' });
  const worm = evaluateTailworm({ tailscaleVersion: '1.104.3', sshHopCount: 2 });
  const db = evaluateDbAccess({
    identityRole: 'on_call',
    sql: 'DELETE FROM tasks',
    lease: { expiresAt: '2026-10-29T15:00:00Z' },
  }, nowMs);
  const attention = rankAttention([]);
  return {
    ok: surgery.ok
      && route.selected === 'lan'
      && worm.ok === false
      && db.allowed === false
      && attention.totalPanes === 0,
    fixtures: true,
    surgery,
    route,
    worm,
    db,
    attention,
  };
}

function main(argv) {
  if (argv[0] !== '--json') {
    process.stdout.write(`${JSON.stringify({ ok: false, error: 'usage: --json' })}\n`);
    process.exitCode = 2;
    return;
  }
  const report = fixtureReport();
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exitCode = report.ok ? 0 : 1;
}

module.exports = {
  MIN_SAFE_VERSION,
  evaluateTailworm,
  leaseActive,
  evaluateDbAccess,
  rankAttention,
  applyBlock,
  removeBlock,
  verifyBlock,
  selectConnector,
  refereeSession,
  fixtureReport,
};

if (require.main === module) main(process.argv.slice(2));
