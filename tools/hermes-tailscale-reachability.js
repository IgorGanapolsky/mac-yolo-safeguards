#!/usr/bin/env node
'use strict';

/**
 * Tailscale Hermes gateway reachability keeper (crisis 2026-07-15).
 *
 * Why this exists: agents keep "fixing" phone↔Mac with one-shot re-pair, then the
 * link dies again the same day. Permanent owner:
 *   - every few minutes curl /health + authenticated /api/sessions on both Macs'
 *     Tailscale 100.x addresses
 *   - if THIS Mac's gateway is down → restart via `hermes gateway restart` (best-effort)
 *   - if phone USB present AND local sessions return 401 → auto hermes-mobile-pair.js
 *   - ntfy on sustained failure (not on every flap)
 *
 * CLI:
 *   node tools/hermes-tailscale-reachability.js [--json] [--once] [--dry-run]
 *
 * Exit 0 always (LaunchAgent must not thrash). Use --json for status.
 */

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const MBP_TS = process.env.HERMES_MBP_TAILSCALE_IP || '100.87.85.85';
const MINI_TS = process.env.HERMES_MINI_TAILSCALE_IP || '100.94.135.78';
const GATEWAY_PORT = Number(process.env.HERMES_GATEWAY_PORT || 8642);
const NTFY = process.env.HERMES_NTFY_URL || 'https://ntfy.sh/yolo-guard-fdh8ktuw1vtxb5sb';
const STATE_PATH =
  process.env.HERMES_TS_REACH_STATE ||
  path.join(os.homedir(), '.hermes', 'tailscale-reachability-state.json');
const LOG_PATH =
  process.env.HERMES_TS_REACH_LOG ||
  path.join(os.homedir(), 'Library', 'Logs', 'hermes-tailscale-reachability.log');
const NTFY_COOLDOWN_MS = Number(process.env.HERMES_TS_REACH_NTFY_COOLDOWN_MS || 30 * 60 * 1000);
const REPO_ROOT = path.resolve(__dirname, '..');

function log(line) {
  const msg = `${new Date().toISOString()} ${line}\n`;
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, msg);
  } catch {
    // best-effort
  }
}

function readLocalApiKey() {
  const envPath = path.join(os.homedir(), '.hermes', '.env');
  if (!fs.existsSync(envPath)) return '';
  const text = fs.readFileSync(envPath, 'utf8');
  const m = text.match(/^API_SERVER_KEY=(.+)$/m);
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveState(state) {
  try {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
  } catch {
    // best-effort
  }
}

function httpProbe(url, { headers = {}, timeoutMs = 5000 } = {}) {
  return new Promise((resolve) => {
    const req = http.get(url, { headers, timeout: timeoutMs }, (res) => {
      res.resume();
      resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, status: 0, error: 'timeout' });
    });
    req.on('error', (err) => resolve({ ok: false, status: 0, error: err.message }));
  });
}

async function probeHost(ip, apiKey) {
  const base = `http://${ip}:${GATEWAY_PORT}`;
  const health = await httpProbe(`${base}/health`);
  const sessions = apiKey
    ? await httpProbe(`${base}/api/sessions?limit=1`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      })
    : { ok: false, status: 0, error: 'no_api_key' };
  return {
    ip,
    healthOk: health.ok,
    healthStatus: health.status,
    sessionsOk: sessions.ok,
    sessionsStatus: sessions.status,
    reachable: health.ok && sessions.ok,
  };
}

function localTailscaleIpv4() {
  const ts = '/Applications/Tailscale.app/Contents/MacOS/Tailscale';
  try {
    const out = execFileSync(ts, ['ip', '-4'], { encoding: 'utf8', timeout: 8000 }).trim();
    return out.split(/\s+/)[0] || '';
  } catch {
    return '';
  }
}

function listPhysicalAdbSerials() {
  try {
    const out = execFileSync('adb', ['devices', '-l'], { encoding: 'utf8', timeout: 8000 });
    return out
      .split('\n')
      .slice(1)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.split(/\s+/))
      .filter((p) => p.length >= 2 && p[1] === 'device' && !p[0].startsWith('emulator-'))
      .map((p) => p[0]);
  } catch {
    return [];
  }
}

function restartLocalGateway(dryRun) {
  if (dryRun) return { attempted: true, dryRun: true, ok: true };
  // Prefer hermes CLI; fall back to launchctl kickstart if present.
  const attempts = [];
  const hermes = spawnSync('hermes', ['gateway', 'restart'], {
    encoding: 'utf8',
    timeout: 60_000,
  });
  attempts.push({ cmd: 'hermes gateway restart', status: hermes.status });
  if (hermes.status === 0) {
    return { attempted: true, ok: true, attempts };
  }
  const label = `gui/${process.getuid()}/ai.hermes.gateway`;
  const kick = spawnSync('launchctl', ['kickstart', '-k', label], {
    encoding: 'utf8',
    timeout: 15_000,
  });
  attempts.push({ cmd: `launchctl kickstart ${label}`, status: kick.status });
  return { attempted: true, ok: kick.status === 0, attempts };
}

