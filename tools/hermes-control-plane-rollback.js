#!/usr/bin/env node
'use strict';

/**
 * One-command production recovery for hermes-control-plane Worker.
 *
 * July 2026 progressive-delivery gap fill:
 * - list / status (current traffic split + health)
 * - rollback to previous or explicit version (wrangler rollback)
 * - canary % traffic to a known version (wrangler versions deploy)
 * - promote canary to 100%
 *
 * Never claims success without a post-action health probe.
 *
 * Usage:
 *   node tools/hermes-control-plane-rollback.js status
 *   node tools/hermes-control-plane-rollback.js list
 *   node tools/hermes-control-plane-rollback.js prev              # dry plan
 *   node tools/hermes-control-plane-rollback.js prev --execute -y
 *   node tools/hermes-control-plane-rollback.js to <version-id> --execute -y
 *   node tools/hermes-control-plane-rollback.js canary <version-id> --pct 10 --execute -y
 *   node tools/hermes-control-plane-rollback.js promote <version-id> --execute -y
 */

const { spawnSync } = require('child_process');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const WORKER = process.env.HERMES_CP_WORKER_NAME || 'hermes-control-plane';
const HEALTH_URL = process.env.HERMES_CP_HEALTH_URL || 'https://thumbgate.app/api/health';
const DEFAULT_CANARY_PCT = 10;

function parseArgs(argv) {
  const args = {
    cmd: null,
    versionId: null,
    pct: DEFAULT_CANARY_PCT,
    execute: false,
    yes: false,
    message: '',
    json: false,
    help: false,
  };
  const rest = [...argv];
  while (rest.length) {
    const a = rest.shift();
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--execute') args.execute = true;
    else if (a === '-y' || a === '--yes') args.yes = true;
    else if (a === '--json') args.json = true;
    else if (a === '--pct') args.pct = Number(rest.shift());
    else if (a === '-m' || a === '--message') args.message = rest.shift() || '';
    else if (!args.cmd) args.cmd = a;
    else if (!args.versionId) args.versionId = a;
    else throw new Error(`Unexpected arg: ${a}`);
  }
  return args;
}

function usage() {
  return `Usage:
  node tools/hermes-control-plane-rollback.js status
  node tools/hermes-control-plane-rollback.js list
  node tools/hermes-control-plane-rollback.js prev [--execute -y] [-m reason]
  node tools/hermes-control-plane-rollback.js to <version-id> [--execute -y] [-m reason]
  node tools/hermes-control-plane-rollback.js canary <version-id> [--pct 10] [--execute -y]
  node tools/hermes-control-plane-rollback.js promote <version-id> [--execute -y]

Env:
  HERMES_CP_WORKER_NAME   default hermes-control-plane
  HERMES_CP_HEALTH_URL    default https://thumbgate.app/api/health
  WRANGLER_BIN            optional path to wrangler
`;
}

function wranglerBin() {
  if (process.env.WRANGLER_BIN) return process.env.WRANGLER_BIN;
  const local = path.join(REPO, 'apps/hermes-control-plane/node_modules/.bin/wrangler');
  const fs = require('fs');
  if (fs.existsSync(local)) return local;
  return 'npx';
}

function runWrangler(args, { json = false } = {}) {
  const bin = wranglerBin();
  const full =
    bin === 'npx'
      ? ['wrangler', ...args, ...(json ? ['--json'] : [])]
      : [...args, ...(json ? ['--json'] : [])];
  const cmd = bin === 'npx' ? 'npx' : bin;
  const r = spawnSync(cmd, full, {
    encoding: 'utf8',
    cwd: path.join(REPO, 'apps/hermes-control-plane'),
    env: process.env,
    timeout: 120_000,
  });
  return {
    status: r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    ok: r.status === 0,
  };
}

