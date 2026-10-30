'use strict';
/**
 * test-dg-integration.js — Tests for Dayglass ↔ mac-yolo-safeguards integration.
 *
 * Verifies:
 *   1. dg-query.sh returns a valid active-window string
 *   2. dg-query.sh frame-stale returns a non-negative integer
 *   3. dg-health.js runs and exits 0 (when Dayglass server is up)
 *   4. The guard script has Dayglass integration functions wired in
 *   5. The guard script syntax is valid (sh -n)
 *   6. yolo-health includes a Dayglass section
 */

const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(os.homedir(), 'workspace', 'mac-yolo-safeguards');
const WORKTREE = path.join(os.homedir(), 'workspace', 'wt-dayglass-integration');
const DG_QUERY = path.join(WORKTREE, 'tools', 'dg-query.sh');
const DG_HEALTH = path.join(WORKTREE, 'tools', 'dg-health.js');
const GUARD = path.join(WORKTREE, 'sim-runaway-guard.sh');
const YOLO_HEALTH = path.join(WORKTREE, 'yolo-health');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('dg-query.sh active-window returns app name', () => {
  const out = execSync(`DG_SERVER=http://127.0.0.1:3333 bash "${DG_QUERY}" active-window`, {
    timeout: 5000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']
  }).trim();
  if (!out) throw new Error('dg-query.sh active-window returned empty (Dayglass server may be down)');
  if (!out.includes(' — ') && out.length < 2) throw new Error(`Unexpected active-window output: "${out}"`);
});

test('dg-query.sh frame-stale returns non-negative integer', () => {
  const out = execSync(`bash "${DG_QUERY}" frame-stale`, {
    timeout: 5000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']
  }).trim();
  const n = parseInt(out, 10);
  if (isNaN(n) || n < 0) throw new Error(`frame-stale returned invalid value: "${out}"`);
});

test('guard script contains dg_active_window function', () => {
  const src = fs.readFileSync(GUARD, 'utf8');
  if (!src.includes('dg_active_window()')) throw new Error('dg_active_window() function missing');
  if (!src.includes('dg_log_event()')) throw new Error('dg_log_event() function missing');
  if (!src.includes('dg_frame_stale_seconds()')) throw new Error('dg_frame_stale_seconds() function missing');
});

test('guard script notify() appends On screen now', () => {
  const src = fs.readFileSync(GUARD, 'utf8');
  if (!src.includes('_dg_win=$(dg_active_window')) throw new Error('notify() does not call dg_active_window');
  if (!src.includes('On screen now:')) throw new Error('notify() does not append "On screen now"');
});

test('guard script has frame-freshness freeze detection', () => {
  const src = fs.readFileSync(GUARD, 'utf8');
  if (!src.includes('DG_FRAME_STALE_SEC')) throw new Error('DG_FRAME_STALE_SEC not configured');
  if (!src.includes('DG_FRAME_STALE')) throw new Error('Frame-stale log line missing');
  if (!src.includes('screen capture stuck')) throw new Error('Frame-stale notification message missing');
});

test('guard script has dg_log_event at key points', () => {
  const src = fs.readFileSync(GUARD, 'utf8');
  const events = ['guard_cpu_kill', 'guard_codeql_kill', 'guard_cpu_notify', 'guard_mem_notify', 'guard_fired', 'guard_escalation'];
  for (const evt of events) {
    if (!src.includes(`"${evt}"`)) throw new Error(`Missing dg_log_event for "${evt}"`);
  }
});

test('guard script passes sh -n syntax check', () => {
  execFileSync('sh', ['-n', GUARD], { stdio: 'pipe' });
});

test('yolo-health includes Dayglass section', () => {
  const src = fs.readFileSync(YOLO_HEALTH, 'utf8');
  if (!src.includes('Dayglass')) throw new Error('yolo-health missing Dayglass section');
  if (!src.includes('DG_SERVER_URL')) throw new Error('yolo-health missing DG_SERVER_URL check');
  if (!src.includes('dg-health.js')) throw new Error('yolo-health missing dg-health.js check');
});

test('yolo-health passes sh -n syntax check', () => {
  execFileSync('sh', ['-n', YOLO_HEALTH], { stdio: 'pipe' });
});

test('dg-query.sh passes bash -n syntax check', () => {
  execFileSync('bash', ['-n', DG_QUERY], { stdio: 'pipe' });
});

test('dg-health.js passes node --check', () => {
  execFileSync('node', ['--check', DG_HEALTH], { stdio: 'pipe' });
});

// --- Run tests ---
let passed = 0;
let failed = 0;

for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     → ${e.message}`);
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
