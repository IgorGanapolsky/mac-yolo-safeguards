import { AppState } from 'react-native';
import type { PendingApproval } from '../types/gateway';

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
  return categoryEnabled && isBackgrounded(appState) && Boolean(pending.approvalIntegrity);
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

/** Status / progress / stall — never heads-up; shade/status-bar only. */
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
 * Never while foregrounded; never for live-status types (even in background).
 */
export function shouldPresentIntrusiveNotification(
  appState: SmartNotificationAppState = AppState.currentState,
  notificationType?: string,
): boolean {
  if (isSilentStatusNotificationType(notificationType)) {
    return false;
  }
  return appState !== 'active';
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
  return pending.approvalIntegrity?.review_required_on_computer
    ? 'Sensitive details hidden. Review this exact call on your computer.'
    : 'Open Hermes to review the exact tool call before deciding.';
}

export function approvalsSummaryBody(pending: PendingApproval[]): string {
  const latest = pending[0];
  const preview = buildApprovalNotificationBody(latest);
  if (pending.length === 2) {
    return `2 waiting — ${preview}`;
  }
  return `${pending.length} waiting — ${preview}`;
}
