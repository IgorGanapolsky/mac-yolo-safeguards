import type { SessionContinuityHandoff } from './sessionContinuityHandoff';

/**
 * After Start fresh, compose stays empty and handoff injects on the next send.
 * On cold start / Mac switch / list reload — if we still have a pending handoff
 * pointing at a live session id, prefer that transcript over an empty "New chat"
 * that used to sit under a lying "Continuing from last session" banner.
 *
 * Never resume while compose-first is active: `skipAutoSelect` is one-shot and
 * clears on the first list load, so a second refresh would otherwise yank the
 * prior transcript back under an intentional empty New chat (Greptile P1).
 */
export function resolveContinuitySessionResumeId(opts: {
  handoff: SessionContinuityHandoff | null | undefined;
  /** True right after intentional New chat / Start fresh (compose-first). */
  skipAutoSelect: boolean;
  /**
   * Sticky compose-first after Start fresh / New chat / Clear all.
   * Survives list refresh after the one-shot skipAutoSelect flag clears.
   */
  composeFirstActive?: boolean;
  sessionIds: Iterable<string>;
}): string | null {
  if (opts.skipAutoSelect || opts.composeFirstActive) {
    return null;
  }
  const previousId = opts.handoff?.previousSessionId?.trim();
  if (!previousId) {
    return null;
  }
  for (const id of opts.sessionIds) {
    if (id === previousId) {
      return previousId;
    }
  }
  return null;
}
