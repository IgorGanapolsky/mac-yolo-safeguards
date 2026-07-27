#!/usr/bin/env node
/**
 * Fleet helper: register (or reuse) a ThumbGate connector device in production D1
 * from a machine's public JWK without the web approve click.
 *
 * Usage:
 *   node tools/fleet-register-connector-device.js \
 *     --organization-id <uuid> \
 *     --name Igors-Mac-mini \
 *     --public-jwk '{"kty":"EC",...}' \
 *     [--failover manual|auto|disabled]
 *
 * Requires: wrangler auth (same as control-plane deploys), network.
 * Prints JSON: { deviceId, name, fingerprint, reused }
 */
'use strict';

const crypto = require('crypto');
const { spawnSync } = require('child_process');
const path = require('path');

const DB_NAME = 'hermes-control-plane';
const CONTROL_PLANE_DIR = path.join(__dirname, '..', 'apps', 'hermes-control-plane');

function arg(name, fallback = null) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function base64Url(buf) {
  return Buffer.from(buf).toString('base64url');
}

/** Match control-plane lib/security.ts: sha256(canonicalJson(jwk)). */
function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function fingerprintFromJwk(jwk) {
  return base64Url(crypto.createHash('sha256').update(canonicalJson(jwk)).digest());
}

function d1(sql) {
  const result = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', DB_NAME, '--remote', '--json', '--command', sql],
    { cwd: CONTROL_PLANE_DIR, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `wrangler exit ${result.status}`);
  }
  const parsed = JSON.parse(result.stdout);
  // wrangler --json may wrap results
  if (Array.isArray(parsed)) {
    return parsed[0]?.results ?? parsed;
  }
  return parsed.results ?? parsed;
}

function sqlQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function main() {
  const organizationId = arg('organization-id');
  const name = arg('name');
  const publicJwkRaw = arg('public-jwk');
  const failover = arg('failover', 'manual');
  if (!organizationId || !name || !publicJwkRaw) {
    console.error('Required: --organization-id --name --public-jwk');
    process.exit(2);
  }
  if (!['manual', 'auto', 'disabled'].includes(failover)) {
    console.error('--failover must be manual|auto|disabled');
    process.exit(2);
  }
  const jwk = JSON.parse(publicJwkRaw);
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y) {
    throw new Error('public JWK must be EC P-256 with x/y');
  }
  const fingerprint = fingerprintFromJwk(jwk);
  const publicJwk = JSON.stringify(jwk);
  const now = Date.now();

  const existing = d1(
    `SELECT id, revoked_at AS revokedAt FROM devices
      WHERE organization_id = ${sqlQuote(organizationId)} AND fingerprint = ${sqlQuote(fingerprint)}
      ORDER BY CASE WHEN revoked_at IS NULL THEN 0 ELSE 1 END, last_seen_at DESC NULLS LAST, created_at DESC
      LIMIT 1;`,
  );
  const row = Array.isArray(existing) ? existing[0] : null;
  let deviceId;
  let reused = false;
  if (row?.id) {
    deviceId = row.id;
    reused = true;
    d1(
      `UPDATE devices SET name = ${sqlQuote(name)}, public_jwk = ${sqlQuote(publicJwk)},
        failover_mode = ${sqlQuote(failover)}, revoked_at = NULL, updated_at = ${now}
        WHERE id = ${sqlQuote(deviceId)};`,
    );
    d1(
      `UPDATE devices SET revoked_at = ${now}, updated_at = ${now}
        WHERE organization_id = ${sqlQuote(organizationId)} AND fingerprint = ${sqlQuote(fingerprint)}
          AND id <> ${sqlQuote(deviceId)} AND revoked_at IS NULL;`,
    );
  } else {
    deviceId = crypto.randomUUID();
    d1(
      `INSERT INTO devices (id, organization_id, name, public_jwk, fingerprint, failover_mode, created_at, updated_at)
       VALUES (${sqlQuote(deviceId)}, ${sqlQuote(organizationId)}, ${sqlQuote(name)}, ${sqlQuote(publicJwk)},
               ${sqlQuote(fingerprint)}, ${sqlQuote(failover)}, ${now}, ${now});`,
    );
  }

  const out = {
    deviceId,
    name,
    fingerprint,
    reused,
    failoverMode: failover,
    organizationId,
  };
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}

main();