function parseJsonOutput(stdout) {
  const text = String(stdout || '').trim();
  // wrangler may print a banner before JSON
  const start = text.indexOf('[');
  const startObj = text.indexOf('{');
  let i = -1;
  if (start >= 0 && (startObj < 0 || start < startObj)) i = start;
  else i = startObj;
  if (i < 0) throw new Error(`No JSON in wrangler output:\n${text.slice(0, 400)}`);
  return JSON.parse(text.slice(i));
}

function listDeployments() {
  const r = runWrangler(['deployments', 'list', '--name', WORKER], { json: true });
  if (!r.ok) throw new Error(`deployments list failed:\n${r.stderr || r.stdout}`);
  const rows = parseJsonOutput(r.stdout);
  if (!Array.isArray(rows)) throw new Error('deployments list: expected array');
  // newest last in some wrangler versions — normalize newest-first
  return [...rows].sort((a, b) => String(b.created_on || '').localeCompare(String(a.created_on || '')));
}

function listVersions() {
  const r = runWrangler(['versions', 'list', '--name', WORKER], { json: true });
  if (!r.ok) throw new Error(`versions list failed:\n${r.stderr || r.stdout}`);
  const rows = parseJsonOutput(r.stdout);
  if (!Array.isArray(rows)) throw new Error('versions list: expected array');
  return rows;
}

function currentTraffic(deployments) {
  const latest = deployments[0];
  if (!latest?.versions?.length) return { deploymentId: null, versions: [] };
  return {
    deploymentId: latest.id,
    createdOn: latest.created_on,
    versions: latest.versions.map((v) => ({
      versionId: v.version_id,
      percentage: v.percentage,
    })),
  };
}

function previousVersionId(deployments) {
  const seen = [];
  for (const d of deployments) {
    for (const v of d.versions || []) {
      if (!v.version_id) continue;
      if (!seen.includes(v.version_id)) seen.push(v.version_id);
    }
  }
  if (seen.length < 2) return null;
  // seen[0] is current (from newest deployment first), seen[1] previous primary
  return seen[1];
}

