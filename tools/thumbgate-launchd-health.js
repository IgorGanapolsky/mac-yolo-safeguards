#!/usr/bin/env node
'use strict';

/**
 * thumbgate-launchd-health.js — deterministic self-heal check for the ThumbGate/Hermes
 * local agent fleet (the com.igor.* LaunchAgents you operate).
 *
 * WHY THIS EXISTS (the incident it fixes):
 *  - "mcp and tools and skills disabled" root cause = the ThumbGate MCP server was not
 *    registered (`~/.claude/settings.json` had no `mcpServers.thumbgate` and no mcp.json),
 *    plus 168 stale `.mcp-server-*.lock` files blocking server re-launch. Fix =
 *    `thumbgate install-mcp --no-hooks` + clearing stale locks.
 *  - The 12h cron `thumbgate-drift-watch` (the self-heal re-kicker) exits INCONCLUSIVE
 *    (exit 2: "16 gate-check invocation(s) failed to produce a verdict") and aborts BEFORE
 *    its re-kick step, so crashed LAs (grepai corrupt-index exit 1, reddit exit 78,
 *    litellm/dashboard SIGTERM -15) stay down → cascade.
 *
 * This tool is the deterministic, versioned, CI-testable guard against that cascade.
 * It DETECTS + REPORTS + (with --fix) re-kicks crashed LAs + asserts protected components.
 *
 * Usage:
 *   node tools/thumbgate-launchd-health.js            # report (exit 1 if protected down)
 *   node tools/thumbgate-launchd-health.js --fix       # re-kick crashed LAs
 *   node tools/thumbgate-launchd-health.js --json
 *
 * On non-Mac / no launchctl (e.g. CI): prints "non-mac" and exits 0 (skips).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const HOME = process.env.HOME || require('os').homedir();
const LA_RE = /^com\.(igor|hermes|thumbgate)\./;

function parseLaunchctlList(text) {
  const rows = [];
  const lines = String(text || '').split(/\r?\n/);
  let header = true;
  for (const raw of lines) {
    const t = raw.trim();
    if (!t) continue;
    if (header) { if (/^PID\s+Status\s+Label/.test(t)) { header = false; continue; } }
    const cols = t.split(/\s+/);
    if (cols.length < 3) continue;
    const [pid, status, ...rest] = cols;
    const label = rest.join(' ');
    if (!LA_RE.test(label)) continue;
    const crashed = /^-?\d+$/.test(String(status)) && String(status) !== '0';
    rows.push({ label, pid, status: String(status), crashed });
  }
  return rows;
}

function mcpRegistered(opts) {
  // settings.json may carry mcpServers.thumbgate (install-mcp path) or a separate mcp.json.
  if (opts.mcpRegistered !== undefined) return opts.mcpRegistered;
  const settings = path.join(HOME, '.claude', 'settings.json');
  const mcpJson = path.join(HOME, '.claude', 'mcp.json');
  try {
    if (fs.existsSync(mcpJson)) return true;
    if (fs.existsSync(settings)) {
      const s = JSON.parse(fs.readFileSync(settings, 'utf8'));
      if (s && s.mcpServers && s.mcpServers.thumbgate) return true;
    }
  } catch (_) { /* ignore parse errors */ }
  return false;
}

