/**
 * PRODUCT LAW (2026-07-25, real device): "no reply" guidance must describe the REAL fault.
 *
 * The shipped copy was
 *   "Still no reply text. Hermes checks your Mac briefly, then stops — open Leash for
 *    approve/deny/warn, Stop if a run is active, or start a fresh chat."
 * shown with ZERO approvals waiting while the actual cause was a dead connection. That
 * sends the operator to an empty Leash screen and hides the fault.
 *
 * Rules encoded here:
 *  1. Leash is named ONLY when approvals are actually waiting. Never send a user to an
 *     empty Leash screen.
 *  2. Stop is named ONLY when a run is actually active.
 *  3. When the link itself is dead or unauthenticated, say THAT — it outranks every
 *     "maybe an approval" guess, even if approvals happen to be queued.
 */

export type NoReplyGuidanceContext = {
  /** Approvals actually waiting in Leash right now. */
  pendingApprovalsCount?: number;
  /** A run is genuinely in flight, so Stop does something. */
  runActive?: boolean;
  /** Direct Mac HTTP proof. Explicit `false` means the link is the fault. */
  macHttpOk?: boolean;
  /** Gateway rejected this app's key — the link exists but is unauthenticated. */
  authMismatch?: boolean;
  /** Machine name for the fault sentence (falls back to "your Mac"). */
  machineLabel?: string;
  /** Auto-checking has hard-stopped; no more polling will happen. */
  hardStopped?: boolean;
};

/**
 * Stable prefix on EVERY variant.
 *
 * Downstream classifiers owned by other agents key off these substrings and must keep
 * working without being edited here:
 *   - src/utils/failedSendRetry.ts  → "still no reply" / "no reply"
 *   - src/utils/outboundDeliveryStatus.ts → "no reply text arrived"
 * Do not reword this constant without re-checking both.
 */
export const NO_REPLY_GUIDANCE_PREFIX = 'Still no reply text arrived.';

/** True when copy points the user at the Leash screen. */
export function mentionsLeash(text: string | null | undefined): boolean {
  return /leash|approve\/deny\/warn/i.test(text ?? '');
}

function joinActions(actions: string[]): string {
  if (actions.length <= 1) {
    return actions[0] ?? 'start a fresh chat';
  }
  if (actions.length === 2) {
    return `${actions[0]} or ${actions[1]}`;
  }
  return `${actions.slice(0, -1).join(', ')}, or ${actions[actions.length - 1]}`;
}

/**
 * Just the "what to do next" sentence, for surfaces that already have their own lead
 * (e.g. the auto-checking banner). Same conditional rules as buildNoReplyGuidance.
 */
export function buildNoReplyNextSteps(context: NoReplyGuidanceContext = {}): string {
  const machine = context.machineLabel?.trim() || 'your Mac';
  if (context.authMismatch) {
    return `${machine} rejected this app's key — tap the computer name above to re-pair, then send again.`;
  }
  if (context.macHttpOk === false) {
    return `The link to ${machine} is down — tap the computer name above to reconnect, then send again.`;
  }
  const actions = nextStepActions(context);
  const joined = joinActions(actions);
  return `${joined.charAt(0).toUpperCase()}${joined.slice(1)}.`;
}

/** Conditional "no reply" guidance. Never mentions a screen that has nothing on it. */
export function buildNoReplyGuidance(context: NoReplyGuidanceContext = {}): string {
  const machine = context.machineLabel?.trim() || 'your Mac';

  // Fault-first: a broken link is the answer, not an approval guess.
  if (context.authMismatch) {
    return `${NO_REPLY_GUIDANCE_PREFIX} ${machine} rejected this app's key, so the prompt never ran — tap the computer name above to re-pair, then send again.`;
  }
  if (context.macHttpOk === false) {
    return `${NO_REPLY_GUIDANCE_PREFIX} The link to ${machine} is down, so the prompt never landed — tap the computer name above to reconnect, then send again.`;
  }

  const lead = context.hardStopped
    ? `Hermes stopped checking ${machine}`
    : `Hermes checked ${machine} briefly, then stopped`;
  return `${NO_REPLY_GUIDANCE_PREFIX} ${lead} — ${joinActions(nextStepActions(context))}.`;
}

function nextStepActions(context: NoReplyGuidanceContext): string[] {
  const actions: string[] = [];
  const pending = Math.max(0, Math.trunc(context.pendingApprovalsCount ?? 0));
  if (pending > 0) {
    actions.push(
      pending === 1
        ? 'open Leash to approve/deny/warn the 1 request waiting'
        : `open Leash to approve/deny/warn the ${pending} requests waiting`,
    );
  }
  if (context.runActive) {
    actions.push('Stop the active run');
  }
  actions.push('start a fresh chat');
  return actions;
}

/** True for any copy produced by buildNoReplyGuidance (current or legacy wording). */
export function isNoReplyGuidanceCopy(text: string | null | undefined): boolean {
  const body = text?.trim() ?? '';
  if (!body) {
    return false;
  }
  return /^still no reply text\b/i.test(body);
}
