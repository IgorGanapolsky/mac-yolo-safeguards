import type { HermesSession } from '../types/chat';
import type { RunProgressState } from '../types/chatDisplay';
import { sessionLastActiveValue } from './sessionDisplay';

export type ThreadActivityState = 'idle' | 'running' | 'needs_approval';

export type ThreadActivitySummary = {
  state: ThreadActivityState;
  preview: string | null;
};

function isRunPhaseActive(phase: string | undefined): boolean {
  return phase !== 'completed' && phase !== 'failed';
}

export function threadActivityForSession(
  session: HermesSession,
  opts: {
    currentSessionId?: string | null;
    isSending?: boolean;
    runProgress?: RunProgressState | null;
    pendingApprovalSessionIds?: Set<string>;
  },
): ThreadActivitySummary {
  const sessionId = session.id;
  const preview = session.preview?.trim() || session.title?.trim() || null;

  const approvalPending = opts.pendingApprovalSessionIds?.has(sessionId) ?? false;
  if (approvalPending) {
    return { state: 'needs_approval', preview };
  }

  const run = opts.runProgress;
  const runMatches =
    run &&
    isRunPhaseActive(run.phase) &&
    (run.sessionId === sessionId ||
      (opts.currentSessionId === sessionId && opts.isSending));

  if (runMatches || (opts.isSending && opts.currentSessionId === sessionId)) {
    return {
      state: 'running',
      preview: run?.detail?.trim() || preview,
    };
  }

  return { state: 'idle', preview };
}

export function sortSessionsForAgentRail(sessions: HermesSession[]): HermesSession[] {
  return [...sessions].sort((a, b) => {
    const aTime = sessionLastActiveValue(a) ?? 0;
    const bTime = sessionLastActiveValue(b) ?? 0;
    const aNum = typeof aTime === 'number' ? aTime : Date.parse(String(aTime));
    const bNum = typeof bTime === 'number' ? bTime : Date.parse(String(bTime));
    return bNum - aNum;
  });
}

export function threadActivityLabel(state: ThreadActivityState): string {
  switch (state) {
    case 'running':
      return 'Running';
    case 'needs_approval':
      return 'Approve';
    default:
      return '';
  }
}
