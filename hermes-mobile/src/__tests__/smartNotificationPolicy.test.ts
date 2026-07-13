import { AppState } from 'react-native';
import type { PendingApproval } from '../types/gateway';
import {
  approvalNotificationIdentifier,
  approvalNotificationTitle,
  approvalsSummaryBody,
  buildApprovalNotificationBody,
  resolveHermesNotificationPresentation,
  shouldPresentIntrusiveNotification,
  shouldScheduleApprovalNotification,
  shouldScheduleApprovalsSummaryNotification,
  shouldScheduleRunCompletedNotification,
  shouldScheduleRunProgressNotification,
} from '../utils/smartNotificationPolicy';

const basePending = (overrides: Partial<PendingApproval> = {}): PendingApproval => ({
  actionId: 'act-1',
  toolName: 'bash',
  reason: 'Run deploy script',
  receivedAt: '2026-06-15T12:00:00.000Z',
  ...overrides,
});

describe('smartNotificationPolicy', () => {
  it('schedules approval notifications only when backgrounded', () => {
    expect(shouldScheduleApprovalNotification(basePending(), 'active')).toBe(false);
    expect(shouldScheduleApprovalNotification(basePending(), 'inactive')).toBe(false);
    expect(shouldScheduleApprovalNotification(basePending(), 'background')).toBe(true);
    expect(shouldScheduleApprovalNotification(basePending(), 'background', false)).toBe(false);
    expect(
      shouldScheduleApprovalNotification(basePending({ riskTier: 'high' }), 'active'),
    ).toBe(false);
    expect(
      shouldScheduleApprovalNotification(basePending({ riskTier: 'high' }), 'inactive'),
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

  it('schedules run completed only when backgrounded and category enabled', () => {
    expect(shouldScheduleRunCompletedNotification('active')).toBe(false);
    expect(shouldScheduleRunCompletedNotification('inactive')).toBe(false);
    expect(shouldScheduleRunCompletedNotification('background')).toBe(true);
    expect(shouldScheduleRunCompletedNotification('background', false)).toBe(false);
  });

  it('schedules run progress only when backgrounded and category enabled', () => {
    expect(shouldScheduleRunProgressNotification('active')).toBe(false);
    expect(shouldScheduleRunProgressNotification('inactive')).toBe(false);
    expect(shouldScheduleRunProgressNotification('background')).toBe(true);
    expect(shouldScheduleRunProgressNotification('background', false)).toBe(false);
  });

  it('schedules approvals summary only when backgrounded and category enabled', () => {
    expect(shouldScheduleApprovalsSummaryNotification('active')).toBe(false);
    expect(shouldScheduleApprovalsSummaryNotification('inactive')).toBe(false);
    expect(shouldScheduleApprovalsSummaryNotification('background')).toBe(true);
    expect(shouldScheduleApprovalsSummaryNotification('background', false)).toBe(false);
  });

  it('never presents intrusive notifications in any app state', () => {
    expect(shouldPresentIntrusiveNotification('active')).toBe(false);
    expect(shouldPresentIntrusiveNotification('background')).toBe(false);
    expect(shouldPresentIntrusiveNotification('inactive')).toBe(false);
  });

  it('resolves handler presentation from app state', () => {
    expect(resolveHermesNotificationPresentation('active')).toEqual({
      shouldShowAlert: false,
      shouldShowBanner: false,
      shouldPlaySound: false,
      shouldSetBadge: true,
      shouldShowList: true,
    });
    expect(resolveHermesNotificationPresentation('background', { playSound: true })).toEqual({
      shouldShowAlert: false,
      shouldShowBanner: false,
      shouldPlaySound: false,
      shouldSetBadge: true,
      shouldShowList: true,
    });
  });
});
