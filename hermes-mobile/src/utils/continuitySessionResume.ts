import type { SessionContinuityHandoff } from './sessionContinuityHandoff';

/**
 * After Start fresh, compose stays empty and handoff injects on the next send.
 * On cold start / Mac switch / list reload — if we still have a pending handoff
 * pointing at a live session id, prefer that transcript over an empty "New chat"
 * that used to sit under a lying "Continuing from last session" banner.
 */
export function resolveContinuitySessionResumeId(opts: {
  handoff: SessionContinuityHandoff | null | undefined;
  /** True right after intentional New chat / Start fresh (compose-first). */
  skipAutoSelect: boolean;
  sessionIds: Iterable<string>;
}): string | null {
  if (opts.skipAutoSelect) {
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
