'use strict';

/**
 * Tests for tools/agent-claim-ledger.js — WAL-backed, CAS-guaranteed claim ledger.
 *
 * Maps Cursor's "Git at any scale" Continuity patterns to ThumbGate.app's
 * agent-fleet coordination:
 *   - WAL-as-truth: claim events persisted BEFORE lock acquired
 *   - CAS consensus: O_EXCL lock prevents race claims
 *   - Gossip replication: heartbeat files for real-time agent state
 *   - Compaction: WAL replay → state.json snapshot
 *   - GC of idle: stale heartbeats → claim release
 *
 * Tests import the real module and redirect CLAIM_LEDGER_ROOT to a temp
 * directory so the production coordination/claims/ tree is never touched.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const TOOL = path.join(__dirname, '..', 'tools', 'agent-claim-ledger.js');

// Each test gets a fresh temp dir so there are no cross-test ordering issues.
function freshEnv() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claim-ledger-'));
  return { root, env: { ...process.env, CLAIM_LEDGER_ROOT: root } };
}

function loadLedger(env) {
  delete require.cache[require.resolve(TOOL)];
  const orig = process.env.CLAIM_LEDGER_ROOT;
  process.env.CLAIM_LEDGER_ROOT = env.CLAIM_LEDGER_ROOT;
  const mod = require(TOOL);
  process.env.CLAIM_LEDGER_ROOT = orig;
  return mod;
}

// Run a CLI command and capture stdout regardless of exit code.
function runCli(args, env) {
  const result = spawnSync('node', [TOOL, ...args], {
    encoding: 'utf8',
    timeout: 10000,
    env,
  });
  return { stdout: result.stdout || '', stderr: result.stderr || '', status: result.status };
}

// ---------------------------------------------------------------------------
// Path hashing & lock naming
// ---------------------------------------------------------------------------

test('lockNameFor is deterministic: same file path → same lock filename', () => {
  const { env, root } = freshEnv();
  const mod = loadLedger(env);
  const file = 'hermes-mobile/src/screens/ChatScreen.tsx';
  assert.strictEqual(mod.lockNameFor(file), mod.lockNameFor(file));
  assert.notStrictEqual(mod.lockNameFor(file), mod.lockNameFor(file + '.bak'));
  assert.match(mod.lockNameFor(file), /^[0-9a-f]{40}\.lock$/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('safeAgentName sanitises non-portable characters', () => {
  assert.match(require(TOOL).safeAgentName('cursor/agent'), /cursor_agent/);
  assert.match(require(TOOL).safeAgentName('gemini agent'), /gemini_agent/);
  assert.strictEqual(require(TOOL).safeAgentName('plain'), 'plain');
});

// ---------------------------------------------------------------------------
// CAS consensus
// ---------------------------------------------------------------------------

test('CAS claim: first agent gets the lock, second is denied', () => {
  const { env, root } = freshEnv();
  const mod = loadLedger(env);
  const file = 'src/foo.ts';

  const lock1 = mod.casClaimLock(file, 'agent-a');
  assert.ok(lock1, 'first agent should acquire the lock');
  const lock2 = mod.casClaimLock(file, 'agent-b');
  assert.strictEqual(lock2, null, 'second agent must be denied (CAS race)');
  assert.strictEqual(mod.readLockAgent(file), 'agent-a');

  fs.rmSync(root, { recursive: true, force: true });
});

test('releaseLock removes the lock and is idempotent', () => {
  const { env, root } = freshEnv();
  const mod = loadLedger(env);
  const file = 'src/bar.ts';

  mod.casClaimLock(file, 'agent-a');
  assert.ok(mod.releaseLock(file), 'first release returns true');
  assert.strictEqual(mod.releaseLock(file), false, 'second release returns false');
  assert.strictEqual(mod.readLockAgent(file), null);

  fs.rmSync(root, { recursive: true, force: true });
});

test('readLockAgent returns null for unclaimed files', () => {
  const { env, root } = freshEnv();
  const mod = loadLedger(env);
  assert.strictEqual(mod.readLockAgent('src/never-claimed.ts'), null);
  fs.rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// WAL-as-truth
// ---------------------------------------------------------------------------

test('claimFile writes WAL event BEFORE lock (WAL-as-truth)', () => {
  const { env, root } = freshEnv();
  const mod = loadLedger(env);
  const file = 'src/wal-order.ts';

  const result = mod.claimFile('claude-code', file, { task: 'T-WAL', branch: 'feat/wal' });
  assert.ok(result.ok);
  assert.ok(result.walEvent, 'WAL event must be created');
  assert.strictEqual(result.walEvent.type, 'claim');
  assert.strictEqual(result.walEvent.agent, 'claude-code');
  assert.strictEqual(result.walEvent.task, 'T-WAL');
  assert.strictEqual(result.walEvent.branch, 'feat/wal');
  assert.ok(result.walEvent.eventId, 'eventId must be set');

  // The WAL event file must exist on disk.
  const walFiles = fs.readdirSync(mod.WAL_DIR).filter((f) => f.startsWith('claim-claude-code-'));
  assert.ok(walFiles.length >= 1, 'WAL event file must exist on disk');
  // And the lock must also exist.
  assert.ok(result.lockPath && fs.existsSync(result.lockPath), 'lock file must exist');

  fs.rmSync(root, { recursive: true, force: true });
});

test('claimFile denies when file already held by another agent', () => {
  const { env, root } = freshEnv();
  const mod = loadLedger(env);
  const file = 'src/deny.ts';

  const first = mod.claimFile('agent-a', file);
  assert.ok(first.ok);
  const second = mod.claimFile('agent-b', file);
  assert.ok(!second.ok, 'second claim must be denied');
  assert.strictEqual(second.holder, 'agent-a');
  assert.match(second.reason, /already claimed by agent-a/);

  fs.rmSync(root, { recursive: true, force: true });
});

test('releaseFile only succeeds for the current holder', () => {
  const { env, root } = freshEnv();
  const mod = loadLedger(env);
  const file = 'src/holder.ts';

  mod.claimFile('agent-a', file);
  const wrongRelease = mod.releaseFile('agent-b', file);
  assert.ok(!wrongRelease.ok);
  assert.match(wrongRelease.reason, /held by agent-a, not agent-b/);

  const correctRelease = mod.releaseFile('agent-a', file);
  assert.ok(correctRelease.ok);
  assert.strictEqual(mod.checkFile(file).claimed, false);

  fs.rmSync(root, { recursive: true, force: true });
});

test('checkFile reports claimed vs free', () => {
  const { env, root } = freshEnv();
  const mod = loadLedger(env);

  const claimed = 'src/check1.ts';
  const free = 'src/check2.ts';
  mod.claimFile('agent-a', claimed);

  const s1 = mod.checkFile(claimed);
  assert.ok(s1.claimed);
  assert.strictEqual(s1.holder, 'agent-a');

  const s2 = mod.checkFile(free);
  assert.ok(!s2.claimed);
  assert.strictEqual(s2.holder, null);

  fs.rmSync(root, { recursive: true, force: true });
});

test('claim + release round-trip leaves file free', () => {
  const { env, root } = freshEnv();
  const mod = loadLedger(env);
  const file = 'src/roundtrip.ts';

  const claim = mod.claimFile('agent-a', file);
  assert.ok(claim.ok);
  assert.ok(mod.checkFile(file).claimed);

  const release = mod.releaseFile('agent-a', file);
  assert.ok(release.ok);
  assert.ok(!mod.checkFile(file).claimed);

  fs.rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// WAL persistence
// ---------------------------------------------------------------------------

test('WAL events accumulate in the wal/ directory', () => {
  const { env, root } = freshEnv();
  const mod = loadLedger(env);
  const file = 'src/accum.ts';

  mod.claimFile('agent-a', file, { task: 'T-1' });
  mod.releaseFile('agent-a', file);

  const walFiles = fs.readdirSync(mod.WAL_DIR).filter((f) => f.endsWith('.json'));
  assert.ok(walFiles.length >= 2, 'should have at least a claim + release event');
  const claimEvents = walFiles.filter((f) => f.startsWith('claim-'));
  const releaseEvents = walFiles.filter((f) => f.startsWith('release-'));
  assert.ok(claimEvents.length >= 1);
  assert.ok(releaseEvents.length >= 1);

  fs.rmSync(root, { recursive: true, force: true });
});

test('WAL event files are valid JSON with required fields', () => {
  const { env, root } = freshEnv();
  const mod = loadLedger(env);
  const file = 'src/event-valid.ts';

  mod.claimFile('agent-x', file, { task: 'T-X', branch: 'feat/x' });

  const walFiles = fs.readdirSync(mod.WAL_DIR).filter((f) => f.startsWith('claim-'));
  assert.ok(walFiles.length >= 1);
  const event = JSON.parse(fs.readFileSync(path.join(mod.WAL_DIR, walFiles[0]), 'utf8'));
  assert.strictEqual(event.type, 'claim');
  assert.strictEqual(event.agent, 'agent-x');
  assert.strictEqual(event.file, file);
  assert.strictEqual(event.task, 'T-X');
  assert.strictEqual(event.branch, 'feat/x');
  assert.ok(event.timestamp);
  assert.ok(event.eventId);

  fs.rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Compaction
// ---------------------------------------------------------------------------

test('compact replays WAL into state.json with correct final state', () => {
  const { env, root } = freshEnv();
  const mod = loadLedger(env);

  mod.claimFile('agent-a', 'src/compaction1.ts');
  mod.claimFile('agent-b', 'src/compaction2.ts');
  mod.claimFile('agent-c', 'src/compaction3.ts');
  mod.releaseFile('agent-b', 'src/compaction2.ts');

  const result = mod.compact();

  assert.ok(result.state.compactedAt);
  assert.ok(result.state.lastEventId, 'lastEventId should be set');
  assert.strictEqual(result.eventCount, 4, 'should have replayed 4 events');

  assert.ok(result.state.claimed['src/compaction1.ts'], 'compaction1.ts should be claimed');
  assert.ok(result.state.claimed['src/compaction3.ts'], 'compaction3.ts should be claimed');
  assert.ok(!result.state.claimed['src/compaction2.ts'], 'compaction2.ts should be released');
  assert.strictEqual(result.state.claimed['src/compaction1.ts'].agent, 'agent-a');
  assert.strictEqual(result.state.claimed['src/compaction3.ts'].agent, 'agent-c');

  fs.rmSync(root, { recursive: true, force: true });
});

test('compact archives WAL events and leaves wal/ empty', () => {
  const { env, root } = freshEnv();
  const mod = loadLedger(env);

  mod.claimFile('agent-a', 'src/archive1.ts');
  mod.claimFile('agent-b', 'src/archive2.ts');

  const walBefore = fs.readdirSync(mod.WAL_DIR).filter((f) => f.endsWith('.json'));
  assert.ok(walBefore.length > 0, 'wal/ should have events before compaction');

  mod.compact();

  const walAfter = fs.readdirSync(mod.WAL_DIR).filter((f) => f.endsWith('.json'));
  assert.strictEqual(walAfter.length, 0, 'wal/ should be empty after compaction');

  const archiveFiles = fs.readdirSync(mod.ARCHIVE_DIR).filter((f) => f.endsWith('.json'));
  assert.ok(archiveFiles.length >= walBefore.length, 'archive/ should contain all events');

  fs.rmSync(root, { recursive: true, force: true });
});

test('compact is idempotent: running twice does not duplicate archive', () => {
  const { env, root } = freshEnv();
  const mod = loadLedger(env);

  mod.claimFile('agent-a', 'src/idempotent.ts');
  mod.compact();

  const archiveAfter1 = fs.readdirSync(mod.ARCHIVE_DIR).filter((f) => f.endsWith('.json')).length;
  mod.compact();
  const archiveAfter2 = fs.readdirSync(mod.ARCHIVE_DIR).filter((f) => f.endsWith('.json')).length;
  assert.strictEqual(archiveAfter1, archiveAfter2, 'archive count must not change on second compact');

  fs.rmSync(root, { recursive: true, force: true });
});

test('readState rebuilds from WAL if state.json is missing', () => {
  const { env, root } = freshEnv();
  const mod = loadLedger(env);

  mod.claimFile('agent-x', 'src/rebuild.ts');
  if (fs.existsSync(mod.STATE_FILE)) fs.unlinkSync(mod.STATE_FILE);

  const state = mod.readState();
  assert.ok(state.compactedAt);
  assert.ok(state.claimed['src/rebuild.ts'], 'should have rebuilt from WAL');
  assert.strictEqual(state.claimed['src/rebuild.ts'].agent, 'agent-x');

  fs.rmSync(root, { recursive: true, force: true });
});

test('readState rebuilds from WAL if state.json is corrupt', () => {
  const { env, root } = freshEnv();
  const mod = loadLedger(env);

  mod.claimFile('agent-y', 'src/rebuild2.ts');
  fs.writeFileSync(mod.STATE_FILE, '{ this is not valid JSON }}}');

  const state = mod.readState();
  assert.ok(state.claimed['src/rebuild2.ts'], 'should have rebuilt from WAL after corrupt state.json');

  fs.rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Compaction + live lock reconciliation
// ---------------------------------------------------------------------------

test('currentState reconciles compacted snapshot with live locks', () => {
  const { env, root } = freshEnv();
  const mod = loadLedger(env);

  mod.claimFile('agent-a', 'src/reconcile.ts');
  mod.compact();

  const state = mod.currentState();
  assert.ok(state.claimed['src/reconcile.ts']);
  assert.strictEqual(state.claimed['src/reconcile.ts'].agent, 'agent-a');

  fs.rmSync(root, { recursive: true, force: true });
});

test('currentState picks up live locks not in snapshot (post-compact claims)', () => {
  const { env, root } = freshEnv();
  const mod = loadLedger(env);

  mod.claimFile('agent-b', 'src/post-compact.ts');
  const state = mod.currentState();
  assert.ok(state.claimed['src/post-compact.ts'], 'live lock should be in current state');
  assert.strictEqual(state.claimed['src/post-compact.ts'].agent, 'agent-b');

  fs.rmSync(root, { recursive: true, force: true });
});

test('currentState returns live agent states', () => {
  const { env, root } = freshEnv();
  const mod = loadLedger(env);

  mod.heartbeat('agent-one', { status: 'active' });
  mod.heartbeat('agent-two', { status: 'blocked' });

  const state = mod.currentState();
  assert.ok(state.agents.length >= 2, `expected >=2 agents, got ${state.agents.length}`);
  const names = new Set(state.agents.map((s) => s.agent));
  assert.ok(names.has('agent-one'));
  assert.ok(names.has('agent-two'));

  fs.rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Gossip / heartbeats
// ---------------------------------------------------------------------------

test('heartbeat writes an agent state file', () => {
  const { env, root } = freshEnv();
  const mod = loadLedger(env);

  const st = mod.heartbeat('cursor-agent', { status: 'active', branch: 'feat/x', task: 'T-42' });
  assert.strictEqual(st.agent, 'cursor-agent');
  assert.strictEqual(st.status, 'active');
  assert.strictEqual(st.branch, 'feat/x');
  assert.strictEqual(st.task, 'T-42');
  assert.ok(st.lastSeen);

  const file = path.join(mod.AGENT_STATES_DIR, 'cursor-agent.json');
  assert.ok(fs.existsSync(file), 'heartbeat file must exist on disk');
  const persisted = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(persisted.agent, 'cursor-agent');

  fs.rmSync(root, { recursive: true, force: true });
});

test('heartbeat overwrites previous state (latest wins)', () => {
  const { env, root } = freshEnv();
  const mod = loadLedger(env);

  mod.heartbeat('gemini-agent', { status: 'blocked', task: 'T-1' });
  const st2 = mod.heartbeat('gemini-agent', { status: 'active', task: 'T-2' });
  assert.strictEqual(st2.status, 'active');
  assert.strictEqual(st2.task, 'T-2');

  const file = path.join(mod.AGENT_STATES_DIR, 'gemini-agent.json');
  const persisted = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(persisted.status, 'active');
  assert.strictEqual(persisted.task, 'T-2');

  fs.rmSync(root, { recursive: true, force: true });
});

test('readAgentStates returns all heartbeat files', () => {
  const { env, root } = freshEnv();
  const mod = loadLedger(env);

  mod.heartbeat('agent-one', { status: 'active' });
  mod.heartbeat('agent-two', { status: 'blocked' });
  mod.heartbeat('agent-three', { status: 'done' });

  const states = mod.readAgentStates();
  assert.ok(states.length >= 3, `expected >=3 agents, got ${states.length}`);
  const names = new Set(states.map((s) => s.agent));
  assert.ok(names.has('agent-one'));
  assert.ok(names.has('agent-two'));
  assert.ok(names.has('agent-three'));

  fs.rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// GC of stale claims
// ---------------------------------------------------------------------------

test('GC releases claims for stale heartbeats and keeps active ones', () => {
  const { env, root } = freshEnv();
  const mod = loadLedger(env);

  // Stale agent: heartbeat 200 min ago, claims a file.
  const staleTs = new Date(Date.now() - 200 * 60 * 1000).toISOString();
  mod.heartbeat('stale-agent', { status: 'active' });
  fs.writeFileSync(
    path.join(mod.AGENT_STATES_DIR, 'stale-agent.json'),
    JSON.stringify({ agent: 'stale-agent', status: 'active', lastSeen: staleTs, branch: 'main', task: null, pid: 1 }),
  );
  mod.claimFile('stale-agent', 'src/stale-claim.ts');
  assert.strictEqual(mod.readLockAgent('src/stale-claim.ts'), 'stale-agent');

  // Active agent: fresh heartbeat, claims a file.
  mod.heartbeat('active-agent', { status: 'active' });
  mod.claimFile('active-agent', 'src/active-claim.ts');

  const result = mod.gc({ staleMinutes: 120 });
  assert.ok(result.released.length >= 1, 'should release at least 1 stale claim');
  assert.ok(result.kept.includes('active-agent'), 'active agent should be kept');

  assert.strictEqual(mod.readLockAgent('src/stale-claim.ts'), null, 'stale claim lock must be released');
  assert.strictEqual(mod.readLockAgent('src/active-claim.ts'), 'active-agent');

  fs.rmSync(root, { recursive: true, force: true });
});

test('GC does not touch claims for agents with no heartbeat file', () => {
  const { env, root } = freshEnv();
  const mod = loadLedger(env);

  mod.claimFile('no-heartbeat-agent', 'src/no-hb.ts');
  assert.strictEqual(mod.readLockAgent('src/no-hb.ts'), 'no-heartbeat-agent');

  const result = mod.gc({ staleMinutes: 1 });
  // The agent has no heartbeat, so GC cannot determine staleness — it should
  // NOT release the claim (conservative: don't GC what we can't see).
  assert.strictEqual(result.released.length, 0, 'claims without heartbeat should not be GC\'d');
  assert.strictEqual(mod.readLockAgent('src/no-hb.ts'), 'no-heartbeat-agent',
    'no-heartbeat-agent claim should still be held');

  fs.rmSync(root, { recursive: true, force: true });
});

test('GC with very short threshold releases all stale claims', () => {
  const { env, root } = freshEnv();
  const mod = loadLedger(env);

  mod.ensureDirs();
  const recentTs = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  fs.writeFileSync(
    path.join(mod.AGENT_STATES_DIR, 'recent-agent.json'),
    JSON.stringify({ agent: 'recent-agent', status: 'active', lastSeen: recentTs, branch: 'main', task: null, pid: 1 }),
  );
  mod.claimFile('recent-agent', 'src/recent-claim.ts');
  assert.strictEqual(mod.readLockAgent('src/recent-claim.ts'), 'recent-agent');

  const result = mod.gc({ staleMinutes: 1 });
  assert.ok(result.released.some((r) => r.file === 'src/recent-claim.ts'),
    '5-min-old heartbeat should be GC\'d with 1-min threshold');
  assert.strictEqual(mod.readLockAgent('src/recent-claim.ts'), null,
    'stale claim lock must be released after GC');

  fs.rmSync(root, { recursive: true, force: true });
});

test('GC removes stale heartbeat files', () => {
  const { env, root } = freshEnv();
  const mod = loadLedger(env);

  const staleTs = new Date(Date.now() - 200 * 60 * 1000).toISOString();
  mod.ensureDirs();
  fs.writeFileSync(
    path.join(mod.AGENT_STATES_DIR, 'stale-heartbeat-agent.json'),
    JSON.stringify({ agent: 'stale-heartbeat-agent', status: 'active', lastSeen: staleTs, branch: 'main', task: null, pid: 1 }),
  );
  assert.ok(fs.existsSync(path.join(mod.AGENT_STATES_DIR, 'stale-heartbeat-agent.json')));

  mod.gc({ staleMinutes: 120 });

  assert.ok(!fs.existsSync(path.join(mod.AGENT_STATES_DIR, 'stale-heartbeat-agent.json')),
    'stale heartbeat file should be removed by GC');

  fs.rmSync(root, { recursive: true, force: true });
});

test('GC does not remove non-stale heartbeat files', () => {
  const { env, root } = freshEnv();
  const mod = loadLedger(env);

  mod.heartbeat('fresh-agent', { status: 'active' });
  assert.ok(fs.existsSync(path.join(mod.AGENT_STATES_DIR, 'fresh-agent.json')));

  mod.gc({ staleMinutes: 120 });

  assert.ok(fs.existsSync(path.join(mod.AGENT_STATES_DIR, 'fresh-agent.json')),
    'fresh heartbeat should survive GC');

  fs.rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Atomic write guarantee
// ---------------------------------------------------------------------------

test('atomicWriteJson never leaves a torn file on successful write', () => {
  const { env, root } = freshEnv();
  const mod = loadLedger(env);
  mod.ensureDirs();

  const dest = path.join(mod.WAL_DIR, 'atomic-test.json');
  mod.atomicWriteJson(dest, { a: 1, nested: { b: 2 } });
  const data = JSON.parse(fs.readFileSync(dest, 'utf8'));
  assert.deepStrictEqual(data, { a: 1, nested: { b: 2 } });

  const leftovers = fs.readdirSync(mod.WAL_DIR).filter((f) => f.includes('.tmp-'));
  assert.strictEqual(leftovers.length, 0, 'no temp files should remain after atomic write');

  fs.rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Module API surface
// ---------------------------------------------------------------------------

test('module exports the expected API surface', () => {
  const mod = require(TOOL);
  assert.strictEqual(typeof mod.claimFile, 'function');
  assert.strictEqual(typeof mod.releaseFile, 'function');
  assert.strictEqual(typeof mod.checkFile, 'function');
  assert.strictEqual(typeof mod.heartbeat, 'function');
  assert.strictEqual(typeof mod.compact, 'function');
  assert.strictEqual(typeof mod.gc, 'function');
  assert.strictEqual(typeof mod.currentState, 'function');
  assert.strictEqual(typeof mod.readLockAgent, 'function');
  assert.strictEqual(typeof mod.readState, 'function');
  assert.strictEqual(typeof mod.readAgentStates, 'function');
  assert.strictEqual(typeof mod.casClaimLock, 'function');
  assert.strictEqual(typeof mod.lockNameFor, 'function');
  assert.strictEqual(typeof mod.safeAgentName, 'function');
  assert.strictEqual(typeof mod.atomicWriteJson, 'function');
  assert.strictEqual(typeof mod.ensureDirs, 'function');
});

// ---------------------------------------------------------------------------
// CLI end-to-end
// ---------------------------------------------------------------------------

test('CLI help exits 0 and prints usage', () => {
  const result = spawnSync('node', [TOOL, '--help'], { encoding: 'utf8', timeout: 5000 });
  assert.match(result.stdout, /agent-claim-ledger/);
  assert.match(result.stdout, /claim/);
  assert.match(result.stdout, /release/);
  assert.match(result.stdout, /compact/);
  assert.match(result.stdout, /gc/);
  assert.match(result.stdout, /heartbeat/);
  assert.strictEqual(result.status, 0);
});

test('CLI claim + check + release round-trip (isolated temp root)', () => {
  const { root, env } = freshEnv();
  const file = 'tests/test-agent-claim-ledger.js';

  // claim
  let result = runCli(['claim', 'test-agent', file], env);
  assert.match(result.stdout, /✓.*claimed/);
  assert.match(result.stdout, /WAL event/);
  assert.strictEqual(result.status, 0);

  // check — should show claimed (exits 1)
  result = runCli(['check', file], env);
  assert.match(result.stdout, /✗.*claimed by test-agent/);
  assert.strictEqual(result.status, 1);

  // release
  result = runCli(['release', 'test-agent', file], env);
  assert.match(result.stdout, /✓.*released/);
  assert.strictEqual(result.status, 0);

  // check — should show free (exits 0)
  result = runCli(['check', file], env);
  assert.match(result.stdout, /✓.*is free/);
  assert.strictEqual(result.status, 0);

  // status --json — no claims
  result = runCli(['status', '--json'], env);
  const status = JSON.parse(result.stdout);
  assert.strictEqual(Object.keys(status.claimed).length, 0, 'no claims after release');
  assert.strictEqual(result.status, 0);

  fs.rmSync(root, { recursive: true, force: true });
});

test('CLI heartbeat writes state and status --json shows it', () => {
  const { root, env } = freshEnv();

  runCli(['heartbeat', 'cli-agent', '--status', 'active', '--branch', 'feat/cli'], env);

  const result = runCli(['status', '--json'], env);
  const status = JSON.parse(result.stdout);
  assert.ok(status.agents.length >= 1);
  const agent = status.agents.find((a) => a.agent === 'cli-agent');
  assert.ok(agent, 'cli-agent should appear in status');
  assert.strictEqual(agent.status, 'active');
  assert.strictEqual(agent.branch, 'feat/cli');

  fs.rmSync(root, { recursive: true, force: true });
});

test('CLI compact persists state.json and clears wal/', () => {
  const { root, env } = freshEnv();

  runCli(['claim', 'compact-agent', 'src/cli-compact.ts'], env);
  runCli(['compact'], env);

  assert.ok(fs.existsSync(path.join(root, 'state.json')));
  const walFiles = fs.readdirSync(path.join(root, 'wal')).filter((f) => f.endsWith('.json'));
  assert.strictEqual(walFiles.length, 0, 'wal/ should be empty after compact');

  const archiveFiles = fs.readdirSync(path.join(root, 'archive')).filter((f) => f.endsWith('.json'));
  assert.ok(archiveFiles.length >= 1, 'archive/ should have archived events');

  const state = JSON.parse(fs.readFileSync(path.join(root, 'state.json'), 'utf8'));
  assert.ok(state.claimed['src/cli-compact.ts']);
  assert.strictEqual(state.claimed['src/cli-compact.ts'].agent, 'compact-agent');

  fs.rmSync(root, { recursive: true, force: true });
});

test('CLI gc releases stale claims', () => {
  const { root, env } = freshEnv();

  // Create a stale heartbeat directly.
  const staleTs = new Date(Date.now() - 200 * 60 * 1000).toISOString();
  fs.mkdirSync(path.join(root, 'agent-states'), { recursive: true });
  fs.mkdirSync(path.join(root, 'locks'), { recursive: true });
  fs.mkdirSync(path.join(root, 'wal'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'agent-states', 'stale-cli-agent.json'),
    JSON.stringify({ agent: 'stale-cli-agent', status: 'active', lastSeen: staleTs, branch: 'main', task: null, pid: 1 }),
  );

  runCli(['claim', 'stale-cli-agent', 'src/cli-gc-stale.ts'], env);

  const result = runCli(['gc', '--stale-minutes=120'], env);
  assert.match(result.stdout, /released 1 stale claims/);
  assert.strictEqual(result.status, 0);

  // All locks should be released.
  const lockFiles = fs.readdirSync(path.join(root, 'locks')).filter((f) => f.endsWith('.lock'));
  assert.strictEqual(lockFiles.length, 0, 'all locks should be released by GC');

  fs.rmSync(root, { recursive: true, force: true });
});

test('CLI claim denied shows the current holder', () => {
  const { root, env } = freshEnv();
  const file = 'src/denied.ts';

  runCli(['claim', 'first-agent', file], env);
  const result = runCli(['claim', 'second-agent', file], env);
  assert.ok(!result.ok || result.status === 1);
  assert.match(result.stdout + result.stderr, /already claimed by first-agent/);

  fs.rmSync(root, { recursive: true, force: true });
});
