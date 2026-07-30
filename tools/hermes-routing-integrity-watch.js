#!/usr/bin/env node
/**
 * hermes-routing-integrity-watch.js
 *
 * Catches the class of failure that took the phone down on 2026-07-30 and that
 * NOTHING in the fleet was watching for.
 *
 * What happened: the Mac mini's `model:` block in ~/.hermes/config.yaml carried
 * only `{api, max_tokens, fallbacks: []}` — no `provider`, no `model`. Hermes
 * therefore silently defaulted to a DISCOVERED local route (qwen3.5:9b-hermes-64k
 * on raw Ollama :11434), and the effective fallback chain contained exactly one
 * entry: that same model. When Ollama's process was OOM-killed mid-generation on
 * a box sitting at 18.6/19.4 GB swap, the harness dutifully "failed over" to the
 * corpse three times at ~5 minutes each, blew the turn wall-clock, and rendered a
 * raw `Error code: 500 ... unexpected EOF` blob in the user's chat.
 *
 * Every individual component reported healthy the whole time. The gateway was up,
 * the LiteLLM proxy was up and serving 30 models, Ollama was listening. The defect
 * lived in the RELATIONSHIP between config values, which no single health check
 * looks at.
 *
 * Checks (see runChecks):
 *   1. primary_unconfigured        — model block has no provider/model (the 07-30 bug)
 *   2. fallback_to_self            — a chain entry routes to the primary (useless hop)
 *   3. duplicate_chain_entries     — same route twice in the chain
 *   4. empty_chain                 — no fallback at all: any primary blip is fatal
 *   5. gateway_unsupervised        — gateway is a detached process, no crash restart
 *   6. gateway_plist_invalid       — launchd plist does not parse (07-30: 120-byte
 *                                    bare JSON array where a plist dict belonged)
 *   7. local_pin_with_remote_primary — watchdog pinning a local model into RAM
 *                                    while the primary is a remote route
 *   8. swap_exhausted              — swap is the thing that kills local models
 *
 * Read-only except for its state file. Alerts are best-effort and never crash the
 * run. State in ~/.hermes/routing-integrity-state.json; each finding fires at most
 * once per day per host so a standing problem does not become notification noise.
 *
 * Usage:
 *   node tools/hermes-routing-integrity-watch.js            # check + alert
 *   node tools/hermes-routing-integrity-watch.js --dry-run  # print, never alert
 *   node tools/hermes-routing-integrity-watch.js --json     # machine-readable
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const HERMES_HOME = process.env.HERMES_HOME || path.join(os.homedir(), '.hermes');
const CONFIG_PATH = path.join(HERMES_HOME, 'config.yaml');
const STATE_PATH = process.env.HERMES_ROUTING_STATE_PATH
  || path.join(HERMES_HOME, 'routing-integrity-state.json');
const NTFY = process.env.HERMES_NTFY_URL || 'https://ntfy.sh/yolo-guard-fdh8ktuw1vtxb5sb';
const GATEWAY_PLIST = path.join(os.homedir(), 'Library', 'LaunchAgents', 'ai.hermes.gateway.plist');
const WATCHDOG_PLIST = path.join(
  os.homedir(), 'Library', 'LaunchAgents', 'com.igor.hermes-gateway-watchdog.plist');
const SWAP_WARN_PCT = Number(process.env.HERMES_SWAP_WARN_PCT || 85);

// Routes that live on this machine. A "remote" primary means the box does not
// need a local model resident, so pinning one is pure memory cost.
const LOCAL_ROUTE_RE = /(ollama|127\.0\.0\.1:11434|127\.0\.0\.1:11435|localhost:1143)/i;

const SEVERITY = { critical: 'critical', warn: 'warn' };

// ---------------------------------------------------------------------------
// Pure logic — every function below takes plain data so the tests never need a
// real Mac, a real config file, or a running gateway.
// ---------------------------------------------------------------------------

/** Normalize a route to a comparable identity tuple string. */
function routeIdentity(entry) {
  if (!entry || typeof entry !== 'object') return '';
  const provider = String(entry.provider || '').trim().toLowerCase();
  const model = String(entry.model || entry.default || '').trim().toLowerCase();
  const base = String(entry.base_url || entry.api || '').trim().toLowerCase().replace(/\/+$/, '');
  return `${provider}|${model}|${base}`;
}

/** The primary route as declared by config.model. */
function primaryRoute(config) {
  const m = (config && config.model) || null;
  if (!m || typeof m !== 'object') return null;
  return {
    provider: String(m.provider || '').trim(),
    model: String(m.model || m.default || '').trim(),
    base_url: String(m.base_url || m.api || '').trim(),
  };
}

/**
 * Effective fallback chain, merging the modern list key with the legacy single
 * dict — mirrors hermes_cli.fallback_config.get_fallback_chain so this sentinel
 * sees exactly what the agent will use, not a hopeful approximation.
 */
function fallbackChain(config) {
  const out = [];
  const seen = new Set();
  for (const key of ['fallback_providers', 'fallback_model']) {
    const raw = config ? config[key] : null;
    const entries = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' ? [raw] : []);
    for (const e of entries) {
      if (!e || typeof e !== 'object') continue;
      const id = routeIdentity(e);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(e);
    }
  }
  return out;
}