async function probeHealth() {
  const started = Date.now();
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(12_000) });
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 200) };
    }
    return {
      ok: res.status === 200 && body && body.ok === true,
      status: res.status,
      ms: Date.now() - started,
      body: {
        ok: body?.ok,
        ready: body?.ready,
        status: body?.status,
        activeDevices: body?.telemetry?.activeDevices,
      },
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      ms: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function requireExecute(args, plan) {
  if (!args.execute) {
    return {
      dryRun: true,
      plan,
      note: 'Pass --execute -y to apply. Dry-run only.',
    };
  }
  if (!args.yes) {
    throw new Error('Refusing to mutate production without -y/--yes');
  }
  return null;
}

function rollbackTo(versionId, message) {
  const args = ['rollback', versionId, '--name', WORKER, '-y'];
  if (message) args.push('-m', message);
  return runWrangler(args, { json: false });
}

function versionsDeploy(specs, message) {
  // specs: ["id@10", "id2@90"] or single promote id@100
  const args = ['versions', 'deploy', ...specs, '--name', WORKER, '-y'];
  if (message) args.push('--message', message);
  return runWrangler(args, { json: false });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.cmd) {
    process.stdout.write(usage());
    process.exit(args.help ? 0 : 1);
  }

  const healthBefore = await probeHealth();
  let result = { worker: WORKER, healthBefore, cmd: args.cmd };

  if (args.cmd === 'status') {
    const deployments = listDeployments();
    const traffic = currentTraffic(deployments);
    result = {
      ...result,
      traffic,
      recentDeployments: deployments.slice(0, 5).map((d) => ({
        id: d.id,
        createdOn: d.created_on,
        versions: d.versions,
      })),
      previousVersionId: previousVersionId(deployments),
      healthAfter: healthBefore,
    };
  } else if (args.cmd === 'list') {
    const versions = listVersions();
    const deployments = listDeployments();
    result = {
      ...result,
      traffic: currentTraffic(deployments),
      versions: versions.slice(0, 15).map((v) => ({
        id: v.id,
        number: v.number,
        createdOn: v.metadata?.created_on,
        author: v.metadata?.author_email,
      })),
      previousVersionId: previousVersionId(deployments),
    };
  } else if (args.cmd === 'prev' || args.cmd === 'to') {
    const deployments = listDeployments();
    const traffic = currentTraffic(deployments);
    const target =
      args.cmd === 'to'
        ? args.versionId
        : previousVersionId(deployments);
    if (!target) throw new Error(args.cmd === 'to' ? 'version-id required' : 'No previous version found');
    const currentIds = (traffic.versions || []).map((v) => v.versionId);
    if (currentIds.length === 1 && currentIds[0] === target) {
      throw new Error(`Already fully on ${target}`);
    }
    const plan = {
      action: 'rollback',
      from: traffic.versions,
      to: target,
      message: args.message || `rollback via hermes-control-plane-rollback.js`,
    };
    const dry = requireExecute(args, plan);
    if (dry) {
      result = { ...result, ...dry, traffic };
    } else {
      const rb = rollbackTo(target, plan.message);
      const healthAfter = await probeHealth();
      result = {
        ...result,
        plan,
        applied: rb.ok,
        wrangler: { status: rb.status, stdout: rb.stdout.slice(-800), stderr: rb.stderr.slice(-400) },
        healthAfter,
        ok: rb.ok && healthAfter.ok,
      };
      if (!result.ok) process.exitCode = 1;
    }
  } else if (args.cmd === 'canary') {
    if (!args.versionId) throw new Error('canary requires <version-id>');
    if (!(args.pct > 0 && args.pct < 100)) throw new Error('--pct must be between 1 and 99');
    const deployments = listDeployments();
    const traffic = currentTraffic(deployments);
    const current = traffic.versions?.find((v) => v.percentage > 0)?.versionId
      || traffic.versions?.[0]?.versionId;
    if (!current) throw new Error('Cannot determine current version for canary split');
    if (current === args.versionId) throw new Error('Canary version is already current');
    const rest = 100 - args.pct;
    const plan = {
      action: 'canary',
      canary: `${args.versionId}@${args.pct}`,
      stable: `${current}@${rest}`,
    };
    const dry = requireExecute(args, plan);
    if (dry) {
      result = { ...result, ...dry, traffic };
    } else {
      const dep = versionsDeploy([plan.canary, plan.stable], args.message || 'canary split');
      const healthAfter = await probeHealth();
      result = {
        ...result,
        plan,
        applied: dep.ok,
        wrangler: { status: dep.status, stdout: dep.stdout.slice(-800), stderr: dep.stderr.slice(-400) },
        healthAfter,
        ok: dep.ok && healthAfter.ok,
      };
      if (!result.ok) process.exitCode = 1;
    }
  } else if (args.cmd === 'promote') {
    if (!args.versionId) throw new Error('promote requires <version-id>');
    const plan = { action: 'promote', to: `${args.versionId}@100` };
    const dry = requireExecute(args, plan);
    if (dry) {
      result = { ...result, ...dry };
    } else {
      const dep = versionsDeploy([plan.to], args.message || 'promote to 100%');
      const healthAfter = await probeHealth();
      result = {
        ...result,
        plan,
        applied: dep.ok,
        wrangler: { status: dep.status, stdout: dep.stdout.slice(-800), stderr: dep.stderr.slice(-400) },
        healthAfter,
        ok: dep.ok && healthAfter.ok,
      };
      if (!result.ok) process.exitCode = 1;
    }
  } else {
    throw new Error(`Unknown command: ${args.cmd}\n${usage()}`);
  }

  if (args.json || true) {
    // always machine-readable for agents; human can jq
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}

module.exports = {
  parseJsonOutput,
  currentTraffic,
  previousVersionId,
  parseArgs,
  usage,
  requireExecute,
};

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
