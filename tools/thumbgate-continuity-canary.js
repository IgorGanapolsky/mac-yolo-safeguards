#!/usr/bin/env node
/**
 * Live Continuity canary (ops):
 * 1) Ensure pro workspace has an auto + stale device path (or use dedicated canary device)
 * 2) Insert local_pending task for offline auto device
 * 3) Wait for Fly runner to complete
 * 4) Print JSON proof (status, result, runner lastTaskAt)
 *
 * Requires: wrangler auth + remote D1 hermes-control-plane access.
 * Usage:
 *   node tools/thumbgate-continuity-canary.js
 *   node tools/thumbgate-continuity-canary.js --timeout-ms 120000
 */
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CP = path.join(ROOT, 'apps/hermes-control-plane');
const RUNNER_HEALTH = process.env.HERMES_CLOUD_RUNNER_HEALTH_URL
  || 'https://igor-hermes-cloud-runner.fly.dev/health';
const ORG = process.env.THUMBGATE_CANARY_ORG_ID || '2d0d4eb8-9575-4e2b-b08d-51b10340e2f4';
const USER = process.env.THUMBGATE_CANARY_USER_ID || '54c5edf2-b2ec-45e3-b351-9a5481616e4d';
const DEVICE = process.env.THUMBGATE_CANARY_DEVICE_ID || '79721f34-4fdd-4cb7-bbdd-0dc0b5c730c9';
const THREAD = process.env.THUMBGATE_CANARY_THREAD_ID || 'canary_thread_live_20260723';

function parseArgs(argv) {
  let timeoutMs = 120_000;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--timeout-ms' && argv[i + 1]) timeoutMs = Number(argv[++i]);
  }
  return { timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 120_000 };
}

function d1(sql) {
  const result = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'hermes-control-plane', '--remote', '--json', '--command', sql],
    { cwd: CP, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `d1 exit ${result.status}`);
  }
  const payload = JSON.parse(result.stdout);
  return payload;
}

function d1Results(payload) {
  if (!Array.isArray(payload)) return [];
  // wrangler --json returns array of statement results
  return payload.flatMap((entry) => entry.results || []);
}

async function runnerHealth() {
  const response = await fetch(RUNNER_HEALTH, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`runner health HTTP ${response.status}`);
  return response.json();
}

async function main() {
  const { timeoutMs } = parseArgs(process.argv.slice(2));
  const now = Date.now();
  const stale = now - 120_000;
  const taskId = `canary_local_stale_${new Date(now).toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;
  const token = `CONTINUITY-STALE-AUTO-OK-${taskId.slice(-8)}`;

  const before = await runnerHealth();

  d1(`
UPDATE devices SET last_seen_at = ${stale}, failover_mode = 'auto', updated_at = ${now}
 WHERE id = '${DEVICE}' AND organization_id = '${ORG}';
INSERT OR IGNORE INTO threads (id, organization_id, title, created_by_user_id, created_at, updated_at, source, message_count)
VALUES ('${THREAD}', '${ORG}', 'Live Continuity Canary', '${USER}', ${now}, ${now}, 'thumbgate-web', 0);
INSERT INTO tasks (
  id, organization_id, thread_id, device_id, prompt, status, route, idempotency_key,
  lease_generation, created_by_user_id, created_at, updated_at
) VALUES (
  '${taskId}', '${ORG}', '${THREAD}', '${DEVICE}',
  'Product-path Continuity canary: reply with exactly ${token}.',
  'local_pending', 'local', 'idem_${taskId}', 0, '${USER}', ${now}, ${now}
);
`);

  const deadline = Date.now() + timeoutMs;
  let row = null;
  let after = before;
  while (Date.now() < deadline) {
    after = await runnerHealth();
    const rows = d1Results(d1(`SELECT id, status, route, result, error, completed_at AS completedAt FROM tasks WHERE id = '${taskId}';`));
    row = rows[0] || null;
    if (row && (row.status === 'completed' || row.status === 'failed')) break;
    await new Promise((r) => setTimeout(r, 8_000));
  }

  const ok = Boolean(
    row
    && row.status === 'completed'
    && row.route === 'cloud'
    && typeof row.result === 'string'
    && row.result.includes(token),
  );

  const proof = {
    ok,
    taskId,
    token,
    before: { lastTaskAt: before.lastTaskAt ?? 0, lastPollAt: before.lastPollAt ?? null },
    after: { lastTaskAt: after.lastTaskAt ?? 0, lastPollAt: after.lastPollAt ?? null, degraded: after.degraded ?? null },
    task: row,
    checkedAt: Date.now(),
  };

  console.log(JSON.stringify(proof, null, 2));
  process.exitCode = ok ? 0 : 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = 1;
});
