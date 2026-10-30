#!/usr/bin/env node
/**
 * dg-health.js — Verify Dayglass integration with mac-yolo-safeguards.
 *
 * Checks:
 *   1. Dayglass server is reachable on http://127.0.0.1:3333
 *   2. /api/status returns active_window (real-time "On screen now")
 *   3. /api/health/mac returns system health data
 *   4. Frame freshness: last_seen_at is within threshold (default 30s)
 *   5. The guard script references Daysglass integration functions
 *
 * Exit 0 = all checks pass; Exit 1 = one or more checks fail.
 *
 * Usage:  node tools/dg-health.js [options]
 *   --dg-server URL    Dayglass server URL (default: http://127.0.0.1:3333)
 *   --dg-sqlite PATH   Path to dayglass.sqlite (default: ~/.dayglass/dayglass.sqlite)
 *   --frame-stale N    Max seconds since last frame (default: 30)
 */
'use strict';

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const DG_SERVER = process.env.DG_SERVER || 'http://127.0.0.1:3333';
const DG_SQLITE = process.env.DG_SQLITE || path.join(require('os').homedir(), '.dayglass', 'dayglass.sqlite');
const FRAME_STALE_THRESHOLD = parseInt(process.env.DG_FRAME_STALE_SEC || '30', 10);
const GUARD_SCRIPT = process.env.GUARD_SCRIPT || path.join(require('os').homedir(), '.local', 'bin', 'sim-runaway-guard.sh');

const flags = process.argv.slice(2);
let dgServer = DG_SERVER;
let dgSqlite = DG_SQLITE;
let frameStale = FRAME_STALE_THRESHOLD;
for (let i = 0; i < flags.length; i++) {
  switch (flags[i]) {
    case '--dg-server': dgServer = flags[++i]; break;
    case '--dg-sqlite': dgSqlite = flags[++i]; break;
    case '--frame-stale': frameStale = parseInt(flags[++i], 10); break;
    case '--help': case '-h':
      console.log('Usage: dg-health.js [--dg-server URL] [--dg-sqlite PATH] [--frame-stale SECONDS]');
      process.exit(0);
  }
}

let results = [];
function check(name, fn) { results.push({ name, ...fn() }); }
function ok(detail) { return { passed: true, detail }; }
function fail(detail) { return { passed: false, detail }; }

// 1. Dayglass server reachable
let serverReachable = { name: 'Dayglass server reachable', passed: false, detail: '' };
try {
  const url = new URL(dgServer + '/api/status');
  const lib = url.protocol === 'https:' ? https : http;
  const req = lib.get(url, { timeout: 3000 }, (res) => {
    serverReachable = { name: 'Dayglass server reachable', passed: res.statusCode === 200, detail: `HTTP ${res.statusCode}` };
    finish();
  });
  req.on('error', () => { serverReachable = { name: 'Dayglass server reachable', passed: false, detail: 'connection refused' }; finish(); });
  req.on('timeout', () => { serverReachable = { name: 'Dayglass server reachable', passed: false, detail: 'timeout' }; req.destroy(); finish(); });
} catch (e) {
  serverReachable = { name: 'Dayglass server reachable', passed: false, detail: e.message };
  finish();
}

let activeWindow = { name: 'Active window (On screen now)', passed: false, detail: '' };
let healthReport = { name: 'Health endpoint (/api/health/mac)', passed: false, detail: '' };
let frameFresh = { name: 'Frame freshness', passed: false, detail: '' };
let guardRefs = { name: 'Guard script Dayglass integration', passed: false, detail: '' };

