import { AppState } from 'react-native';
import type { PendingApproval } from '../types/gateway';
import {
  approvalNotificationIdentifier,
  approvalNotificationTitle,
  approvalsSummaryBody,
  buildApprovalNotificationBody,
  shouldScheduleApprovalNotification,
  shouldScheduleRunCompletedNotification,
} from '../utils/smartNotificationPolicy';

const basePending = (overrides: Partial<PendingApproval> = {}): PendingApproval => ({
  actionId: 'act-1',
  toolName: 'bash',
  reason: 'Run deploy script',
  receivedAt: '2026-06-15T12:00:00.000Z',
  ...overrides,
});

describe('smartNotificationPolicy', () => {
  it('schedules approval notifications only when backgrounded (except high risk)', () => {
    expect(shouldScheduleApprovalNotification(basePending(), 'active')).toBe(false);
    expect(shouldScheduleApprovalNotification(basePending(), 'background')).toBe(true);
    expect(
      shouldScheduleApprovalNotification(basePending({ riskTier: 'high' }), 'active'),
    ).toBe(false);
    expect(
      shouldScheduleApprovalNotification(basePending({ riskTier: 'high' }), 'background'),
    ).toBe(true);
  });

  it('builds approval body from command and diff preview', () => {
    const body = buildApprovalNotificationBody(
      basePending({
        command: 'npm run deploy',
        diff: '--- a/file.ts\n+++ b/file.ts\n+const ok = true',
      }),
    );
    expect(body).toContain('npm run deploy');
    expect(body).toContain('+const ok = true');
  });

  it('titles chat-thread approvals distinctly', () => {
    expect(approvalNotificationTitle(basePending({ sessionKey: 'sess-42' }))).toBe(
      'Chat thread needs your approval',
    );
    expect(approvalNotificationTitle(basePending({ riskTier: 'high' }))).toBe(
      'High-risk approval on your computer',
    );
  });

  it('summarizes multiple approvals', () => {
    const summary = approvalsSummaryBody([
      basePending({ command: 'git push' }),
      basePending({ actionId: 'act-2', command: 'rm file' }),
    ]);
    expect(summary).toMatch(/^2 waiting/);
    expect(summary).toContain('git push');
  });

  it('uses stable approval notification identifiers', () => {
    expect(approvalNotificationIdentifier('act-99')).toBe('hermes-approval-act-99');
  });

  it('schedules run completed only when not active', () => {
    expect(shouldScheduleRunCompletedNotification('active')).toBe(false);
    expect(shouldScheduleRunCompletedNotification('background')).toBe(true);
    expect(shouldScheduleRunCompletedNotification(AppState.currentState)).toBe(
      AppState.currentState !== 'active',
    );
  });
});
