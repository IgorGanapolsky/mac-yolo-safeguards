#!/usr/bin/env node
'use strict';

/**
 * DST scenario: Hermes Web task routing (local / cloud / auto × device presence).
 *
 * Mirrors apps/hermes-control-plane/lib/task-routing.ts decideTaskRoute so we can
 * property-test thousands of fault schedules without spinning up Next.js.
 * Keep in lockstep with the TypeScript source — if TS changes, this file + its
 * golden cases must change.
 *
 * Antithesis mapping:
 *   - Faults: device partition (lastSeen ages out), recovery heartbeats, clock jumps,
 *     failoverMode flips, preference flips
 *   - Properties: never silent cloud on local-only; cloud always cloud; auto offline
 *     respects failoverMode; routes stay in {local,cloud,blocked}
 *   - Replay: --seed N reproduces the full violation transcript
 */

const { runScenario, assertDeterministic } = require('./dst-core');

const ONLINE_MS = 60_000;

/** @typedef {'local'|'cloud'|'auto'} RoutePreference */
/** @typedef {'disabled'|'manual'|'auto'} FailoverMode */

function isDeviceOnline(lastSeenAt, now) {
  return Boolean(lastSeenAt && now - lastSeenAt < ONLINE_MS);
}

/**
 * Keep identical to apps/hermes-control-plane/lib/task-routing.ts decideTaskRoute
 */
function decideTaskRoute({ preference, device, now }) {
  const online = isDeviceOnline(device.lastSeenAt, now);

  if (preference === 'cloud') {
    return { status: 'cloud_pending', route: 'cloud', preference };
  }
  if (preference === 'local') {
    if (online) return { status: 'local_pending', route: 'local', preference };
    return { status: 'offline_blocked', route: 'blocked', preference };
  }
  // auto
  if (online) return { status: 'local_pending', route: 'local', preference: 'auto' };
  if (device.failoverMode === 'auto') {
    return { status: 'cloud_pending', route: 'cloud', preference: 'auto' };
  }
  if (device.failoverMode === 'manual') {
    return { status: 'needs_failover', route: 'blocked', preference: 'auto' };
  }
  return { status: 'offline_blocked', route: 'blocked', preference: 'auto' };
}

/** Property checks — the "specification" Antithesis would drive against. */
function checkInvariants(preference, device, now, decision) {
  const violations = [];
  const online = isDeviceOnline(device.lastSeenAt, now);
  const routes = new Set(['local', 'cloud', 'blocked']);
  if (!routes.has(decision.route)) {
    violations.push({ kind: 'invalid_route', message: `route=${decision.route}` });
  }
  if (preference === 'cloud' && decision.route !== 'cloud') {
    violations.push({
      kind: 'cloud_pref_not_cloud',
      message: 'cloud preference must always route to Continuity',
    });
  }
  if (preference === 'local' && decision.route === 'cloud') {
    violations.push({
      kind: 'local_pref_silent_cloud',
      message: 'local preference must never silently use Continuity',
    });
  }
  if (preference === 'local' && !online && decision.status !== 'offline_blocked') {
    violations.push({
      kind: 'local_offline_status',
      message: `expected offline_blocked got ${decision.status}`,
    });
  }
  if (preference === 'auto' && online && decision.route !== 'local') {
    violations.push({
      kind: 'auto_online_not_local',
      message: 'auto + online Mac must run local',
    });
  }
  if (
    preference === 'auto' &&
    !online &&
    device.failoverMode === 'auto' &&
    decision.route !== 'cloud'
  ) {
    violations.push({
      kind: 'auto_failover_miss',
      message: 'auto offline + failover=auto must go cloud',
    });
  }
  if (
    preference === 'auto' &&
    !online &&
    device.failoverMode === 'manual' &&
    decision.status !== 'needs_failover'
  ) {
    violations.push({
      kind: 'manual_failover_status',
      message: `expected needs_failover got ${decision.status}`,
    });
  }
  if (
    preference === 'auto' &&
    !online &&
    device.failoverMode === 'disabled' &&
    decision.status !== 'offline_blocked'
  ) {
    violations.push({
      kind: 'disabled_failover_status',
      message: `expected offline_blocked got ${decision.status}`,
    });
  }
  // Status ↔ route consistency
  if (decision.route === 'cloud' && !String(decision.status).includes('cloud')) {
    violations.push({ kind: 'status_route_mismatch', message: `${decision.status}/${decision.route}` });
  }
  if (decision.route === 'local' && !String(decision.status).includes('local')) {
    violations.push({ kind: 'status_route_mismatch', message: `${decision.status}/${decision.route}` });
  }
  if (decision.route === 'blocked' && decision.status === 'local_pending') {
    violations.push({ kind: 'blocked_local_pending', message: 'blocked cannot be local_pending' });
  }
  return violations;
}

const PREFS = /** @type {RoutePreference[]} */ (['local', 'cloud', 'auto']);
const FAILOVERS = /** @type {FailoverMode[]} */ (['disabled', 'manual', 'auto']);

/**
 * One multi-step world: mutable device + preference, fault schedule each step.
 */
