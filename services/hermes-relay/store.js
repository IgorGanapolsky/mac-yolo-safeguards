'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PAIR_TTL_MS = 15 * 60 * 1000;
const EVENT_TTL_MS = 24 * 60 * 60 * 1000;
// A worker counts as live only if it heartbeat within this window (~15-25s cadence),
// so a slept/dead Mac flips to 'offline' instead of a sticky false-green.
const STALE_WORKER_MS = 60 * 1000;
// Typed pair code: FAR stronger than the old 16-word^2 = 256-value space
// (brute-forceable -> token theft -> agent RCE once chat ships). 8 chars over a
// 30-symbol unambiguous alphabet ~= 2^39, plus a 256-bit QR secret + rate limiting.
const PAIR_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'; // no 0/1/I/L/O/U
const PAIR_CODE_LEN = 8;

function randomId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function randomToken() {
  return crypto.randomBytes(24).toString('hex');
}

// 256-bit secret embedded in the pairing QR — the real cross-user isolation boundary.
function randomPairSecret() {
  return crypto.randomBytes(32).toString('hex');
}

// Dash- and case-insensitive canonical form so "ab2c-def3" == "AB2CDEF3".
function canonicalizeCode(input) {
  return String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function isWorkerFresh(worker, now = Date.now()) {
  return (
    !!worker &&
    typeof worker.last_seen_at === 'number' &&
    now - worker.last_seen_at <= STALE_WORKER_MS
  );
}

function slugify(input) {
  return String(input || 'worker')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'worker';
}

function generatePairCode(existingCodes) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    let raw = '';
    for (let i = 0; i < PAIR_CODE_LEN; i += 1) {
      raw += PAIR_CODE_ALPHABET[crypto.randomInt(PAIR_CODE_ALPHABET.length)];
    }
    const code = `${raw.slice(0, 4)}-${raw.slice(4)}`;
    if (!existingCodes.has(code)) {
      return code;
    }
  }
  const raw = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}

