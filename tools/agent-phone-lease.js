#!/usr/bin/env node
'use strict';

/**
 * Unified global phone device lease (T-330 priority 2).
 *
 * Root cause of the recurring device-contention defect: pairing (hermes-mobile-pair.js),
 * install (install-phone-release.sh via agent-phone-pipeline-lock.js), Maestro/continuous E2E
 * (run-continuous-e2e.sh / maestro-env.sh), store screenshots (capture-store-screenshots.sh),
 * and Igor's own dogfooding each treated the single physical USB phone as if they owned it
 * exclusively — Maestro's `kill_competing_maestro_processes` would even SIGKILL another
 * lane's live Maestro session. This module gives every lane ONE shared lease:
 *
 *   - pairing / install queue on `withPhonePipelineLock` (tools/agent-phone-pipeline-lock.js),
 *     which now also refuses to run while a human hold is active.
 *   - Maestro/E2E/screenshots/dogfooding are AUTOMATED_LANES: they must never fight a human
 *     for the phone, so they SKIP immediately (no queueing) when a human hold is set.
 *
 * CLI (bash-callable — see hermes-mobile/scripts/maestro-env.sh,
 * hermes-mobile/scripts/run-continuous-e2e.sh):
 *   node tools/agent-phone-lease.js hold [--reason TEXT] [--ttl-ms N]
 *   node tools/agent-phone-lease.js release
 *   node tools/agent-phone-lease.js status [--json]
 *   node tools/agent-phone-lease.js busy-reason [--lane LANE]   # exit 1 + prints reason if busy
 */

const {
  GLOBAL_PHONE_DIR,
  HUMAN_HOLD_FILE,
  DEFAULT_HUMAN_HOLD_TTL_MS,
  withPhonePipelineLock,
  pipelineBusyReason,
  setHumanHold,
  clearHumanHold,
  getHumanHold,
  isHumanHoldActive,
} = require('./agent-phone-pipeline-lock.js');

/** Lanes that MUST skip outright (never queue) when a human is holding the phone. */
const AUTOMATED_LANES = new Set(['maestro', 'e2e', 'screenshots', 'dogfooding']);
/** Every lane sharing this one lease. */
const ALL_LANES = new Set(['pairing', 'install', 'maestro', 'e2e', 'screenshots', 'dogfooding']);

/**
 * @param {'pairing'|'install'|'maestro'|'e2e'|'screenshots'|'dogfooding'} lane
 * @param {string} label
 * @param {(release: () => void) => void} fn
 * @param {{ waitMs?: number, skipIfBusy?: boolean }} [options]
 * @returns {{ ran: boolean, skipped?: boolean, reason?: string }}
 */
function withPhoneLease(lane, label, fn, options = {}) {
  if (!ALL_LANES.has(lane)) {
    throw new Error(`Unknown phone lease lane: ${lane} (expected one of ${[...ALL_LANES].join(', ')})`);
  }
  const hold = getHumanHold();
  if (hold && AUTOMATED_LANES.has(lane)) {
    return { ran: false, skipped: true, reason: `human hold: ${hold.reason}` };
  }
  return withPhonePipelineLock(`[${lane}] ${label}`, fn, options);
}

/**
 * Combined reason string (human hold first, then the pipeline lock) — bash-friendly.
 *
 * When `HERMES_PHONE_PIPELINE_LEASE_HELD=1` (run-continuous-e2e.sh's
 * `run_once_with_global_phone_lease` already holds the mkdir-based pipeline lock for this
 * whole process tree — see agent-phone-pipeline-lock.js's `run` subcommand), skip the
 * pipeline-lock portion: a descendant process checking that lock would otherwise always
 * see its own ancestor's lock as "busy" and self-skip. A human hold still applies —
 * grabbing the phone mid-cycle must still be able to interrupt an in-flight automated run.
 */
function combinedBusyReason(lane) {
  const hold = getHumanHold();
  if (hold && (!lane || AUTOMATED_LANES.has(lane))) {
    return `human hold: ${hold.reason}`;
  }
  if (process.env.HERMES_PHONE_PIPELINE_LEASE_HELD === '1') {
    return '';
  }
  return pipelineBusyReason();
}

module.exports = {
  GLOBAL_PHONE_DIR,
  HUMAN_HOLD_FILE,
  DEFAULT_HUMAN_HOLD_TTL_MS,
  AUTOMATED_LANES,
  ALL_LANES,
  withPhoneLease,
  combinedBusyReason,
  setHumanHold,
  clearHumanHold,
  getHumanHold,
  isHumanHoldActive,
};

if (require.main === module) {
  const rest = process.argv.slice(3);
  const cmd = process.argv[2];
  const flag = (name) => {
    const idx = rest.indexOf(`--${name}`);
    return idx >= 0 ? rest[idx + 1] : undefined;
  };

  switch (cmd) {
    case 'hold': {
      const reason = flag('reason') || 'human is using the phone';
      const ttlMs = Number(flag('ttl-ms') || DEFAULT_HUMAN_HOLD_TTL_MS);
      const payload = setHumanHold(reason, ttlMs);
      console.log(`Human hold set: ${payload.reason} (expires ${new Date(payload.expiresAt).toISOString()})`);
      break;
    }
    case 'release': {
      clearHumanHold();
      console.log('Human hold cleared.');
      break;
    }
    case 'status': {
      const hold = getHumanHold();
      const busy = pipelineBusyReason();
      if (rest.includes('--json')) {
        console.log(JSON.stringify({ humanHold: hold, pipelineBusy: busy || null }));
      } else {
        console.log(hold ? `HUMAN HOLD: ${hold.reason}` : 'no human hold');
        console.log(busy ? `PIPELINE BUSY: ${busy}` : 'pipeline free');
      }
      process.exit(hold || busy ? 1 : 0);
      break;
    }
    case 'busy-reason': {
      const lane = flag('lane');
      const reason = combinedBusyReason(lane);
      if (reason) {
        console.log(reason);
        process.exit(1);
      }
      process.exit(0);
      break;
    }
    default:
      console.error(
        'Usage: agent-phone-lease.js <hold|release|status|busy-reason> [--reason TEXT] [--ttl-ms N] [--lane LANE] [--json]',
      );
      process.exit(2);
  }
}
