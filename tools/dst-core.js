#!/usr/bin/env node
'use strict';

/**
 * dst-core.js — Deterministic Simulation Testing (DST) core, Antithesis-inspired.
 *
 * We do NOT run Antithesis's commercial hypervisor. We steal the *ideas* that
 * fit a solo/SaaS monorepo without bare-metal sim:
 *
 *   1. Perfect determinism — same seed ⇒ same scenario transcript
 *   2. Fault injection     — clock jumps, online/offline flips, toxic inputs
 *   3. Property checks     — always/never invariants (not only happy paths)
 *   4. Guided exploration  — bias toward unseen system states
 *   5. Replay              — seed + steps is the reproduction kit
 *
 * Use: require('./dst-core') or `node tools/dst-core.js --help`
 *
 * See docs/DETERMINISTIC-SIMULATION.md
 */

const crypto = require('crypto');

/** Mulberry32 — tiny deterministic PRNG. */
function createRng(seed) {
  let t = (Number(seed) >>> 0) || 1;
  return {
    seed: t,
    next() {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    },
    int(maxExclusive) {
      if (maxExclusive <= 0) return 0;
      return Math.floor(this.next() * maxExclusive);
    },
    pick(arr) {
      if (!arr.length) return undefined;
      return arr[this.int(arr.length)];
    },
    bool(p = 0.5) {
      return this.next() < p;
    },
  };
}

function hashSeed(parts) {
  const h = crypto.createHash('sha256').update(String(parts.join('|'))).digest();
  return h.readUInt32BE(0);
}

/**
 * Virtual clock — all "time" in a scenario comes from here (never Date.now).
 */
function createClock(startMs = 1_000_000) {
  let now = startMs;
  return {
    now: () => now,
    advance(ms) {
      const delta = Math.max(0, Number(ms) || 0);
      now += delta;
      return now;
    },
    set(ms) {
      now = Number(ms) || 0;
      return now;
    },
  };
}

/**
 * Run a scenario: stepFn(ctx) returns { done?, events?, faults?, violations? }
 * or throws. Collects a full transcript for replay / RCA.
 */
function runScenario({
  name,
  seed,
  steps = 200,
  stepFn,
  meta = {},
}) {
  const rng = createRng(seed);
  const clock = createClock(meta.startMs ?? 1_000_000);
  const seenStates = new Set();
  const transcript = [];
  const violations = [];
  let step = 0;

  const ctx = {
    name,
    seed,
    rng,
    clock,
    seenStates,
    meta,
    recordState(key) {
      const k = String(key);
      const novel = !seenStates.has(k);
      seenStates.add(k);
      return { key: k, novel };
    },
    /** Prefer novel states (Antithesis "intelligent exploration" lite). */
    preferNovel(candidates, keyFn) {
      const novel = candidates.filter((c) => !seenStates.has(String(keyFn(c))));
      if (novel.length) return rng.pick(novel);
      return rng.pick(candidates);
    },
  };

  for (step = 0; step < steps; step += 1) {
    let result;
    try {
      result = stepFn(ctx, step);
    } catch (err) {
      violations.push({
        step,
        kind: 'throw',
        message: err instanceof Error ? err.message : String(err),
      });
      transcript.push({ step, t: clock.now(), error: true, message: String(err) });
      break;
    }
    if (!result) continue;
    if (Array.isArray(result.violations) && result.violations.length) {
      for (const v of result.violations) {
        violations.push({ step, t: clock.now(), ...v });
      }
    }
    transcript.push({
      step,
      t: clock.now(),
      event: result.event || null,
      fault: result.fault || null,
      state: result.state || null,
      decision: result.decision || null,
    });
    if (result.done) break;
  }

  return {
    schema_version: 'dst-scenario/1',
    name,
    seed,
    steps_planned: steps,
    steps_ran: step + (violations.some((v) => v.kind === 'throw') ? 0 : 0),
    steps_executed: transcript.length,
    ok: violations.length === 0,
    violations,
    states_explored: seenStates.size,
    transcript_digest: crypto
      .createHash('sha256')
      .update(JSON.stringify(transcript))
      .digest('hex')
      .slice(0, 16),
    // Keep transcript only when failing or when explicitly requested — CI wants small receipts.
    transcript: meta.keepTranscript || violations.length ? transcript : undefined,
  };
}

/** Assert two scenario results are identical for determinism proofs. */
function assertDeterministic(a, b) {
  const failures = [];
  if (a.transcript_digest !== b.transcript_digest) {
    failures.push(`digest ${a.transcript_digest} !== ${b.transcript_digest}`);
  }
  if (a.ok !== b.ok) failures.push(`ok ${a.ok} !== ${b.ok}`);
  if (a.states_explored !== b.states_explored) {
    failures.push(`states ${a.states_explored} !== ${b.states_explored}`);
  }
  if ((a.violations || []).length !== (b.violations || []).length) {
    failures.push('violation count mismatch');
  }
  return failures;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.length === 0) {
    console.log(`Usage:
  node tools/dst-core.js --self-test
  node tools/dst-run.js --scenario task-routing --seed 42 --steps 500

Antithesis ideas implemented here (open-source subset):
  - deterministic PRNG + virtual clock
  - scenario transcripts + seed replay
  - property/invariant violations
  - novel-state exploration bias
`);
    process.exit(0);
  }
  if (args.includes('--self-test')) {
    const a = runScenario({
      name: 'self',
      seed: 42,
      steps: 20,
      stepFn(ctx) {
        ctx.clock.advance(ctx.rng.int(1000));
        const s = ctx.recordState(ctx.rng.int(5));
        return { state: s.key, event: 'tick' };
      },
      meta: { keepTranscript: true },
    });
    const b = runScenario({
      name: 'self',
      seed: 42,
      steps: 20,
      stepFn(ctx) {
        ctx.clock.advance(ctx.rng.int(1000));
        const s = ctx.recordState(ctx.rng.int(5));
        return { state: s.key, event: 'tick' };
      },
      meta: { keepTranscript: true },
    });
    const fails = assertDeterministic(a, b);
    if (fails.length) {
      console.error('SELF-TEST FAIL', fails);
      process.exit(1);
    }
    console.log(
      JSON.stringify(
        { ok: true, digest: a.transcript_digest, states: a.states_explored },
        null,
        2,
      ),
    );
    process.exit(0);
  }
  console.error('Unknown args; try --help');
  process.exit(2);
}

module.exports = {
  createRng,
  createClock,
  hashSeed,
  runScenario,
  assertDeterministic,
};

if (require.main === module) {
  main();
}
