import {
  MAX_PENDING_APPROVALS,
  capPendingApprovals,
  formatPendingApprovalsBadge,
  prependPendingApproval,
} from '../utils/pendingApprovalsCap';
import type { PendingApproval } from '../types/gateway';

function makePending(id: string): PendingApproval {
  return {
    actionId: id,
    toolName: 'bash',
    reason: `need ${id}`,
    receivedAt: new Date().toISOString(),
  };
}

describe('pendingApprovalsCap', () => {
  it('caps long lists to MAX_PENDING_APPROVALS keeping newest first', () => {
    const list = Array.from({ length: MAX_PENDING_APPROVALS + 25 }, (_, i) =>
      makePending(`a${i}`),
    );
    const capped = capPendingApprovals(list);
    expect(capped).toHaveLength(MAX_PENDING_APPROVALS);
    expect(capped[0].actionId).toBe('a0');
    expect(capped[MAX_PENDING_APPROVALS - 1].actionId).toBe(`a${MAX_PENDING_APPROVALS - 1}`);
  });

  it('returns same reference when under cap', () => {
    const list = [makePending('x')];
    expect(capPendingApprovals(list)).toBe(list);
  });

  it('formats badge with 99+ ceiling', () => {
    expect(formatPendingApprovalsBadge(0)).toBe('');
    expect(formatPendingApprovalsBadge(1)).toBe('1');
    expect(formatPendingApprovalsBadge(99)).toBe('99');
    expect(formatPendingApprovalsBadge(100)).toBe('99+');
    expect(formatPendingApprovalsBadge(5557)).toBe('99+');
  });

  it('prepends without duplicates and caps growth', () => {
    let list: PendingApproval[] = [];
    for (let i = 0; i < MAX_PENDING_APPROVALS + 10; i += 1) {
      list = prependPendingApproval(list, makePending(`n${i}`));
    }
    expect(list).toHaveLength(MAX_PENDING_APPROVALS);
    expect(list[0].actionId).toBe(`n${MAX_PENDING_APPROVALS + 9}`);
    const same = prependPendingApproval(list, makePending(list[0].actionId));
    expect(same).toBe(list);
  });
});