function assessHealth(rows, opts) {
  opts = opts || {};
  const byLabel = (l) => rows.find((r) => r.label === l);
  const crashed = rows.filter((r) => r.crashed).map((r) => ({ label: r.label, exit: r.status }));
  const shutdownSimulators = byLabel('com.igor.shutdown-simulators');
  const continuousE2e = byLabel('com.igor.hermes-mobile-continuous-e2e');
  const driftWatch = byLabel('com.igor.thumbgate-drift-watch');
  const protectedDown = [];
  if (!shutdownSimulators) protectedDown.push('com.igor.shutdown-simulators (missing)');
  else if (shutdownSimulators.crashed) protectedDown.push(`com.igor.shutdown-simulators (exit ${shutdownSimulators.status})`);
  if (!continuousE2e) protectedDown.push('com.igor.hermes-mobile-continuous-e2e (missing)');
  else if (continuousE2e.crashed) protectedDown.push(`com.igor.hermes-mobile-continuous-e2e (exit ${continuousE2e.status})`);
  if (!mcpRegistered(opts)) protectedDown.push('thumbgate MCP not registered (mcp__thumbgate_* disabled)');
  const driftInconclusive = driftWatch && driftWatch.crashed && String(driftWatch.status) === '2';
  return {
    rows,
    crashed,
    mcpRegistered: mcpRegistered(opts),
    driftWatchInconclusive: !!driftInconclusive,
    shutdownSimulatorsLoaded: !!shutdownSimulators && !shutdownSimulators.crashed,
    continuousE2eLoaded: !!continuousE2e && !continuousE2e.crashed,
    protectedOk: protectedDown.length === 0,
    protectedDown,
  };
}

function kick(uid, label) {
  try {
    execFileSync('launchctl', ['kickstart', '-p', `gui/${uid}/${label}`], { stdio: 'pipe' });
    return 're-kicked';
  } catch (e) {
    return `re-kick-failed: ${e.message.split('\n')[0]}`;
  }
}

function main() {
  const args = process.argv.slice(2);
  const fix = args.includes('--fix');
  const asJson = args.includes('--json');
  const uid = String(require('os').userInfo().uid);

  let listText = '';
  let nonMac = false;
  try {
    listText = execFileSync('launchctl', ['list'], { timeout: 5000 }).toString();
  } catch (e) {
    if (/not found/i.test(e.message) || /launchctl/i.test(String(e.path || ''))) {
      nonMac = true;
    } else {
      console.error(`launchctl list failed: ${e.message}`);
      process.exit(2);
    }
  }

  if (nonMac) {
    const out = { nonMac: true, skipped: 'launchctl unavailable (non-Mac/CI)', protectedOk: false };
    if (asJson) { console.log(JSON.stringify(out, null, 2)); }
    else { console.log('thumbgate-launchd-health: non-mac — launchctl unavailable; protected assertions skipped on CI'); console.log('  (run this on the Mac to check protected components)'); }
    process.exit(0); // CI-safe: don't fail builds on other platforms
  }

  const rows = parseLaunchctlList(listText);
  const health = assessHealth(rows);

  if (fix) {
    for (const r of health.crashed) {
      const res = kick(uid, r.label);
      if (asJson) {} else { console.log(`  ${r.label} (exit ${r.exit}) -> ${res}`); }
    }
  }

  if (asJson) {
    console.log(JSON.stringify({ ...health, fix, fixed: fix ? health.crashed.length : 0 }, null, 2));
  } else {
    console.log(`thumbgate-launchd-health: ${health.crashed.length} crashed com.igor.* LAs`);
    console.log(`  mcpServers.thumbgate registered: ${health.mcpRegistered ? 'YES' : 'NO'}`);
    console.log(`  shutdown-simulators loaded (60s): ${health.shutdownSimulatorsLoaded ? 'YES' : 'NO'}`);
    console.log(`  hermes-mobile-continuous-e2e loaded: ${health.continuousE2eLoaded ? 'YES' : 'NO'}`);
    console.log(`  drift-watch INCONCLUSIVE (exit 2, self-heal breaker): ${health.driftWatchInconclusive ? 'YES' : 'no'}`);
    if (health.crashed.length) {
      console.log('  crashed:');
      for (const c of health.crashed) console.log(`    - ${c.label} (exit ${c.exit})`);
    }
    if (health.protectedDown.length) {
      console.log('  PROTECTED DOWN:');
      for (const d of health.protectedDown) console.log(`    - ${d}`);
    }
    console.log(`  ${health.protectedOk ? 'OK' : 'FAIL'} protected components ` +
      `(${health.protectedDown.length} down)`);
  }
  process.exit(health.protectedOk ? 0 : 1);
}

module.exports = { parseLaunchctlList, assessHealth, mcpRegistered, LA_RE };
require.main === module && main();