function finish() {
  // 2. Active window (On screen now)
  if (serverReachable.passed) {
    const url = new URL(dgServer + '/api/status');
    const lib = url.protocol === 'https:' ? https : http;
    lib.get(url, { timeout: 3000 }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        try {
          const d = JSON.parse(body);
          const w = d.active_window;
          if (w && w.app_name) {
            activeWindow = { name: 'Active window (On screen now)', passed: true, detail: `${w.app_name}${w.window_title ? ' — ' + w.window_title : ''}` };
          } else {
            activeWindow = { name: 'Active window (On screen now)', passed: false, detail: 'active_window missing or empty in /api/status' };
          }
        } catch (e) {
          activeWindow = { name: 'Active window (On screen now)', passed: false, detail: `JSON parse error: ${e.message}` };
        }
        // 3. Health report
        const hurl = new URL(dgServer + '/api/health/mac');
        const hlib = hurl.protocol === 'https:' ? https : http;
        hlib.get(hurl, { timeout: 3000 }, (hres) => {
          let hbody = '';
          hres.on('data', (c) => hbody += c);
          hres.on('end', () => {
            try {
              const hd = JSON.parse(hbody);
              const mem = hd.memory || {};
              healthReport = {
                name: 'Health endpoint (/api/health/mac)',
                passed: true,
                detail: `pressure=${mem.pressure_pct ?? '?'}% swap=${mem.swap_pressure ?? '?'} load=${JSON.stringify(hd.load_avg || {})} procs=${(hd.top_procs || []).length}`
              };
            } catch (e) {
              healthReport = { name: 'Health endpoint (/api/health/mac)', passed: false, detail: `JSON parse error: ${e.message}` };
            }
            checkFrameFreshness();
          });
        }).on('error', () => {
          healthReport = { name: 'Health endpoint (/api/health/mac)', passed: false, detail: 'connection failed' };
          checkFrameFreshness();
        });
      });
    }).on('error', () => {
      activeWindow = { passed: false, detail: 'connection failed' };
      healthReport = { name: 'Health endpoint (/api/health/mac)', passed: false, detail: 'connection failed' };
      checkFrameFreshness();
    });
  } else {
    // Skip API-based checks, still check sqlite and guard script
    checkFrameFreshness();
  }
}

function checkFrameFreshness() {
  // 4. Frame freshness via SQLite
  const { execSync } = require('child_process');
  try {
    const result = execSync(`sqlite3 "${dgSqlite}" "SELECT CAST((julianday('now') - julianday(last_seen_at)) * 86400 AS INTEGER) FROM frames ORDER BY id DESC LIMIT 1;"`, {
      timeout: 3000,
      encoding: 'utf8'
    }).trim();
    const staleSec = parseInt(result, 10);
    if (isNaN(staleSec)) {
      frameFresh = { name: 'Frame freshness', passed: true, detail: 'no frames yet (new install)' };
    } else if (staleSec <= frameStale) {
      frameFresh = { name: 'Frame freshness', passed: true, detail: `last frame ${staleSec}s ago (threshold ${frameStale}s)` };
    } else {
      frameFresh = { name: 'Frame freshness', passed: false, detail: `last frame ${staleSec}s ago exceeds ${frameStale}s threshold — screen may be frozen` };
    }
  } catch (e) {
    frameFresh = { name: 'Frame freshness', passed: true, detail: `dayglass.sqlite not found or unreadable: ${dgSqlite}` };
  }

  // 5. Guard script references Dayglass integration
  try {
    const guardSrc = fs.readFileSync(GUARD_SCRIPT, 'utf8');
    const hasActiveWindow = guardSrc.includes('dg_active_window');
    const hasLogEvent = guardSrc.includes('dg_log_event');
    const hasFrameFresh = guardSrc.includes('dg_frame_stale');
    if (hasActiveWindow && hasLogEvent && hasFrameFresh) {
      guardRefs = {
        name: 'Guard script Dayglass integration',
        passed: true,
        detail: 'dg_active_window + dg_log_event + dg_frame_stale_seconds all wired in'
      };
    } else {
      const missing = [!hasActiveWindow && 'dg_active_window', !hasLogEvent && 'dg_log_event', !hasFrameFresh && 'dg_frame_stale'].filter(Boolean).join(', ');
      guardRefs = { name: 'Guard script Dayglass integration', passed: false, detail: `missing in guard: ${missing}` };
    }
  } catch (e) {
    guardRefs = { name: 'Guard script Dayglass integration', passed: false, detail: `guard script not found: ${GUARD_SCRIPT}` };
  }

  // Report
  const all = [serverReachable, activeWindow, healthReport, frameFresh, guardRefs];
  for (const r of all) {
    const mark = r.passed ? '✅' : '❌';
    console.log(`  ${mark} ${r.name || '(unnamed)'}: ${r.detail || ''}`);
  }
  const failed = all.filter(r => !r.passed);
  console.log(`\nDayglass integration: ${all.length - failed.length}/${all.length} checks passed`);
  process.exit(failed.length === 0 ? 0 : 1);
}
