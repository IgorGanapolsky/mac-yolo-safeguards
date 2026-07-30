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
 * on raw Ollama :11434), and there was NO fallback chain at all
 * (`fallback_providers: null`, `fallback_model: null`), so the failing primary
 * had nowhere to go and was retried in place three times at ~5 minutes each.
 *
 * The 500 itself was a COLD-LOAD TIMEOUT RACE, not an OOM — ollama's server.log
 * shows `client connection closed before llama-server finished loading, aborting
 * load`. Loading 6.6 GB at n_ctx=65536 outlasted Hermes's ~5 min client timeout,
 * so the client disconnected and killed the very load it was waiting for; each
 * retry restarted and re-killed it. There were ZERO jetsam events.
 *
 * A short "warm" pin is a related hazard: keep_alive=2m is shorter than the gap
 * between requests, so it guarantees eviction and a cold load on the next real
 * call. NOT PROVEN to be this incident's cause, though — the only watchdog lines
 * naming a model say `qwen3:8b-64k`, not the 9B that failed, and they postdate
 * the config repair. Flagged as a hazard, not asserted as the trigger.
 *
 * Every individual component reported healthy the whole time. The gateway was up,
 * the LiteLLM proxy was up and serving 30 models, Ollama was listening. The defect
 * lived in the RELATIONSHIP between config values, which no single health check
 * looks at.
 *
 * Checks (see runChecks):
 *   1. primary_unconfigured        — model block has no provider/model (the 07-30 bug)
 *   2. fallback_to_self            — a chain entry routes to the primary (useless hop)
 *   2b. local_pin_thrashes         — a "warm" pin whose keep_alive is shorter than the
 *                                    gap between requests evicts the model between every
 *                                    call, so each real request pays a cold load that can
 *                                    outlast the client timeout (the actual 07-30 500)
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
// A pin shorter than this evicts the model between ordinary requests. The mini
// ran keep_alive=2m (120s) and measured cold loads of 2-6 MINUTES, so every real
// request raced a load it could not win.
const PIN_KEEPALIVE_MIN_SEC = Number(process.env.HERMES_PIN_KEEPALIVE_MIN_SEC || 900);

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

/**
 * Ollama keep_alive durations are written "2m" / "90s" / "600" (bare = seconds).
 * Returns null for anything unparseable so an unknown value stays UNOBSERVED
 * rather than being guessed into a finding.
 */
function parseKeepAliveSeconds(raw) {
  const s = String(raw == null ? '' : raw).trim().toLowerCase();
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  switch (m[2]) {
    case 'ms': return n / 1000;
    case 'm': return n * 60;
    case 'h': return n * 3600;
    default: return n;
  }
}

function isLocalRoute(entry) {
  if (!entry) return false;
  return LOCAL_ROUTE_RE.test(`${entry.provider || ''} ${entry.base_url || ''} ${entry.api || ''}`);
}

/**
 * Chain entries EXACTLY as configured — no dedupe.
 *
 * `fallbackChain()` mirrors Hermes and collapses repeats, which made the
 * duplicate check unreachable for every possible input (PR #1248 review). The
 * duplicate scan has to read the raw config, because the whole point is to tell
 * the operator their file says the same route twice.
 */