function runTaskRoutingScenario({ seed = 42, steps = 500, keepTranscript = false } = {}) {
  /** @type {{ preference: RoutePreference, failoverMode: FailoverMode, lastSeenAt: number|null }} */
  const world = {
    preference: 'auto',
    failoverMode: 'manual',
    lastSeenAt: 1_000_000 - 5_000, // online at t=1e6
  };

  return runScenario({
    name: 'task-routing',
    seed,
    steps,
    meta: { keepTranscript, startMs: 1_000_000 },
    stepFn(ctx) {
      const faults = [
        'tick',
        'partition', // age lastSeen past online window
        'heartbeat', // device comes back
        'flip_pref',
        'flip_failover',
        'clock_jump',
        'null_seen', // never-seen device
      ];
      // Bias toward novel (pref,failover,online) triples
      const fault = ctx.preferNovel(faults, (f) => {
        // approximate next-state key for guidance
        return `${world.preference}|${world.failoverMode}|${f}`;
      });

      let faultDetail = fault;
      if (fault === 'tick') {
        ctx.clock.advance(ctx.rng.int(15_000) + 1);
      } else if (fault === 'partition') {
        // Force offline: last seen more than ONLINE_MS ago
        world.lastSeenAt = ctx.clock.now() - ONLINE_MS - ctx.rng.int(300_000) - 1;
        faultDetail = 'partition_offline';
      } else if (fault === 'heartbeat') {
        world.lastSeenAt = ctx.clock.now();
        faultDetail = 'heartbeat_online';
      } else if (fault === 'flip_pref') {
        world.preference = ctx.rng.pick(PREFS);
        faultDetail = `pref=${world.preference}`;
      } else if (fault === 'flip_failover') {
        world.failoverMode = ctx.rng.pick(FAILOVERS);
        faultDetail = `failover=${world.failoverMode}`;
      } else if (fault === 'clock_jump') {
        // Large jump can flip online→offline without touching lastSeen
        ctx.clock.advance(ONLINE_MS + ctx.rng.int(120_000));
        faultDetail = 'clock_jump';
      } else if (fault === 'null_seen') {
        world.lastSeenAt = null;
        faultDetail = 'null_lastSeen';
      }

      const device = {
        failoverMode: world.failoverMode,
        lastSeenAt: world.lastSeenAt,
      };
      const now = ctx.clock.now();
      const decision = decideTaskRoute({
        preference: world.preference,
        device,
        now,
      });
      const online = isDeviceOnline(world.lastSeenAt, now);
      const stateKey = `${world.preference}|${world.failoverMode}|${online ? 'on' : 'off'}|${decision.route}|${decision.status}`;
      ctx.recordState(stateKey);

      const violations = checkInvariants(world.preference, device, now, decision);
      return {
        fault: faultDetail,
        state: stateKey,
        decision,
        violations,
        event: 'decideTaskRoute',
      };
    },
  });
}

/** Exhaustive oracle for the finite discrete space (sanity, not random). */
function exhaustiveOracle() {
  const violations = [];
  const now = 1_000_000;
  const lastSeens = [null, now - 1_000, now - 59_999, now - 60_000, now - 120_000];
  for (const preference of PREFS) {
    for (const failoverMode of FAILOVERS) {
      for (const lastSeenAt of lastSeens) {
        const device = { failoverMode, lastSeenAt };
        const decision = decideTaskRoute({ preference, device, now });
        const v = checkInvariants(preference, device, now, decision);
        for (const item of v) {
          violations.push({ preference, failoverMode, lastSeenAt, decision, ...item });
        }
      }
    }
  }
  return { ok: violations.length === 0, cases: PREFS.length * FAILOVERS.length * lastSeens.length, violations };
}

function main() {
  const args = process.argv.slice(2);
  const get = (flag, def) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : def;
  };
  if (args.includes('--help')) {
    console.log(`Usage: node tools/dst-task-routing.js [--seed N] [--steps N] [--json] [--exhaustive] [--determinism]`);
    process.exit(0);
  }
  if (args.includes('--exhaustive')) {
    const r = exhaustiveOracle();
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  }
  const seed = Number(get('--seed', '42')) || 42;
  const steps = Number(get('--steps', '500')) || 500;
  if (args.includes('--determinism')) {
    const a = runTaskRoutingScenario({ seed, steps, keepTranscript: true });
    const b = runTaskRoutingScenario({ seed, steps, keepTranscript: true });
    const fails = assertDeterministic(a, b);
    const out = { ok: fails.length === 0 && a.ok, fails, digest: a.transcript_digest, states: a.states_explored };
    console.log(JSON.stringify(out, null, 2));
    process.exit(out.ok ? 0 : 1);
  }
  const report = runTaskRoutingScenario({
    seed,
    steps,
    keepTranscript: args.includes('--transcript'),
  });
  if (args.includes('--json') || true) {
    // always JSON for agents
    const { transcript, ...rest } = report;
    console.log(
      JSON.stringify(
        args.includes('--transcript') ? report : rest,
        null,
        2,
      ),
    );
  }
  process.exit(report.ok ? 0 : 1);
}

module.exports = {
  decideTaskRoute,
  checkInvariants,
  runTaskRoutingScenario,
  exhaustiveOracle,
  isDeviceOnline,
  ONLINE_MS,
};

if (require.main === module) {
  main();
}