function isLocalRoute(entry) {
  if (!entry) return false;
  return LOCAL_ROUTE_RE.test(`${entry.provider || ''} ${entry.base_url || ''} ${entry.api || ''}`);
}

/**
 * Core check. `env` carries the observed host facts so the caller decides how to
 * gather them (and the tests can supply them directly):
 *   { gatewaySupervised, gatewayPlistValid, watchdogPinsModel, swapUsedPct }
 * Any field left undefined is treated as "not observed" and skipped rather than
 * guessed — a check that cannot run must never report clean.
 */
function runChecks(config, env = {}) {
  const findings = [];
  const primary = primaryRoute(config);
  const chain = fallbackChain(config);

  // 1. The 2026-07-30 root cause. Without an explicit provider+model, Hermes
  //    picks a discovered route and the operator never learns which one.
  if (!primary || !primary.provider || !primary.model) {
    findings.push({
      key: 'primary_unconfigured',
      severity: SEVERITY.critical,
      detail: 'config.model has no explicit provider/model — Hermes will silently '
        + 'select a discovered route (this is exactly the 2026-07-30 mini failure).',
      observed: primary ? JSON.stringify(primary) : 'model block missing',
    });
  }

  // 2. Falling back to the route that just failed can never help.
  if (primary && primary.provider && primary.model) {
    const primaryId = routeIdentity(primary);
    for (const [i, entry] of chain.entries()) {
      if (routeIdentity(entry) === primaryId) {
        findings.push({
          key: 'fallback_to_self',
          severity: SEVERITY.critical,
          detail: `fallback #${i + 1} routes to the primary itself — a failover that `
            + 'cannot recover anything, and burns the full retry budget doing it.',
          observed: primaryId,
        });
      }
    }
  }

  // 3. Duplicates waste hops for the same reason, one step removed.
  const dupSeen = new Map();
  for (const [i, entry] of chain.entries()) {
    const id = routeIdentity(entry);
    if (dupSeen.has(id)) {
      findings.push({
        key: 'duplicate_chain_entries',
        severity: SEVERITY.warn,
        detail: `fallback #${i + 1} duplicates #${dupSeen.get(id) + 1}.`,
        observed: id,
      });
    } else {
      dupSeen.set(id, i);
    }
  }

  // 4. No fallback at all: the primary becomes a single point of failure.
  if (chain.length === 0) {
    findings.push({
      key: 'empty_chain',
      severity: SEVERITY.warn,
      detail: 'no fallback routes configured — any primary outage is a full outage.',
      observed: '0 entries',
    });
  }

  // 5-6. Supervision. Only reported when actually observed.
  if (env.gatewaySupervised === false) {
    findings.push({
      key: 'gateway_unsupervised',
      severity: SEVERITY.critical,
      detail: 'gateway is running detached — launchd will NOT restart it on crash '
        + 'and it will NOT come back after a reboot.',
      observed: 'detached process',
    });
  }
  if (env.gatewayPlistValid === false) {
    findings.push({
      key: 'gateway_plist_invalid',
      severity: SEVERITY.critical,
      detail: 'the gateway launchd plist does not parse, so supervision silently '
        + 'degrades to a detached process.',
      observed: GATEWAY_PLIST,
    });
  }

  // 7. Memory spent on a model the primary path never calls.
  if (env.watchdogPinsModel === true && primary && primary.provider && !isLocalRoute(primary)) {
    findings.push({
      key: 'local_pin_with_remote_primary',
      severity: SEVERITY.warn,
      detail: 'the watchdog pins a local model into RAM while the primary route is '
        + 'remote — pure memory cost, and memory is what kills local models.',
      observed: `primary=${primary.provider}/${primary.model}`,
    });
  }

  // 8. Swap is the proximate cause of "unexpected EOF" from a local model.
  if (typeof env.swapUsedPct === 'number' && env.swapUsedPct >= SWAP_WARN_PCT) {
    findings.push({
      key: 'swap_exhausted',
      severity: SEVERITY.warn,
      detail: `swap is ${env.swapUsedPct.toFixed(1)}% used — local model processes get `
        + 'killed mid-generation at this level, surfacing as HTTP 500 "unexpected EOF".',
      observed: `${env.swapUsedPct.toFixed(1)}%`,
    });
  }

  return findings;
}

/** Findings worth waking someone for. */
function criticalFindings(findings) {
  return findings.filter((f) => f.severity === SEVERITY.critical);
}

/** Once-per-day-per-host dedupe so a standing problem is not a standing alarm. */
function shouldAlert(state, key, host, dayStr) {
  const seen = (state && state.lastAlerted && state.lastAlerted[`${host}:${key}`]) || null;
  return seen !== dayStr;
}

function recordAlert(state, key, host, dayStr) {
  const next = state && typeof state === 'object' ? { ...state } : {};
  next.lastAlerted = { ...(next.lastAlerted || {}) };
  next.lastAlerted[`${host}:${key}`] = dayStr;
  return next;
}

