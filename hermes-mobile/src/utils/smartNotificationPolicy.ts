import { AppState } from 'react-native';
import type { PendingApproval } from '../types/gateway';
import { hasDiffContent } from './diffDisplay';

export type SmartNotificationAppState = 'active' | 'background' | 'inactive' | string;

/** Notify when app is not in foreground, or always for high-risk approvals. */
export function shouldScheduleApprovalNotification(
  pending: PendingApproval,
  appState: SmartNotificationAppState = AppState.currentState,
): boolean {
  if (pending.riskTier === 'high') {
    return appState !== 'active';
  }
  return appState === 'background' || appState === 'inactive';
}

export function shouldScheduleRunCompletedNotification(
  appState: SmartNotificationAppState = AppState.currentState,
): boolean {
  return appState !== 'active';
}

/** Live run progress + stall watchdog notifications — background only. */
export function shouldScheduleRunProgressNotification(
  appState: SmartNotificationAppState = AppState.currentState,
): boolean {
  return appState !== 'active';
}

export function approvalNotificationIdentifier(actionId: string): string {
  return `hermes-approval-${actionId}`;
}

export const APPROVALS_SUMMARY_NOTIFICATION_ID = 'hermes-approvals-summary';

export function approvalNotificationTitle(pending: PendingApproval): string {
  if (pending.riskTier === 'high') {
    return 'High-risk approval on your computer';
  }
  if (pending.sessionKey) {
    return 'Chat thread needs your approval';
  }
  return 'Approval needed on your computer';
}

export function buildApprovalNotificationBody(pending: PendingApproval): string {
  const lines: string[] = [];
  const command = pending.command?.trim();
  if (command) {
    lines.push(command.slice(0, 140));
  }
  if (hasDiffContent(pending.diff)) {
    const diffHint = pending.diff!
      .split('\n')
      .find(
        (line) =>
          (line.startsWith('+') && !line.startsWith('+++')) ||
          (line.startsWith('-') && !line.startsWith('---')),
      );
    if (diffHint) {
      lines.push(diffHint.trim().slice(0, 100));
    }
  }
  if (lines.length === 0) {
    lines.push((pending.reason || 'Open Hermes to review').slice(0, 160));
  }
  return lines.join('\n').slice(0, 220);
}

export function approvalsSummaryBody(pending: PendingApproval[]): string {
  const latest = pending[0];
  const preview = buildApprovalNotificationBody(latest);
  if (pending.length === 2) {
    return `2 waiting — ${preview}`;
  }
  return `${pending.length} waiting — ${preview}`;
}