function autoPair(dryRun) {
  if (dryRun) return { attempted: true, dryRun: true, ok: true };
  const pairJs = path.join(REPO_ROOT, 'tools', 'hermes-mobile-pair.js');
  const r = spawnSync(process.execPath, [pairJs, '--no-dev-unlock'], {
    encoding: 'utf8',
    timeout: 180_000,
    cwd: REPO_ROOT,
    env: process.env,
  });
  return {
    attempted: true,
    ok: r.status === 0,
    status: r.status,
    // Never forward stdout (may contain deep-link material).
  };
}

function notifyNtfy(title, body, state) {
  const now = Date.now();
  if (state.lastNtfyAt && now - state.lastNtfyAt < NTFY_COOLDOWN_MS) {
    return { sent: false, reason: 'cooldown' };
  }
  try {
    execFileSync(
      'curl',
      ['-sS', '-m', '8', '-H', `Title: ${title}`, '-d', body, NTFY],
      { encoding: 'utf8', timeout: 12_000 },
    );
    state.lastNtfyAt = now;
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function runOnce(options = {}) {
  const dryRun = Boolean(options.dryRun);
  const apiKey = options.apiKey ?? readLocalApiKey();
  const localIp = localTailscaleIpv4();
  const hosts = [
    { role: 'mbp', ip: MBP_TS },
    { role: 'mini', ip: MINI_TS },
  ];
  const probes = [];
  for (const h of hosts) {
    probes.push({ role: h.role, ...(await probeHost(h.ip, apiKey)) });
  }

  const localProbe = probes.find((p) => p.ip === localIp) || probes.find((p) => p.role === 'mbp');
  const actions = [];
  const state = loadState();

  if (localProbe && !localProbe.healthOk) {
    const restart = restartLocalGateway(dryRun);
    actions.push({ type: 'restart_gateway', ...restart });
    log(`restart_gateway ok=${restart.ok} local=${localIp || 'unknown'}`);
  }

  const phones = listPhysicalAdbSerials();
  const localSessions401 =
    localProbe && (localProbe.sessionsStatus === 401 || localProbe.sessionsStatus === 403);
  // Also probe loopback sessions — wrong key on USB path is the daily crisis.
  let loopbackSessions = null;
  if (phones.length > 0 && apiKey) {
    loopbackSessions = await httpProbe(`http://127.0.0.1:${GATEWAY_PORT}/api/sessions?limit=1`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    });
  }
  const needRepair =
    phones.length > 0 &&
    (localSessions401 || (loopbackSessions && !loopbackSessions.ok && loopbackSessions.status === 401));

  if (needRepair) {
    const pair = autoPair(dryRun);
    actions.push({ type: 'auto_pair', phones, ...pair });
    log(`auto_pair ok=${pair.ok} phones=${phones.join(',')}`);
  }

  const anyDown = probes.some((p) => !p.reachable);
  let ntfy = { sent: false };
  if (anyDown) {
    const detail = probes
      .map(
        (p) =>
          `${p.role}@${p.ip} health=${p.healthStatus} sessions=${p.sessionsStatus}`,
      )
      .join('; ');
    ntfy = notifyNtfy('Hermes Tailscale reachability', detail, state);
    actions.push({ type: 'ntfy', ...ntfy });
    log(`down ${detail}`);
  } else {
    state.lastAllOkAt = new Date().toISOString();
    log(`ok mbp+mini health+sessions`);
  }
  saveState(state);

  return {
    checkedAt: new Date().toISOString(),
    localTailscaleIp: localIp || null,
    probes,
    phones,
    loopbackSessionsStatus: loopbackSessions?.status ?? null,
    actions,
    allReachable: !anyDown,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const dryRun = args.includes('--dry-run');
  const summary = await runOnce({ dryRun });
  if (json) {
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  } else {
    for (const p of summary.probes) {
      console.log(
        `hermes-tailscale-reachability: ${p.role} ${p.ip} health=${p.healthStatus} sessions=${p.sessionsStatus} reachable=${p.reachable}`,
      );
    }
    if (summary.actions.length) {
      console.log(
        `hermes-tailscale-reachability: actions=${summary.actions.map((a) => a.type).join(',')}`,
      );
    }
  }
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    log(`fatal ${err instanceof Error ? err.message : String(err)}`);
    process.exit(0);
  });
}

module.exports = {
  probeHost,
  runOnce,
  readLocalApiKey,
  listPhysicalAdbSerials,
  localTailscaleIpv4,
  MBP_TS,
  MINI_TS,
};
