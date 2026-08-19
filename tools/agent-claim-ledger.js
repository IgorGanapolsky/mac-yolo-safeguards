#!/usr/bin/env node
'use strict';

/**
 * agent-claim-ledger.js — WAL-backed, CAS-guaranteed multi-agent file-claim ledger.
 *
 * Maps Cursor's "Git at any scale" *Continuity* patterns to ThumbGate.app's agent-fleet
 * coordination layer. The repo coordinates ~66 concurrent agents via plan.md §2
 * (File Ownership Map), but those claims are advisory — two agents can race on the
 * same file with no atomic guard, merge conflicts still fire despite `merge=union`,
 * and there is no real-time agent state or GC of stale claims.
 *
 * This tool replaces that fragile ad-hoc system with five Continuity primitives:
 *
 *   1.  WAL-as-truth        — every claim/release is an append-only event file that is
 *                             persisted BEFORE the claim is acknowledged as active.
 *                             (Mirrors: "We never acknowledge a push until it has been
 *                             fully persisted to the WAL.")
 *
 *   2.  CAS consensus        — atomic claim via `fs.open(lock, 'wx')` (O_EXCL). If the
 *                             lock already exists, the CAS fails and the second agent
 *                             is denied. No central coordinator, no 3PC quorum.
 *                             (Mirrors: "All updates to the WAL are synchronized with
 *                             an atomic compare-and-swap operation.")
 *
 *   3.  Gossip replication   — each agent writes a heartbeat to agent-states/<id>.json
 *                             via atomic rename. Other agents read these for real-time
 *                             fleet visibility. Reads against lock files are fully
 *                             consistent; heartbeats are best-effort gossip.
 *                             (Mirrors: "optimistic replication by sending gossip…")
 *
 *   4.  Compaction           — replay the WAL into a compacted state.json snapshot,
 *                             then archive old event files. Only the primary performer
 *                             compacts; replicas catch up from the snapshot.
 *                             (Mirrors: "Only the primary does compactions…")
 *
 *   5.  GC of idle resources — expire claims held by agents whose heartbeat is older
 *                             than --stale-minutes, releasing their locks.
 *                             (Mirrors: "when a replica hasn't received traffic for a
 *                             while, we garbage collect it from the node's disk…")
 *
 * Layout (under REPO/coordination/claims/):
 *   wal/                            # append-only event files
 *     claim-<agent>-<ts>-<seq>.json
 *     release-<agent>-<ts>-<seq>.json
 *   locks/                          # one lock file per claimed path (CAS surface)
 *     <sha1(file-path)>.lock
 *   state.json                      # compacted projection of the WAL
 *   archive/                        # old WAL entries after compaction
 *   agent-states/                   # gossip heartbeats
 *     <agent-id>.json
 *
 * Usage:
 *   node tools/agent-claim-ledger.js claim <agent> <file> [--task T-XXX] [--branch BRANCH]
 *   node tools/agent-claim-ledger.js release <agent> <file>
 *   node tools/agent-claim-ledger.js check <file>
 *   node tools/agent-claim-ledger.js heartbeat <agent> [--status active|blocked|done] [--branch BRANCH] [--task T-XXX] [--pid PID]
 *   node tools/agent-claim-ledger.js status [--json]
 *   node tools/agent-claim-ledger.js compact
 *   node tools/agent-claim-ledger.js gc --stale-minutes=N
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..');
const CLAIM_ROOT = process.env.CLAIM_LEDGER_ROOT || path.join(REPO, 'coordination', 'claims');
const WAL_DIR = path.join(CLAIM_ROOT, 'wal');
const LOCK_DIR = path.join(CLAIM_ROOT, 'locks');
const STATE_FILE = path.join(CLAIM_ROOT, 'state.json');
const ARCHIVE_DIR = path.join(CLAIM_ROOT, 'archive');
const AGENT_STATES_DIR = path.join(CLAIM_ROOT, 'agent-states');

const DEFAULT_STALE_MINUTES = 120;

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

/** Ensure base directories exist. Idempotent. */
function ensureDirs() {
  for (const dir of [WAL_DIR, LOCK_DIR, ARCHIVE_DIR, AGENT_STATES_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** SHA-1 of a file path — stable, collision-resistant for the lock filename. */
function lockNameFor(filePath) {
  return crypto.createHash('sha1').update(filePath, 'utf8').digest('hex') + '.lock';
}

/** Sanitise an agent id into a safe filename. */
function safeAgentName(agent) {
  return String(agent).replace(/[^A-Za-z0-9._-]/g, '_');
}

/** Monotonic-ish event id: timestamp + random suffix. Used only for WAL filenames. */
function eventId() {
  return Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex');
}

/** Atomic write-then-rename for a JSON payload (crash-safe / no torn writes). */
function atomicWriteJson(filePath, obj) {
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', { flag: 'wx' });
  fs.renameSync(tmp, filePath);
}

/**
 * CAS claim: try to create the lock file exclusively.
 * Returns the lock path on success, null if already held by someone else.
 */
function casClaimLock(file, agent) {
  ensureDirs();
  const lockPath = path.join(LOCK_DIR, lockNameFor(file));
  try {
    fs.writeFileSync(lockPath, JSON.stringify({ file, agent, acquiredAt: new Date().toISOString() }, null, 2) + '\n', { flag: 'wx' });
    return lockPath;
  } catch (err) {
    if (err.code === 'EEXIST') return null;
    throw err;
  }
}

/** Release the CAS lock for a file. Returns true if a lock existed, false otherwise. */
function releaseLock(file) {
  const lockPath = path.join(LOCK_DIR, lockNameFor(file));
  try {
    fs.unlinkSync(lockPath);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EBUSY') return false;
    throw err;
  }
}

/** Read the agent field from an existing lock, or null if no lock. */
function readLockAgent(file) {
  const lockPath = path.join(LOCK_DIR, lockNameFor(file));
  try {
    const data = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    return data.agent || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// WAL event log
// ---------------------------------------------------------------------------

/** Append a claim event to the WAL. Persisted BEFORE the lock (CAS) is acquired
 *  so the audit trail always exists — mirrors "never acknowledge a push until
 *  it has been fully persisted to the WAL". */
function appendClaimEvent(agent, file, opts = {}) {
  ensureDirs();
  const ev = {
    type: 'claim',
    agent,
    file,
    task: opts.task || null,
    branch: opts.branch || currentGitBranch(),
    timestamp: new Date().toISOString(),
    eventId: eventId(),
  };
  const fname = `claim-${safeAgentName(agent)}-${ev.timestamp.replace(/[-:T]/g, '')}-${ev.eventId}.json`;
  const walPath = path.join(WAL_DIR, fname);
  atomicWriteJson(walPath, ev);
  return ev;
}

/** Append a release event to the WAL. */
function appendReleaseEvent(agent, file) {
  ensureDirs();
  const ev = {
    type: 'release',
    agent,
    file,
    timestamp: new Date().toISOString(),
    eventId: eventId(),
  };
  const fname = `release-${safeAgentName(agent)}-${ev.timestamp.replace(/[-:T]/g, '')}-${ev.eventId}.json`;
  const walPath = path.join(WAL_DIR, fname);
  atomicWriteJson(walPath, ev);
  return ev;
}

function currentGitBranch() {
  try {
    return execFileSync('git', ['-C', REPO, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    }).trim() || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Atomically claim a file for an agent.
 *
 * Returns {ok, claimed, reason} — mirrors the blog's "always correct when
 * degraded, always fast when healthy" design.
 */
function claimFile(agent, file, opts = {}) {
  // 1. Persist the WAL event FIRST (WAL-as-truth).
  const walEvent = appendClaimEvent(agent, file, opts);

  // 2. CAS: try to create the lock exclusively.
  const lockPath = casClaimLock(file, agent);
  if (lockPath === null) {
    // Another agent already holds the lock. The claim event is in the WAL
    // (audit trail), but the claim is NOT active. The caller should see the
    // current holder so it can STOP rather than diverge (AGENTS.md rule).
    const holder = readLockAgent(file);
    return {
      ok: false,
      claimed: false,
      reason: `file ${file} is already claimed by ${holder || 'another agent'}`,
      holder,
      walEvent,
    };
  }

  return {
    ok: true,
    claimed: true,
    lockPath,
    walEvent,
  };
}

/**
 * Release a file claim for an agent.
 * Only the current holder can release; others get a denial.
 */
function releaseFile(agent, file) {
  const holder = readLockAgent(file);
  if (holder !== agent) {
    return {
      ok: false,
      released: false,
      reason: holder
        ? `file ${file} is held by ${holder}, not ${agent}`
        : `file ${file} is not claimed`,
    };
  }

  // 1. Persist release event to WAL first.
  const walEvent = appendReleaseEvent(agent, file);

  // 2. CAS: remove the lock.
  releaseLock(file);

  return { ok: true, released: true, walEvent };
}

/** Check whether a file is currently claimed. Returns the holder or null. */
function checkFile(file) {
  const holder = readLockAgent(file);
  return holder ? { claimed: true, holder } : { claimed: false, holder: null };
}

// ---------------------------------------------------------------------------
// Gossip: agent heartbeats
// ---------------------------------------------------------------------------

/**
 * Write/refresh an agent's heartbeat. Atomic rename ensures readers never see
 * a torn file — mirrors the blog's conditional-GET consistency model.
 */
function heartbeat(agent, opts = {}) {
  ensureDirs();
  const state = {
    agent,
    status: opts.status || 'active',
    lastSeen: new Date().toISOString(),
    branch: opts.branch || currentGitBranch(),
    task: opts.task || null,
    pid: opts.pid || process.pid,
  };
  const dest = path.join(AGENT_STATES_DIR, safeAgentName(agent) + '.json');
  atomicWriteJson(dest, state);
  return state;
}

/** Read all agent heartbeats. Returns array of state objects. */
function readAgentStates() {
  if (!fs.existsSync(AGENT_STATES_DIR)) return [];
  return fs.readdirSync(AGENT_STATES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(AGENT_STATES_DIR, f), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Compaction
// ---------------------------------------------------------------------------

/**
 * Replay all WAL events (in order) to produce a compacted state.json.
 * Then archive the consumed event files. Mirrors "Only the primary does
 * compactions, and the result applies to both the on-disk repository and the WAL."
 */
function compact() {
  ensureDirs();

  // Read every WAL event, sorted by filename (which encodes timestamp + eventId
  // for deterministic ordering — equivalent to log sequence number).
  const events = fs.readdirSync(WAL_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(WAL_DIR, f), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  // Replay: claim adds, release removes.
  const claimed = {};
  let lastEventId = null;
  for (const ev of events) {
    lastEventId = ev.eventId;
    if (ev.type === 'claim') {
      claimed[ev.file] = {
        agent: ev.agent,
        task: ev.task,
        branch: ev.branch,
        claimedAt: ev.timestamp,
        eventId: ev.eventId,
      };
    } else if (ev.type === 'release') {
      delete claimed[ev.file];
    }
  }

  const state = {
    claimed,
    compactedAt: new Date().toISOString(),
    lastEventId,
    eventCount: events.length,
  };

  atomicWriteJson(STATE_FILE, state);

  // Archive consumed WAL events (move, don't delete — provenance is sacred,
  // mirrors "We can look at every state a repository has ever been in.").
  for (const fname of fs.readdirSync(WAL_DIR).filter((f) => f.endsWith('.json'))) {
    const src = path.join(WAL_DIR, fname);
    const dst = path.join(ARCHIVE_DIR, fname);
    // Don't overwrite if an archive copy already exists (idempotent replay).
    if (!fs.existsSync(dst)) {
      fs.renameSync(src, dst);
    } else {
      fs.unlinkSync(src);
    }
  }

  return { eventCount: events.length, claimedCount: Object.keys(claimed).length, state };
}

/**
 * Read the compacted state, recomputing from WAL if state.json is missing
 * or stale. Mirrors "stateless… materialize from WAL on demand."
 */
function readState() {
  if (fs.existsSync(STATE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch {
      // Corrupt — fall through to rebuild from WAL.
    }
  }
  return compact().state;
}

/**
 * Merge live lock state with the compacted snapshot. The lock files on disk
 * are the source of truth (WAL-as-truth); state.json is a warm cache.
 */
function currentState() {
  const snapshot = readState();
  const claimed = {};

  // Start with compacted claims, then reconcile against live locks.
  for (const [file, info] of Object.entries(snapshot.claimed || {})) {
    const holder = readLockAgent(file);
    if (holder === info.agent) {
      claimed[file] = info;
    } else if (holder) {
      // Lock exists but holder differs from snapshot — live lock wins.
      claimed[file] = { ...info, agent: holder };
    }
    // If holder is null and snapshot says claimed, the lock was GC'd or
    // manually removed — treat as unclaimed.
  }

  // Also pick up live locks not in the snapshot (events written since last
  // compaction — mirrors "replicas catch up directly from the WAL").
  if (fs.existsSync(LOCK_DIR)) {
    for (const fname of fs.readdirSync(LOCK_DIR).filter((f) => f.endsWith('.lock'))) {
      try {
        const lock = JSON.parse(fs.readFileSync(path.join(LOCK_DIR, fname), 'utf8'));
        if (lock.file && !claimed[lock.file]) {
          claimed[lock.file] = {
            agent: lock.agent,
            task: null,
            branch: null,
            claimedAt: lock.acquiredAt,
            eventId: null,
          };
        }
      } catch {
        // Ignore corrupt lock files.
      }
    }
  }

  return { claimed, snapshot, agents: readAgentStates() };
}

// ---------------------------------------------------------------------------
// GC: expire stale claims
// ---------------------------------------------------------------------------

/**
 * Garbage-collect claims held by agents whose heartbeat is older than
 * --stale-minutes. Mirrors "idle repository doesn't even need a replica:
 * when a replica hasn't received traffic for a while, we GC it from disk."
 *
 * Uses currentState() (not readState()) so claims written to the WAL but not
 * yet compacted are still found — the live lock files are the source of truth.
 */
function gc(options = {}) {
  const staleMinutes = options.staleMinutes || DEFAULT_STALE_MINUTES;
  const staleThreshold = Date.now() - staleMinutes * 60 * 1000;

  const states = readAgentStates();
  const released = [];
  const kept = [];

  for (const state of states) {
    const lastSeen = Date.parse(state.lastSeen);
    if (Number.isNaN(lastSeen) || lastSeen < staleThreshold) {
      // Agent is stale — release its claims. Use currentState() so we see
      // live locks even if compaction hasn't run since the claim was made.
      const snapshot = currentState();
      for (const [file, info] of Object.entries(snapshot.claimed || {})) {
        if (info.agent === state.agent) {
          const rel = releaseFile(state.agent, file);
          released.push({ file, agent: state.agent, ...rel });
        }
      }
      // Remove stale heartbeat.
      try {
        fs.unlinkSync(path.join(AGENT_STATES_DIR, safeAgentName(state.agent) + '.json'));
      } catch {
        // Already gone.
      }
    } else {
      kept.push(state.agent);
    }
  }

  return { released, kept, staleMinutes };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
    else if (arg === '--task') {
      args.task = argv[++i];
    } else if (arg === '--branch') {
      args.branch = argv[++i];
    } else if (arg === '--status') {
      args.status = argv[++i];
    } else if (arg === '--stale-minutes') {
      args.staleMinutes = Number(argv[++i]);
    } else if (arg === '--pid') {
      args.pid = Number(argv[++i]);
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      args._.push(arg);
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || args._.length === 0) {
    console.log(`agent-claim-ledger — WAL-backed CAS file-claim ledger

Usage:
  claim <agent> <file> [--task T-XXX] [--branch BRANCH]
    Atomically claim a file. Fails if another agent already holds it.
  release <agent> <file>
    Release a file claim (only the current holder succeeds).
  check <file>
    Check if a file is currently claimed.
  heartbeat <agent> [--status active|blocked|done] [--branch BRANCH] [--task T-XXX] [--pid PID]
    Write/refresh agent state (gossip replication).
  status [--json]
    Print current compacted state + live locks + active agents.
  compact
    Replay WAL → state.json snapshot, archive consumed events.
  gc --stale-minutes=N
    Expire claims held by agents whose heartbeat is older than N minutes (default ${DEFAULT_STALE_MINUTES}).

Layout: coordination/claims/  (wal/, locks/, state.json, archive/, agent-states/)
`);
    process.exit(0);
  }

  const cmd = args._[0];

  switch (cmd) {
    case 'claim': {
      const [agent, file] = args._.slice(1);
      if (!agent || !file) {
        console.error('✗ usage: claim <agent> <file>');
        process.exit(2);
      }
      const result = claimFile(agent, file, { task: args.task, branch: args.branch });
      if (result.ok) {
        console.log(`✓ ${agent} claimed ${file} (WAL event ${result.walEvent.eventId})`);
        process.exit(0);
      }
      console.error(`✗ claim denied: ${result.reason}`);
      if (args.json) console.log(JSON.stringify(result, null, 2));
      process.exit(1);
    }

    case 'release': {
      const [agent, file] = args._.slice(1);
      if (!agent || !file) {
        console.error('✗ usage: release <agent> <file>');
        process.exit(2);
      }
      const result = releaseFile(agent, file);
      if (result.ok) {
        console.log(`✓ ${agent} released ${file} (WAL event ${result.walEvent.eventId})`);
        process.exit(0);
      }
      console.error(`✗ release denied: ${result.reason}`);
      process.exit(1);
    }

    case 'check': {
      const [file] = args._.slice(1);
      if (!file) {
        console.error('✗ usage: check <file>');
        process.exit(2);
      }
      const result = checkFile(file);
      if (result.claimed) {
        console.log(`✗ ${file} is claimed by ${result.holder}`);
        process.exit(1);
      }
      console.log(`✓ ${file} is free`);
      process.exit(0);
    }

    case 'heartbeat': {
      const agent = args._[1];
      if (!agent) {
        console.error('✗ usage: heartbeat <agent> [--status ...] [--branch ...] [--task ...]');
        process.exit(2);
      }
      const state = heartbeat(agent, { status: args.status, branch: args.branch, task: args.task, pid: args.pid });
      console.log(`✓ heartbeat: ${agent} → ${state.status} (last seen ${state.lastSeen})`);
      if (args.json) console.log(JSON.stringify(state, null, 2));
      process.exit(0);
    }

    case 'status': {
      const state = currentState();
      if (args.json) {
        console.log(JSON.stringify(state, null, 2));
      } else {
        console.log('=== Agent Claim Ledger ===');
        console.log(`Compacted at: ${state.snapshot.compactedAt || '(not yet compacted)'}`);
        console.log(`Events in snapshot: ${state.snapshot.eventCount || 0}`);
        const claimCount = Object.keys(state.claimed).length;
        console.log(`Active claims: ${claimCount}`);
        for (const [file, info] of Object.entries(state.claimed)) {
          console.log(`  ${file} → ${info.agent} (${info.task || 'no task'})`);
        }
        console.log(`Active agents: ${state.agents.length}`);
        for (const a of state.agents) {
          console.log(`  ${a.agent} — ${a.status} (last seen ${a.lastSeen})`);
        }
      }
      process.exit(0);
    }

    case 'compact': {
      const result = compact();
      console.log(`✓ compacted ${result.eventCount} WAL events → ${result.claimedCount} active claims`);
      process.exit(0);
    }

    case 'gc': {
      const result = gc({ staleMinutes: args.staleMinutes });
      console.log(`✓ GC: released ${result.released.length} stale claims, kept ${result.kept.length} active agents (threshold: ${result.staleMinutes}m)`);
      if (args.json) console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    }

    default:
      console.error(`✗ unknown command: ${cmd}`);
      process.exit(2);
  }
}

module.exports = {
  claimFile,
  releaseFile,
  checkFile,
  heartbeat,
  readAgentStates,
  compact,
  readState,
  currentState,
  gc,
  casClaimLock,
  releaseLock,
  readLockAgent,
  appendClaimEvent,
  appendReleaseEvent,
  eventId,
  lockNameFor,
  safeAgentName,
  atomicWriteJson,
  ensureDirs,
  CLAIM_ROOT,
  WAL_DIR,
  LOCK_DIR,
  STATE_FILE,
  ARCHIVE_DIR,
  AGENT_STATES_DIR,
  DEFAULT_STALE_MINUTES,
};

if (require.main === module) {
  main();
}