function rawFallbackEntries(config) {
  const out = [];
  for (const key of ['fallback_providers', 'fallback_model']) {
    const raw = config ? config[key] : null;
    const entries = Array.isArray(raw)
      ? raw
      : (raw && typeof raw === 'object' ? [raw] : []);
    for (const e of entries) {
      if (e && typeof e === 'object') out.push(e);
    }
  }
  return out;
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

  // 3. Duplicates waste hops for the same reason, one step removed. Read from the
  //    RAW config, not `chain` — the latter is already deduped, which made this
  //    finding unreachable for every input (PR #1248 review).
  const dupSeen = new Map();
  for (const [i, entry] of rawFallbackEntries(config).entries()) {
    const id = routeIdentity(entry);
    if (dupSeen.has(id)) {
      findings.push({
        key: 'duplicate_chain_entries',
        severity: SEVERITY.warn,
        detail: `fallback #${i + 1} duplicates #${dupSeen.get(id) + 1} — the config lists `
          + 'the same route twice; the second copy can never add anything.',
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

  // 7b. The trap that actually produced the 2026-07-30 outage. A "warm" pin with
  //     a short keep_alive evicts the model between requests, so each real call
  //     pays a full cold load — and if that load outlasts the client timeout, the
  //     client disconnects and ABORTS the load, returning 500 "unexpected EOF".
  //     Every retry then restarts and re-kills the same load.
  if (env.watchdogPinsModel === true
      && typeof env.watchdogPinKeepAliveSec === 'number'
      && env.watchdogPinKeepAliveSec < PIN_KEEPALIVE_MIN_SEC) {
    findings.push({
      key: 'local_pin_thrashes',
      severity: SEVERITY.warn,
      detail: `the model warmer pins with keep_alive=${env.watchdogPinKeepAliveSec}s, below `
        + `${PIN_KEEPALIVE_MIN_SEC}s — the model is evicted between requests, so calls pay a `
        + 'cold load that can outlast the client timeout and return 500 "unexpected EOF".',
      observed: `keep_alive=${env.watchdogPinKeepAliveSec}s`,
    });
  }

  // 8. Swap does not by itself prove an OOM (the 07-30 incident logged ZERO
  //    jetsam events) but it slows cold loads, which is what broke things.
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

/** Is a gateway process actually running right now? */
function isGatewayProcessRunning() {
  try {
    const out = execFileSync('pgrep', ['-f', 'hermes_cli.main gateway run'],
      { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] });
    return out.trim().length > 0;
  } catch (e) {
    // pgrep exits 1 when nothing matches — that is a real "not running", not an
    // inability to measure.
    return false;
  }
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
    // Not loaded in the launchd domain — which alone does NOT mean "detached
    // gateway". The label is also absent when the gateway is intentionally
    // stopped or was never installed, and `launchctl print` can fail or time out
    // for unrelated reasons. Claiming an unsupervised gateway in those cases is a
    // false critical (PR #1248 review). Only assert it when a gateway process is
    // actually running: unsupervised means RUNNING but unmanaged.
    if (isGatewayProcessRunning()) {
      env.gatewaySupervised = false;
    }
    // Otherwise leave UNOBSERVED — nothing is running, so there is nothing to
    // supervise, and "cannot evaluate" must never render as a finding.
  }

  try {
    const out = execFileSync('plutil', ['-p', WATCHDOG_PLIST],
      { encoding: 'utf8', timeout: 10000 });
    const m = out.match(/"HERMES_PIN_MODEL"\s*=>\s*"?([01])"?/);
    if (m) env.watchdogPinsModel = m[1] === '1';
    const ka = out.match(/"HERMES_PIN_KEEP_ALIVE"\s*=>\s*"?([^"\n]+)"?/);
    if (ka) {
      const secs = parseKeepAliveSeconds(ka[1]);
      if (secs !== null) env.watchdogPinKeepAliveSec = secs;
    } else {
      // Not overridden in the plist — read the script's own default so the
      // effective value is what gets judged, not the absence of an override.
      try {
        const script = fs.readFileSync(
          path.join(HERMES_HOME, 'hermes-gateway-watchdog.sh'), 'utf8');
        const d = script.match(/PIN_KEEP_ALIVE=.*?:-\s*([^"'}\s]+)/);
        if (d) {
          const secs = parseKeepAliveSeconds(d[1]);
          if (secs !== null) env.watchdogPinKeepAliveSec = secs;
        }
      } catch (e2) { /* leave unobserved */ }
    }
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
      // -f makes curl exit non-zero on an HTTP error response. Without it a 4xx/5xx
      // from ntfy exits 0 and a dropped page reads as delivered (PR #1248 review).
      '-fsS', '-m', '10',
      '-H', `Title: ${title}`,
      '-H', 'Priority: high',
      '-H', 'Tags: warning,satellite',
      '-d', body,
      NTFY,
    ], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] });
    return true;
  } catch (e) {
    // Timeout, DNS failure, HTTP error, or curl missing entirely.
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
      const delivered = sendAlert(`Hermes routing broken on ${host}`, formatAlert(host, fresh));
      // Only mark these as alerted once delivery actually SUCCEEDED. Recording a
      // failed page suppressed every retry for the rest of the UTC day, so a
      // network blip meant the outage went unannounced entirely (PR #1248 review).
      if (delivered) {
        for (const f of fresh) state = recordAlert(state, f.key, host, dayStr);
        writeState(state);
      } else {
        console.error(
          `routing-integrity: ALERT DELIVERY FAILED for ${host} — not recording, will retry next run`);
      }
    }
  }

  return crits.length ? 1 : 0;
}

module.exports = {
  routeIdentity,
  primaryRoute,
  fallbackChain,
  rawFallbackEntries,
  isLocalRoute,
  parseKeepAliveSeconds,
  runChecks,
  criticalFindings,
  shouldAlert,
  recordAlert,
  formatAlert,
  SEVERITY,
  SWAP_WARN_PCT,
  PIN_KEEPALIVE_MIN_SEC,
};

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
