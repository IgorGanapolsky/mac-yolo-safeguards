import {
  PENDING_APPROVALS_HARD_CAP,
  PENDING_APPROVALS_RENDER_CAP,
  PENDING_BADGE_DISPLAY_CAP,
  cappedBadgeCount,
  dedupeAndCapPendingApprovals,
  formatPendingApprovalBadge,
  pendingApprovalDedupeKey,
  pendingApprovalsSignature,
} from '../utils/pendingApprovalsCap';
import type { PendingApproval } from '../types/gateway';

function makePending(partial: Partial<PendingApproval> & { actionId: string }): PendingApproval {
  return {
    toolName: 'bash',
    reason: 'test',
    receivedAt: '2026-07-13T00:00:00.000Z',
    ...partial,
  };
}

describe('pendingApprovalsCap', () => {
  it('dedupes by runId when present', () => {
    const items = [
      makePending({ actionId: 'a1', runId: 'run-1' }),
      makePending({ actionId: 'a2', runId: 'run-1' }),
      makePending({ actionId: 'a3', runId: 'run-2' }),
    ];
    const out = dedupeAndCapPendingApprovals(items);
    expect(out.map((i) => i.actionId)).toEqual(['a1', 'a3']);
  });

  it('dedupes by actionId when runId missing', () => {
    const items = [
      makePending({ actionId: 'dup' }),
      makePending({ actionId: 'dup' }),
      makePending({ actionId: 'unique' }),
    ];
    expect(dedupeAndCapPendingApprovals(items).map((i) => i.actionId)).toEqual(['dup', 'unique']);
  });

  it('hard-caps list length', () => {
    const items = Array.from({ length: PENDING_APPROVALS_HARD_CAP + 50 }, (_, i) =>
      makePending({ actionId: `id-${i}` }),
    );
    expect(dedupeAndCapPendingApprovals(items)).toHaveLength(PENDING_APPROVALS_HARD_CAP);
  });

  it('formats badge as 99+', () => {
    expect(formatPendingApprovalBadge(0)).toBe('');
    expect(formatPendingApprovalBadge(7)).toBe('7');
    expect(formatPendingApprovalBadge(PENDING_BADGE_DISPLAY_CAP)).toBe('99');
    expect(formatPendingApprovalBadge(5557)).toBe('99+');
    expect(cappedBadgeCount(5557)).toBe(PENDING_BADGE_DISPLAY_CAP);
  });

  it('builds order-independent signature', () => {
    const a = [makePending({ actionId: 'x' }), makePending({ actionId: 'y' })];
    const b = [makePending({ actionId: 'y' }), makePending({ actionId: 'x' })];
    expect(pendingApprovalsSignature(a)).toBe(pendingApprovalsSignature(b));
    expect(pendingApprovalsSignature(a)).not.toBe(pendingApprovalsSignature([makePending({ actionId: 'x' })]));
  });

  it('exports render cap for Leash UI', () => {
    expect(PENDING_APPROVALS_RENDER_CAP).toBeGreaterThan(0);
    expect(PENDING_APPROVALS_RENDER_CAP).toBeLessThanOrEqual(PENDING_APPROVALS_HARD_CAP);
  });

  it('prefers run key over action key', () => {
    expect(pendingApprovalDedupeKey({ actionId: 'a', runId: 'r1' })).toBe('run:r1');
    expect(pendingApprovalDedupeKey({ actionId: 'a' })).toBe('action:a');
  });
});
