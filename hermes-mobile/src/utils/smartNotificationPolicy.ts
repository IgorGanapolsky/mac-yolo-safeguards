import { AppState } from 'react-native';
import type { PendingApproval } from '../types/gateway';
import { hasDiffContent } from './diffDisplay';

export type SmartNotificationAppState = 'active' | 'background' | 'inactive' | string;

function isBackgrounded(appState: SmartNotificationAppState): boolean {
  return appState === 'background';
}

/** Notify when app is not in foreground and approval alerts are enabled. */
export function shouldScheduleApprovalNotification(
  pending: PendingApproval,
  appState: SmartNotificationAppState = AppState.currentState,
  categoryEnabled = true,
): boolean {
  return categoryEnabled && isBackgrounded(appState);
}

export function shouldScheduleRunCompletedNotification(
  appState: SmartNotificationAppState = AppState.currentState,
  categoryEnabled = true,
): boolean {
  return categoryEnabled && isBackgrounded(appState);
}

/** Live run progress + stall watchdog notifications — background only. */
export function shouldScheduleRunProgressNotification(
  appState: SmartNotificationAppState = AppState.currentState,
  categoryEnabled = true,
): boolean {
  return categoryEnabled && isBackgrounded(appState);
}

/** Batch approval summary — background only (same bar as single approvals). */
export function shouldScheduleApprovalsSummaryNotification(
  appState: SmartNotificationAppState = AppState.currentState,
  categoryEnabled = true,
): boolean {
  return categoryEnabled && isBackgrounded(appState);
}

/**
 * Absolute-minimum heads-up policy:
 * - All run progress / stall / completion posts are shade-only (never peek).
 * - Only approval types may heads-up, and only when backgrounded + Settings enabled.
 */
export const SILENT_STATUS_NOTIFICATION_TYPES = new Set([
  'run_progress',
  'run_stall',
  'run_completed',
]);

export function isSilentStatusNotificationType(type: string | undefined): boolean {
  return typeof type === 'string' && SILENT_STATUS_NOTIFICATION_TYPES.has(type);
}

/**
 * Whether heads-up banners / sounds may interrupt the user.
 * Never while foregrounded; never for any run-status type (even in background).
 * Approvals may interrupt only when backgrounded.
 */
export function shouldPresentIntrusiveNotification(
  appState: SmartNotificationAppState = AppState.currentState,
  notificationType?: string,
): boolean {
  if (isSilentStatusNotificationType(notificationType)) {
    return false;
  }
  return appState === 'background';
}

export type HermesNotificationPresentation = {
  shouldShowAlert: boolean;
  shouldShowBanner: boolean;
  shouldPlaySound: boolean;
  shouldSetBadge: boolean;
  shouldShowList: boolean;
};

/**
 * expo-notifications handler shape.
 * Live run status never peeks; approvals may banner only when backgrounded.
 */
export function resolveHermesNotificationPresentation(
  appState: SmartNotificationAppState = AppState.currentState,
  options?: { playSound?: boolean; notificationType?: string },
): HermesNotificationPresentation {
  const intrusive = shouldPresentIntrusiveNotification(appState, options?.notificationType);
  return {
    shouldShowAlert: intrusive,
    shouldShowBanner: intrusive,
    shouldPlaySound: intrusive && (options?.playSound ?? false),
    shouldSetBadge: true,
    shouldShowList: true,
  };
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
