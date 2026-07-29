# Deterministic Simulation Testing (Antithesis ideas, local)

**Date:** 2026-07-29  
**Inspiration:** [Antithesis](https://antithesis.com/) — *ideas only*. We do **not** run their commercial deterministic hypervisor.

## How Antithesis helps teams (what we steal)

| Antithesis idea | What it means | What we implement |
|-----------------|---------------|-------------------|
| **Perfect determinism** | Same inputs ⇒ same bug every time | Seeded PRNG + virtual clock (`tools/dst-core.js`) |
| **Fault injection** | Network, clock, scheduling, storage faults | Partition, heartbeat, clock jump, toxic prefs |
| **Property / always-true specs** | Not only unit examples — *invariants* | `checkInvariants` on task routing |
| **Intelligent exploration** | Prefer novel system states | `preferNovel` in scenario steps |
| **Replay / RCA** | Seed + transcript = reproduction | `transcript_digest` + optional full transcript |
| **Autonomous verification** | Generate cases; CI fails on invariant break | `tests/test-dst-harness.js` in macOS guard `test-*.js` loop |
| **Full-system hypervisor DST** | Whole Docker multiverse under deterministic VM | **Out of scope** (needs their product / bare metal) |

## Why this helps *us* (ThumbGate / Hermes)

High-risk pure logic that ships with Continuity money and agent autonomy:

1. **Task routing** (`local` / `cloud` / `auto` × device online × failoverMode)  
   - Bug class: *silent Continuity* when user asked for local-only  
   - Bug class: Auto online Mac still billed as cloud  
   - DST explores thousands of fault schedules unit tests never list

2. **Future targets** (same harness, new scenario files):  
   - Social publish gate fail-closed  
   - Grepae canary thresholds  
   - Lease / claim races (when modeled as pure state machines)

## Commands

```bash
# Self-test PRNG + clock determinism
node tools/dst-core.js --self-test

# Exhaustive finite space for task routing (oracle)
node tools/dst-task-routing.js --exhaustive

# One seed, 500 fault steps
node tools/dst-run.js --scenario task-routing --seed 42 --steps 500

# 30 random seeds (guided exploration)
node tools/dst-run.js --scenario task-routing --seeds 30 --steps 300

# CI gate
node tests/test-dst-harness.js
```

Replay a failure: re-run with the printed `--seed` and add `--transcript` on `dst-task-routing.js` (or set `keepTranscript` in code).

## Lockstep with production TypeScript

`tools/dst-task-routing.js` **mirrors**  
`apps/hermes-control-plane/lib/task-routing.ts` `decideTaskRoute`.

When you change TS routing:

1. Update the JS mirror  
2. Update vitest cases in `task-routing.test.ts`  
3. Run `node tests/test-dst-harness.js`

## What we are *not* claiming

- We are not “using Antithesis” as a vendor.  
- We are not finding hypervisor-level race conditions in Node/Next.  
- We *are* applying their verification *philosophy* to the money-path routing state machine, with CI teeth.