class RelayStore {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.state = {
      accounts: {},
      workers: {},
      pairCodes: {},
      events: {},
      verdicts: {},
    };
    this.load();
  }

  load() {
    if (!this.dbPath || !fs.existsSync(this.dbPath)) {
      return;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
      this.state = {
        accounts: parsed.accounts ?? {},
        workers: parsed.workers ?? {},
        pairCodes: parsed.pairCodes ?? {},
        events: parsed.events ?? {},
        verdicts: parsed.verdicts ?? {},
      };
    } catch {
      // Start fresh on corrupt state.
    }
  }

  persist() {
    if (!this.dbPath) {
      return;
    }
    const dir = path.dirname(this.dbPath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${this.dbPath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2));
    fs.renameSync(tmp, this.dbPath);
  }

  pruneExpired(now = Date.now()) {
    let changed = false;
    for (const [code, pair] of Object.entries(this.state.pairCodes)) {
      if (pair.expires_at <= now) {
        delete this.state.pairCodes[code];
        changed = true;
      }
    }
    for (const [id, event] of Object.entries(this.state.events)) {
      if (event.enqueued_at + EVENT_TTL_MS <= now && event.status !== 'pending') {
        delete this.state.events[id];
        changed = true;
      }
    }
    if (changed) {
      this.persist();
    }
  }

  registerWorker(input) {
    const now = Date.now();
    const existingToken = String(input.worker_token || '').trim();
    if (existingToken && this.state.workers[existingToken]) {
      const worker = this.state.workers[existingToken];
      worker.hostname = input.hostname || worker.hostname;
      worker.project = input.project || worker.project;
      worker.label = input.label || worker.label;
      worker.status = input.status || 'online';
      worker.last_seen_at = now;
      worker.gateway_ok = input.gateway_ok !== false;
      this.persist();
      return {
        worker_id: worker.id,
        worker_token: existingToken,
        machine_id: worker.machine_id,
        account_id: worker.account_id,
      };
    }

    const accountId = randomId('acct');
    const workerToken = randomToken();
    const machineId = String(input.machine_id || input.hostname || 'mac').trim();
    const workerId = slugify(machineId);
    const worker = {
      id: workerId,
      machine_id: machineId,
      account_id: accountId,
      hostname: input.hostname || machineId,
      project: input.project || '',
      label: input.label || '',
      repo: input.repo || '',
      status: 'online',
      last_seen_at: now,
      gateway_ok: input.gateway_ok !== false,
      capabilities: ['leash'],
    };
    this.state.workers[workerToken] = worker;
    this.state.accounts[accountId] = {
      id: accountId,
      mobile_token: null,
      worker_tokens: [workerToken],
      active_worker_id: workerId,
      created_at: now,
    };
    this.persist();
    return {
      worker_id: workerId,
      worker_token: workerToken,
      machine_id: machineId,
      account_id: accountId,
    };
  }

  heartbeatWorker(workerToken, patch) {
    const worker = this.state.workers[workerToken];
    if (!worker) {
      return null;
    }
    worker.last_seen_at = Date.now();
    if (patch.hostname) worker.hostname = patch.hostname;
    if (patch.project) worker.project = patch.project;
    if (patch.label) worker.label = patch.label;
    if (patch.status) worker.status = patch.status;
    if (typeof patch.gateway_ok === 'boolean') worker.gateway_ok = patch.gateway_ok;
    this.persist();
    return worker;
  }

  startPairing(workerToken) {
    const worker = this.state.workers[workerToken];
    if (!worker) {
      return null;
    }
    const now = Date.now();
    const existingCodes = new Set(Object.keys(this.state.pairCodes));
    const code = generatePairCode(existingCodes);
    const secret = randomPairSecret();
    this.state.pairCodes[code] = {
      code,
      secret,
      account_id: worker.account_id,
      worker_id: worker.id,
      created_at: now,
      expires_at: now + PAIR_TTL_MS,
    };
    this.persist();
    return { code, secret, expires_at: this.state.pairCodes[code].expires_at };
  }

  completePairing(credential) {
    const now = Date.now();
    const raw = String(credential || '').trim();
    if (!raw) {
      return null;
    }
    let matchKey = null;
    // 1) High-entropy QR secret — the real isolation boundary.
    for (const [key, pair] of Object.entries(this.state.pairCodes)) {
      if (pair.secret && pair.secret === raw) {
        matchKey = key;
        break;
      }
    }
    // 2) Typed human-code fallback (dash- and case-insensitive).
    if (!matchKey) {
      const canon = canonicalizeCode(raw);
      for (const [key, pair] of Object.entries(this.state.pairCodes)) {
        if (canonicalizeCode(pair.code) === canon) {
          matchKey = key;
          break;
        }
      }
    }
    if (!matchKey) {
      return null;
    }
    const pair = this.state.pairCodes[matchKey];
    if (!pair || pair.expires_at <= now) {
      delete this.state.pairCodes[matchKey];
      this.persist();
      return null;
    }
    const account = this.state.accounts[pair.account_id];
    if (!account) {
      return null;
    }
    // Rotate the mobile token on every successful pairing — never silently reuse a
    // stable token across re-pairs, so a stale/stolen token can't survive a re-pair.
    const mobileToken = randomToken();
    account.mobile_token = mobileToken;
    account.active_worker_id = pair.worker_id;
    delete this.state.pairCodes[matchKey];
    this.persist();
    return { mobile_token: mobileToken, account_id: account.id };
  }

  findAccountByMobileToken(mobileToken) {
    for (const account of Object.values(this.state.accounts)) {
      if (account.mobile_token === mobileToken) {
        return account;
      }
    }
    return null;
  }

  listWorkersForAccount(account, now = Date.now()) {
    return account.worker_tokens
      .map((token) => this.state.workers[token])
      .filter(Boolean)
      .map((worker) => ({
        id: worker.id,
        machine_id: worker.machine_id,
        hostname: worker.hostname,
        project: worker.project,
        label: worker.label,
        repo: worker.repo,
        // Computed from heartbeat freshness, not the sticky stored value (no false green).
        status: isWorkerFresh(worker, now) ? 'online' : 'offline',
        online: isWorkerFresh(worker, now),
        last_seen_at: worker.last_seen_at,
        capabilities: worker.capabilities,
      }));
  }

  // Active worker id, but only if it is actually live; a stale worker returns null
  // so the app gates "Send" on a fresh worker, not a sticky pointer.
  activeWorkerId(account, now = Date.now()) {
    const id = account.active_worker_id;
    if (!id) {
      return null;
    }
    for (const token of account.worker_tokens) {
      const worker = this.state.workers[token];
      if (worker && worker.id === id) {
        return isWorkerFresh(worker, now) ? id : null;
      }
    }
    return null;
  }

  listPendingEvents(accountId) {
    return Object.values(this.state.events).filter(
      (event) => event.account_id === accountId && event.status === 'pending',
    );
  }

  enqueueEvent(workerToken, payload) {
    const worker = this.state.workers[workerToken];
    if (!worker) {
      return null;
    }
    const now = Date.now();
    const eventId = String(payload.id || randomId('evt')).trim();
    const event = {
      id: eventId,
      account_id: worker.account_id,
      worker_id: worker.id,
      event: payload.event || {},
      reason: payload.reason,
      source: payload.source || 'relay_hook',
      enqueued_at: now,
      status: 'pending',
    };
    this.state.events[eventId] = event;
    this.persist();
    return event;
  }

  submitVerdict(mobileToken, eventId, decision, reason) {
    const account = this.findAccountByMobileToken(mobileToken);
    if (!account) {
      return null;
    }
    const event = this.state.events[eventId];
    if (!event || event.account_id !== account.id || event.status !== 'pending') {
      return null;
    }
    event.status = decision === 'allow' ? 'allowed' : 'blocked';
    event.decided_at = Date.now();
    this.state.verdicts[eventId] = {
      event_id: eventId,
      worker_id: event.worker_id,
      account_id: account.id,
      decision,
      reason,
      decided_at: event.decided_at,
      delivered: false,
    };
    this.persist();
    return event;
  }

  consumeVerdicts(workerToken) {
    const worker = this.state.workers[workerToken];
    if (!worker) {
      return [];
    }
    const out = [];
    for (const verdict of Object.values(this.state.verdicts)) {
      if (verdict.worker_id !== worker.id || verdict.delivered) {
        continue;
      }
      verdict.delivered = true;
      out.push({
        event_id: verdict.event_id,
        decision: verdict.decision,
        reason: verdict.reason,
        decided_at: verdict.decided_at,
      });
    }
    if (out.length > 0) {
      this.persist();
    }
    return out;
  }

  enqueueTestIntercept(mobileToken) {
    const account = this.findAccountByMobileToken(mobileToken);
    if (!account) {
      return null;
    }
    const workerId = account.active_worker_id;
    const workerToken = account.worker_tokens.find(
      (token) => this.state.workers[token]?.id === workerId,
    );
    if (!workerToken) {
      return null;
    }
    return this.enqueueEvent(workerToken, {
      event: {
        tool_name: 'Bash',
        hook_event_name: 'PreToolUse',
        tool_input: { command: 'echo Hermes Mobile relay test intercept' },
      },
      reason: 'Hermes Mobile relay test intercept',
      source: 'test_intercept',
    });
  }
}

module.exports = { RelayStore, randomToken, slugify };