function formatAlert(host, findings) {
  const lines = [`Hermes routing integrity — ${host}`];
  for (const f of findings) {
    lines.push(`[${f.severity.toUpperCase()}] ${f.key}: ${f.detail} (${f.observed})`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// I/O layer
// ---------------------------------------------------------------------------

function loadConfig(configPath = CONFIG_PATH) {
  // The repo has no root js-yaml and the config is a large hand-edited file, so
  // parsing goes through python3+PyYAML — the same reader Hermes itself uses.
  const out = execFileSync('python3', [
    '-c',
    'import sys,yaml,json;json.dump(yaml.safe_load(open(sys.argv[1])),sys.stdout,default=str)',
    configPath,
  ], { encoding: 'utf8', timeout: 20000 });
  return JSON.parse(out);
}

function observeEnv() {
  const env = {};

  try {
    const out = execFileSync('plutil', ['-lint', GATEWAY_PLIST],
      { encoding: 'utf8', timeout: 10000 });
    env.gatewayPlistValid = /OK\s*$/.test(out.trim());
  } catch (e) {
    // A plist that fails lint exits non-zero — that IS the finding, not an
    // inability to measure. A missing file is different and stays unobserved.
    env.gatewayPlistValid = fs.existsSync(GATEWAY_PLIST) ? false : undefined;
  }

  try {
    const uid = process.getuid();
    const out = execFileSync('launchctl', ['print', `gui/${uid}/ai.hermes.gateway`],
      { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] });
    env.gatewaySupervised = /state\s*=\s*running/i.test(out) || /pid\s*=\s*\d+/i.test(out);
  } catch (e) {
    // Not loaded in the launchd domain. If a gateway is nonetheless listening,
    // it is a detached process — precisely the unsupervised case.
    env.gatewaySupervised = false;
  }

  try {
    const out = execFileSync('plutil', ['-p', WATCHDOG_PLIST],
      { encoding: 'utf8', timeout: 10000 });
    const m = out.match(/"HERMES_PIN_MODEL"\s*=>\s*"?([01])"?/);
    if (m) env.watchdogPinsModel = m[1] === '1';
  } catch (e) { /* watchdog not installed on this host — leave unobserved */ }

  try {
    const out = execFileSync('sysctl', ['-n', 'vm.swapusage'],
      { encoding: 'utf8', timeout: 10000 });
    const total = Number((out.match(/total\s*=\s*([\d.]+)M/) || [])[1]);
    const used = Number((out.match(/used\s*=\s*([\d.]+)M/) || [])[1]);
    if (Number.isFinite(total) && Number.isFinite(used) && total > 0) {
      env.swapUsedPct = (used / total) * 100;
    }
  } catch (e) { /* leave unobserved */ }

  return env;
}

function readState(statePath = STATE_PATH) {
  try { return JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch (e) { return {}; }
}

function writeState(state, statePath = STATE_PATH) {
  try {
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  } catch (e) { /* state is an optimization, never a reason to fail the run */ }
}

function sendAlert(title, body) {
  try {
    execFileSync('curl', [
      '-s', '-m', '10',
      '-H', `Title: ${title}`,
      '-H', 'Priority: high',
      '-H', 'Tags: warning,satellite',
      '-d', body,
      NTFY,
    ], { encoding: 'utf8', timeout: 15000 });
    return true;
  } catch (e) {
    return false;
  }
}

function main(argv) {
  const dryRun = argv.includes('--dry-run');
  const asJson = argv.includes('--json');
  const host = os.hostname().replace(/\.local$/, '');
  const dayStr = new Date().toISOString().slice(0, 10);

  let config;
  try {
    config = loadConfig();
  } catch (e) {
    // Cannot read config => cannot evaluate. Say so; never report clean.
    const msg = `routing-integrity: CANNOT EVALUATE on ${host} — ${e.message}`;
    if (asJson) console.log(JSON.stringify({ host, error: String(e.message), findings: null }));
    else console.error(msg);
    return 2;
  }

  const findings = runChecks(config, observeEnv());

  if (asJson) {
    console.log(JSON.stringify({ host, day: dayStr, findings }, null, 2));
  } else if (findings.length === 0) {
    console.log(`routing-integrity: ${host} clean (${fallbackChain(config).length} fallback routes)`);
  } else {
    console.log(formatAlert(host, findings));
  }

  const crits = criticalFindings(findings);
  if (crits.length && !dryRun) {
    let state = readState();
    const fresh = crits.filter((f) => shouldAlert(state, f.key, host, dayStr));
    if (fresh.length) {
      sendAlert(`Hermes routing broken on ${host}`, formatAlert(host, fresh));
      for (const f of fresh) state = recordAlert(state, f.key, host, dayStr);
      writeState(state);
    }
  }

  return crits.length ? 1 : 0;
}

module.exports = {
  routeIdentity,
  primaryRoute,
  fallbackChain,
  isLocalRoute,
  runChecks,
  criticalFindings,
  shouldAlert,
  recordAlert,
  formatAlert,
  SEVERITY,
  SWAP_WARN_PCT,
};

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
