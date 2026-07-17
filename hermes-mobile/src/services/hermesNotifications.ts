import { isRunningInExpoGo } from 'expo';
import { AppState, Platform } from 'react-native';
import type { RunProgressState } from '../types/chatDisplay';
import type { PendingApproval } from '../types/gateway';
import {
  runCompletedNotificationBody,
  runProgressNotificationBody,
  runProgressNotificationTitleFromState,
} from '../utils/runNotificationCopy';
import {
  approvalNotificationIdentifier,
  approvalNotificationTitle,
  buildApprovalNotificationBody,
  approvalsSummaryBody,
  APPROVALS_SUMMARY_NOTIFICATION_ID,
  resolveHermesNotificationPresentation,
  shouldScheduleApprovalNotification,
  shouldScheduleApprovalsSummaryNotification,
  shouldScheduleRunCompletedNotification,
  shouldScheduleRunProgressNotification,
} from '../utils/smartNotificationPolicy';
import {
  cappedBadgeCount,
  pendingApprovalsSignature,
} from '../utils/pendingApprovalsCap';

type NotificationModule = typeof import('expo-notifications');
type NotificationContentInput = import('expo-notifications').NotificationContentInput;

let notificationsModule: NotificationModule | null = null;

const CATEGORY_APPROVAL = 'hermes_approval';
const CATEGORY_RUN = 'hermes_run';
const CHANNEL_APPROVALS = 'hermes-approvals';
/** @deprecated Device may retain DEFAULT/HIGH; do not post here — use CHANNEL_STATUS_V2. */
const CHANNEL_RUNS_LEGACY = 'hermes-runs';
/** @deprecated Device may retain DEFAULT; do not post here — use CHANNEL_RESULTS_V2. */
const CHANNEL_RESULTS_LEGACY = 'hermes-results';
/**
 * Fresh LOW channel — Android never downgrades existing channel importance, so
 * `hermes-runs` (historically DEFAULT) can still heads-up on content updates.
 */
export const CHANNEL_STATUS_V2 = 'hermes-status-v2';
export const CHANNEL_RESULTS_V2 = 'hermes-results-v2';
/** HIGH — reply-ready / stall transitions only (never tool-poll spam). */
export const CHANNEL_ALERTS_V2 = 'hermes-alerts-v2';
const RUN_STATUS_NOTIFICATION_ID = 'hermes-run-status';
const RUN_COMPLETED_NOTIFICATION_ID = 'hermes-run-completed';

const notifiedApprovalIds = new Set<string>();

const THREAD_APPROVALS = 'hermes.thread.approvals';
const THREAD_RUNS = 'hermes.thread.runs';
const NOTIFICATION_COLOR = '#6366F1';

let lastRunStatusAt = 0;
let lastRunStatusSignature = '';
let lastRunStatusPhase = '';
/** Hard ceiling on shade updates — never heads-up; keep shade quiet too. */
export const RUN_STATUS_MIN_INTERVAL_MS = 15_000;
/** Do not re-alert approval summary on every relay poll tick. */
export const APPROVALS_SUMMARY_MIN_INTERVAL_MS = 60_000;
let lastApprovalsSummarySignature = '';
let lastApprovalsSummaryAt = 0;
let lastApprovalsSummaryCount = 0;
let stallNotificationArmed = false;
let foregroundRunCleanupSub: { remove: () => void } | null = null;

/** Test/helper: status channels must be LOW (or MIN) — heads-up requires HIGH+. */
export function androidStatusChannelImportance(
  AndroidImportance: { LOW: number; MIN?: number; HIGH: number; DEFAULT: number },
): number {
  return AndroidImportance.LOW;
}

/** Test/helper: transition alert channel must be HIGH. */
export function androidAlertChannelImportance(
  AndroidImportance: { LOW: number; MIN?: number; HIGH: number; DEFAULT: number },
): number {
  return AndroidImportance.HIGH;
}

/** Stable signature for in-place sticky progress — skip identical tool-poll redraws. */
export function runProgressNotificationSignature(parts: {
  phase: string;
  title: string;
  body: string;
}): string {
  return `${parts.phase}\u0001${parts.title}\u0001${parts.body}`;
}

/**
 * Whether to rewrite the sticky ongoing notification.
 * Phase transitions always post; identical content never posts; else rate-limit.
 */
export function shouldPostStickyRunProgress(params: {
  nowMs: number;
  lastPostedAtMs: number;
  lastSignature: string;
  lastPhase: string;
  nextSignature: string;
  nextPhase: string;
  minIntervalMs?: number;
  force?: boolean;
}): boolean {
  if (params.nextSignature === params.lastSignature) {
    return false;
  }
  if (params.nextPhase !== params.lastPhase) {
    return true;
  }
  const minIntervalMs = params.minIntervalMs ?? RUN_STATUS_MIN_INTERVAL_MS;
  const floor = params.force ? Math.min(2_000, minIntervalMs) : minIntervalMs;
  return params.nowMs - params.lastPostedAtMs >= floor;
}

export type HermesNotificationTab = 'Chat' | 'Leash';

export type HermesNotificationAction =
  | { kind: 'approval'; actionId: string; runId?: string; choice: 'once' | 'deny' }
  | { kind: 'navigate'; tab: HermesNotificationTab; sessionId?: string }
  | { kind: 'stop_run'; runId?: string };

export type ApprovalNotificationAction = {
  actionId: string;
  runId?: string;
  choice: 'once' | 'deny';
};

async function loadNotifications(): Promise<NotificationModule | null> {
  if (Platform.OS === 'web') {
    return null;
  }
  // expo-notifications throws synchronously at import time on Android Expo Go
  // (push notifications were removed from Expo Go in SDK 53). Gate before load.
  if (Platform.OS === 'android' && isRunningInExpoGo()) {
    return null;
  }
  if (!notificationsModule) {
    try {
      // require() (not dynamic import) so Jest can mock without --experimental-vm-modules.
      // Safe after the Expo Go gate above.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      notificationsModule = require('expo-notifications') as NotificationModule;
    } catch {
      return null;
    }
  }
  return notificationsModule;
}

function notificationData(response: unknown): Record<string, unknown> | undefined {
  if (!response || typeof response !== 'object') {
    return undefined;
  }
  const typed = response as {
    notification?: { request?: { content?: { data?: Record<string, unknown> } } };
  };
  return typed.notification?.request?.content?.data;
}

function actionIdentifier(response: unknown): string | undefined {
  if (!response || typeof response !== 'object') {
    return undefined;
  }
  const id = (response as { actionIdentifier?: string }).actionIdentifier;
  return typeof id === 'string' ? id : undefined;
}

export function approvalNotificationSubtitle(pending: PendingApproval): string {
  const tier =
    pending.riskTier === 'high'
      ? 'High risk'
      : pending.riskTier === 'medium'
        ? 'Medium risk'
        : pending.riskTier === 'low'
          ? 'Low risk'
          : undefined;
  const kind = pending.command
    ? 'Shell command'
    : pending.toolName?.trim()
      ? pending.toolName.trim()
      : 'Gateway action';
  return tier ? `${tier} · ${kind}` : kind;
}

export function runProgressNotificationTitle(progress: RunProgressState): string {
  return runProgressNotificationTitleFromState({
    phase: progress.phase,
    detail: progress.detail,
    replySnippet: progress.replyPreview,
  });
}

export function shouldDismissRunNotificationsForAppState(appState: string): boolean {
  return appState === 'active';
}

export function resolveHermesNotificationHandlerResult(
  notification: { request: { content: { data?: Record<string, unknown> } } },
  appState: string = AppState.currentState,
) {
  const data = notification.request.content.data;
  const type = typeof data?.type === 'string' ? data.type : '';
  const playSound =
    type === 'approval' ||
    type === 'approval_summary' ||
    type === 'run_completed' ||
    type === 'run_stall';
  return resolveHermesNotificationPresentation(appState, {
    playSound,
    notificationType: type,
  });
}

/** Cancel sticky run-status + stall notifications (safe when backgrounded). */
export async function dismissActiveRunNotifications(): Promise<void> {
  await clearRunProgressNotification();
  await cancelRunStallNotification();
}

export function parseHermesNotificationResponse(response: unknown): HermesNotificationAction | null {
  const action = actionIdentifier(response);
  const data = notificationData(response);
  const sessionId =
    typeof data?.sessionId === 'string' && data.sessionId.trim()
      ? data.sessionId.trim()
      : typeof data?.sessionKey === 'string' && data.sessionKey.trim()
        ? data.sessionKey.trim()
        : undefined;
  const notificationType = typeof data?.type === 'string' ? data.type : '';

  if (action === 'view_chat') {
    return { kind: 'navigate', tab: 'Chat', sessionId };
  }
  if (action === 'view_approvals') {
    return { kind: 'navigate', tab: 'Leash' };
  }
  if (action === 'stop_run') {
    const runId = typeof data?.runId === 'string' ? data.runId : undefined;
    return { kind: 'stop_run', runId };
  }

  if (action === 'approve_once') {
    const actionId = data?.actionId;
    if (typeof actionId !== 'string' || !actionId) {
      return null;
    }
    const runId = typeof data?.runId === 'string' ? data.runId : undefined;
    return { kind: 'approval', actionId, runId, choice: 'once' };
  }
  if (action === 'deny') {
    const actionId = data?.actionId;
    if (typeof actionId !== 'string' || !actionId) {
      return null;
    }
    const runId = typeof data?.runId === 'string' ? data.runId : undefined;
    return { kind: 'approval', actionId, runId, choice: 'deny' };
  }

  if (!action || action === 'expo.modules.notifications.actions.DEFAULT') {
    if (notificationType === 'approval' || notificationType === 'approval_summary') {
      return {
        kind: 'navigate',
        tab: sessionId ? 'Chat' : 'Leash',
        sessionId,
      };
    }
    if (
      notificationType === 'run_completed' ||
      notificationType === 'run_progress' ||
      notificationType === 'run_stall'
    ) {
      return { kind: 'navigate', tab: 'Chat', sessionId };
    }
  }

  const actionId = data?.actionId;
  if (typeof actionId !== 'string' || !actionId) {
    return null;
  }
  const runId = typeof data?.runId === 'string' ? data.runId : undefined;

  return null;
}

export function parseApprovalNotificationResponse(
  response: unknown,
): ApprovalNotificationAction | null {
  const parsed = parseHermesNotificationResponse(response);
  if (!parsed || parsed.kind !== 'approval') {
    return null;
  }
  return {
    actionId: parsed.actionId,
    runId: parsed.runId,
    choice: parsed.choice,
  };
}

export async function initHermesNotifications(): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications) {
    return;
  }

  if (!foregroundRunCleanupSub) {
    foregroundRunCleanupSub = AppState.addEventListener('change', (nextAppState) => {
      if (shouldDismissRunNotificationsForAppState(nextAppState)) {
        dismissActiveRunNotifications().catch(() => {});
      }
    });
  }

  if (shouldDismissRunNotificationsForAppState(AppState.currentState)) {
    await dismissActiveRunNotifications();
  }

  Notifications.setNotificationHandler({
    handleNotification: async (notification) =>
      resolveHermesNotificationHandlerResult(notification, AppState.currentState),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_APPROVALS, {
      name: 'Approvals',
      description: 'Urgent Hermes approvals with Approve and Deny actions',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 220, 120, 220],
      lightColor: NOTIFICATION_COLOR,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
    });
    // New ids — Android refuses to downgrade hermes-runs / hermes-results importance.
    await Notifications.setNotificationChannelAsync(CHANNEL_STATUS_V2, {
      name: 'Live run status (quiet)',
      description: 'Silent status-bar updates while Hermes works — never heads-up',
      importance: androidStatusChannelImportance(Notifications.AndroidImportance),
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      enableVibrate: false,
      showBadge: false,
    });
    await Notifications.setNotificationChannelAsync(CHANNEL_RESULTS_V2, {
      name: 'Completion / stall (quiet legacy)',
      description: 'Deprecated quiet shade — transition alerts use hermes-alerts-v2',
      importance: androidStatusChannelImportance(Notifications.AndroidImportance),
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      enableVibrate: false,
      showBadge: false,
    });
    await Notifications.setNotificationChannelAsync(CHANNEL_ALERTS_V2, {
      name: 'Reply ready / needs attention',
      description: 'Heads-up when Hermes finishes, stalls, or needs you — not every tool update',
      importance: androidAlertChannelImportance(Notifications.AndroidImportance),
      vibrationPattern: [0, 180, 100, 180],
      lightColor: NOTIFICATION_COLOR,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      enableVibrate: true,
      showBadge: true,
    });
    // Keep legacy channel names registered as LOW for any stale posts; cannot lower if already higher.
    await Notifications.setNotificationChannelAsync(CHANNEL_RUNS_LEGACY, {
      name: 'Live run status (legacy)',
      description: 'Deprecated — use quiet status channel',
      importance: Notifications.AndroidImportance.LOW,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    await Notifications.setNotificationChannelAsync(CHANNEL_RESULTS_LEGACY, {
      name: 'Completion / failure (legacy)',
      description: 'Deprecated — use quiet results channel',
      importance: Notifications.AndroidImportance.LOW,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  await Notifications.setNotificationCategoryAsync(CATEGORY_APPROVAL, [
    {
      identifier: 'approve_once',
      buttonTitle: 'Approve once',
      options: { opensAppToForeground: true },
    },
    {
      identifier: 'deny',
      buttonTitle: 'Deny',
      options: { opensAppToForeground: true },
    },
    {
      identifier: 'view_approvals',
      buttonTitle: 'Open approvals',
      options: { opensAppToForeground: true },
    },
  ]);

  await Notifications.setNotificationCategoryAsync(CATEGORY_RUN, [
    {
      identifier: 'stop_run',
      buttonTitle: 'Stop Run',
      options: { opensAppToForeground: true },
    },
    {
      identifier: 'view_chat',
      buttonTitle: 'Open chat',
      options: { opensAppToForeground: true },
    },
  ]);
}

/** @deprecated use initHermesNotifications */
export const initApprovalNotifications = initHermesNotifications;

export async function requestHermesNotificationPermission(): Promise<boolean> {
  const Notifications = await loadNotifications();
  if (!Notifications) {
    return false;
  }
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) {
    return true;
  }
  const requested = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });
  return requested.granted ?? false;
}

/** @deprecated */
export const requestApprovalNotificationPermission = requestHermesNotificationPermission;

export async function syncHermesNotificationBadge(count: number): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications) {
    return;
  }
  try {
    await Notifications.setBadgeCountAsync(cappedBadgeCount(count));
  } catch {
    /* badge unsupported on some Android launchers */
  }
}

export async function scheduleApprovalNotification(
  pending: PendingApproval,
  options?: { badgeCount?: number; force?: boolean; categoryEnabled?: boolean },
): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications) {
    return;
  }

  const appState = AppState.currentState;
  if (
    !options?.force &&
    !shouldScheduleApprovalNotification(pending, appState, options?.categoryEnabled ?? true)
  ) {
    return;
  }

  if (notifiedApprovalIds.has(pending.actionId)) {
    return;
  }

  const granted = await requestHermesNotificationPermission();
  if (!granted) {
    return;
  }

  notifiedApprovalIds.add(pending.actionId);

  const sessionId = pending.sessionKey?.trim() || undefined;
  const badge = cappedBadgeCount(options?.badgeCount ?? 1);

  await Notifications.scheduleNotificationAsync({
    identifier: approvalNotificationIdentifier(pending.actionId),
    content: {
      title: approvalNotificationTitle(pending),
      subtitle: approvalNotificationSubtitle(pending),
      body: buildApprovalNotificationBody(pending),
      categoryIdentifier: CATEGORY_APPROVAL,
      sound: 'default',
      badge,
      threadIdentifier: THREAD_APPROVALS,
      ...(Platform.OS === 'ios' ? { interruptionLevel: 'timeSensitive' as const } : {}),
      ...(Platform.OS === 'android'
        ? {
            channelId: CHANNEL_APPROVALS,
            color: NOTIFICATION_COLOR,
            priority: Notifications.AndroidNotificationPriority.HIGH,
          }
        : {}),
      data: {
        actionId: pending.actionId,
        runId: pending.runId,
        sessionId,
        sessionKey: sessionId,
        type: 'approval',
        riskTier: pending.riskTier,
      },
    } as NotificationContentInput,
    trigger: null,
  });
}

export async function scheduleApprovalsSummaryNotification(
  pending: PendingApproval[],
  options?: { badgeCount?: number; categoryEnabled?: boolean; force?: boolean },
): Promise<void> {
  if (pending.length < 2) {
    lastApprovalsSummarySignature = '';
    lastApprovalsSummaryCount = 0;
    await dismissApprovalsSummaryNotification();
    return;
  }

  const Notifications = await loadNotifications();
  if (!Notifications) {
    return;
  }

  if (!shouldScheduleApprovalsSummaryNotification(AppState.currentState, options?.categoryEnabled ?? true)) {
    return;
  }

  const signature = pendingApprovalsSignature(pending);
  const now = Date.now();
  const sameSet = signature === lastApprovalsSummarySignature;
  if (
    !options?.force &&
    sameSet &&
    now - lastApprovalsSummaryAt < APPROVALS_SUMMARY_MIN_INTERVAL_MS
  ) {
    // Relay poll / WS reconnect must not re-fire the same summary every tick.
    return;
  }

  const granted = await requestHermesNotificationPermission();
  if (!granted) {
    return;
  }

  const latest = pending[0];
  const sessionId = latest.sessionKey?.trim() || undefined;
  const badge = cappedBadgeCount(options?.badgeCount ?? pending.length);
  const countGrew = pending.length > lastApprovalsSummaryCount;
  const isNewSet = !sameSet;
  // Only alert when the pending set actually changed or grew — never on poll refresh.
  const shouldAlert = options?.force || isNewSet || countGrew;
  const titleCount =
    pending.length > 99 ? '99+' : String(pending.length);

  lastApprovalsSummarySignature = signature;
  lastApprovalsSummaryAt = now;
  lastApprovalsSummaryCount = pending.length;

  await Notifications.scheduleNotificationAsync({
    identifier: APPROVALS_SUMMARY_NOTIFICATION_ID,
    content: {
      title: `${titleCount} approvals waiting`,
      subtitle: approvalNotificationSubtitle(latest),
      body: approvalsSummaryBody(pending),
      categoryIdentifier: CATEGORY_APPROVAL,
      ...(shouldAlert ? { sound: 'default' as const } : {}),
      badge,
      threadIdentifier: THREAD_APPROVALS,
      ...(Platform.OS === 'ios' && shouldAlert
        ? { interruptionLevel: 'timeSensitive' as const }
        : {}),
      ...(Platform.OS === 'android'
        ? {
            channelId: CHANNEL_APPROVALS,
            color: NOTIFICATION_COLOR,
            priority: shouldAlert
              ? Notifications.AndroidNotificationPriority.HIGH
              : Notifications.AndroidNotificationPriority.LOW,
          }
        : {}),
      data: {
        actionId: latest.actionId,
        runId: latest.runId,
        sessionId,
        sessionKey: sessionId,
        type: 'approval_summary',
        count: pending.length,
      },
    } as NotificationContentInput,
    trigger: null,
  });
}

export async function dismissApprovalNotification(actionId: string): Promise<void> {
  notifiedApprovalIds.delete(actionId);
  const Notifications = await loadNotifications();
  if (!Notifications) {
    return;
  }
  const identifier = approvalNotificationIdentifier(actionId);
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
    await Notifications.dismissNotificationAsync(identifier);
  } catch {
    /* ignore */
  }
}

export async function dismissApprovalsSummaryNotification(): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications) {
    return;
  }
  try {
    await Notifications.cancelScheduledNotificationAsync(APPROVALS_SUMMARY_NOTIFICATION_ID);
    await Notifications.dismissNotificationAsync(APPROVALS_SUMMARY_NOTIFICATION_ID);
  } catch {
    /* ignore */
  }
}

/** Dismiss stale approval notifications and refresh batch summary. */
export async function syncSmartApprovalNotifications(
  pending: PendingApproval[],
  options?: { badgeCount?: number; categoryEnabled?: boolean },
): Promise<void> {
  const activeIds = new Set(pending.map((item) => item.actionId));
  for (const id of [...notifiedApprovalIds]) {
    if (!activeIds.has(id)) {
      await dismissApprovalNotification(id);
    }
  }

  const badge = cappedBadgeCount(options?.badgeCount ?? pending.length);
  if (pending.length >= 2) {
    await scheduleApprovalsSummaryNotification(pending, {
      badgeCount: badge,
      categoryEnabled: options?.categoryEnabled,
    });
  } else {
    lastApprovalsSummarySignature = '';
    lastApprovalsSummaryCount = 0;
    await dismissApprovalsSummaryNotification();
  }
}

export function resetApprovalNotificationState(): void {
  notifiedApprovalIds.clear();
  lastApprovalsSummarySignature = '';
  lastApprovalsSummaryAt = 0;
  lastApprovalsSummaryCount = 0;
}

/** Throttled live-activity style notification for background run progress. */
export async function scheduleRunProgressNotification(
  progress: RunProgressState,
  options?: {
    runId?: string;
    sessionId?: string;
    force?: boolean;
    categoryEnabled?: boolean;
    replySnippet?: string;
  },
): Promise<void> {
  if (!shouldScheduleRunProgressNotification(AppState.currentState, options?.categoryEnabled ?? true)) {
    return;
  }

  const Notifications = await loadNotifications();
  if (!Notifications) {
    return;
  }

  const granted = await requestHermesNotificationPermission();
  if (!granted) {
    return;
  }

  const replySnippet = options?.replySnippet ?? progress.replyPreview;
  const body = runProgressNotificationBody({
    phase: progress.phase,
    detail: progress.detail,
    replySnippet,
  });
  const title = runProgressNotificationTitleFromState({
    phase: progress.phase,
    detail: progress.detail,
    replySnippet,
  });
  const phase = String(progress.phase ?? '');
  const signature = runProgressNotificationSignature({ phase, title, body });
  const now = Date.now();
  // Same identifier → in-place update. Skip identical tool polls; phase changes always rewrite.
  if (
    !shouldPostStickyRunProgress({
      nowMs: now,
      lastPostedAtMs: lastRunStatusAt,
      lastSignature: lastRunStatusSignature,
      lastPhase: lastRunStatusPhase,
      nextSignature: signature,
      nextPhase: phase,
      force: options?.force,
    })
  ) {
    return;
  }
  lastRunStatusAt = now;
  lastRunStatusSignature = signature;
  lastRunStatusPhase = phase;

  // Same identifier → in-place update. Do not cancel+recreate (retriggers heads-up).
  await Notifications.scheduleNotificationAsync({
    identifier: RUN_STATUS_NOTIFICATION_ID,
    content: {
      title,
      subtitle: 'Computer',
      body,
      categoryIdentifier: CATEGORY_RUN,
      threadIdentifier: THREAD_RUNS,
      ...(Platform.OS === 'ios'
        ? { interruptionLevel: 'passive' as const, sound: false }
        : {}),
      ...(Platform.OS === 'android'
        ? {
            channelId: CHANNEL_STATUS_V2,
            color: NOTIFICATION_COLOR,
            priority: Notifications.AndroidNotificationPriority.LOW,
            sticky: true,
            autoDismiss: false,
          }
        : {}),
      data: {
        type: 'run_progress',
        runId: options?.runId ?? progress.runId,
        sessionId: options?.sessionId ?? progress.sessionId,
        phase: progress.phase,
      },
    } as NotificationContentInput,
    trigger: null,
  });
}

export async function scheduleRunCompletedNotification(
  detail: string,
  options?: {
    success?: boolean;
    runId?: string;
    sessionId?: string;
    categoryEnabled?: boolean;
    replySnippet?: string;
  },
): Promise<void> {
  if (!shouldScheduleRunCompletedNotification(AppState.currentState, options?.categoryEnabled ?? true)) {
    return;
  }

  const Notifications = await loadNotifications();
  if (!Notifications) {
    return;
  }

  const granted = await requestHermesNotificationPermission();
  if (!granted) {
    return;
  }

  await clearRunProgressNotification();

  const success = options?.success ?? true;
  const body = runCompletedNotificationBody(detail, {
    success,
    replySnippet: options?.replySnippet,
  });
  const hasReplyText =
    Boolean(options?.replySnippet?.trim()) ||
    (Boolean(detail?.trim()) &&
      !/reply ready/i.test(detail) &&
      detail.trim().length > 24 &&
      success);
  const title = success ? (hasReplyText ? 'Hermes replied' : 'Hermes finished') : 'Hermes run stopped';

  // Transition heads-up (Uber-style "arrived") — HIGH channel, once per completion.
  await Notifications.scheduleNotificationAsync({
    identifier: RUN_COMPLETED_NOTIFICATION_ID,
    content: {
      title,
      subtitle: success ? 'Reply received' : 'Check chat for details',
      body,
      categoryIdentifier: CATEGORY_RUN,
      threadIdentifier: THREAD_RUNS,
      sound: 'default',
      ...(Platform.OS === 'ios'
        ? { interruptionLevel: 'timeSensitive' as const }
        : {}),
      ...(Platform.OS === 'android'
        ? {
            channelId: CHANNEL_ALERTS_V2,
            color: NOTIFICATION_COLOR,
            priority: Notifications.AndroidNotificationPriority.HIGH,
          }
        : {}),
      data: {
        type: 'run_completed',
        runId: options?.runId,
        sessionId: options?.sessionId,
        success,
      },
    } as NotificationContentInput,
    trigger: null,
  });
}

export async function clearRunProgressNotification(): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications) {
    return;
  }
  try {
    await Notifications.cancelScheduledNotificationAsync(RUN_STATUS_NOTIFICATION_ID);
    await Notifications.dismissNotificationAsync(RUN_STATUS_NOTIFICATION_ID);
  } catch {
    /* ignore */
  }
  lastRunStatusAt = 0;
  lastRunStatusSignature = '';
  lastRunStatusPhase = '';
}

export const RUN_STALL_NOTIFICATION_ID = 'hermes-run-stall';

export async function scheduleRunStallNotification(
  runId?: string,
  sessionId?: string,
  options?: { categoryEnabled?: boolean },
): Promise<void> {
  if (!shouldScheduleRunProgressNotification(AppState.currentState, options?.categoryEnabled ?? true)) {
    await cancelRunStallNotification();
    return;
  }

  // Do not cancel+reschedule on every stream token — that can re-alert.
  if (stallNotificationArmed) {
    return;
  }

  const Notifications = await loadNotifications();
  if (!Notifications) {
    return;
  }

  const granted = await requestHermesNotificationPermission();
  if (!granted) {
    return;
  }

  stallNotificationArmed = true;
  // Transition heads-up once when the stall timer fires — not on every stream token.
  await Notifications.scheduleNotificationAsync({
    identifier: RUN_STALL_NOTIFICATION_ID,
    content: {
      title: 'Hermes run might be stalled',
      subtitle: 'Computer · warning',
      body: 'No updates from your computer for 45 seconds. Open chat or stop the run.',
      categoryIdentifier: CATEGORY_RUN,
      threadIdentifier: THREAD_RUNS,
      sound: 'default',
      ...(Platform.OS === 'ios'
        ? { interruptionLevel: 'timeSensitive' as const }
        : {}),
      ...(Platform.OS === 'android'
        ? {
            channelId: CHANNEL_ALERTS_V2,
            color: NOTIFICATION_COLOR,
            priority: Notifications.AndroidNotificationPriority.HIGH,
          }
        : {}),
      data: {
        type: 'run_stall',
        runId,
        sessionId,
      },
    } as NotificationContentInput,
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 45,
      repeats: false,
    },
  });
}

export async function cancelRunStallNotification(): Promise<void> {
  stallNotificationArmed = false;
  const Notifications = await loadNotifications();
  if (!Notifications) {
    return;
  }
  try {
    await Notifications.cancelScheduledNotificationAsync(RUN_STALL_NOTIFICATION_ID);
    await Notifications.dismissNotificationAsync(RUN_STALL_NOTIFICATION_ID);
  } catch {
    /* ignore */
  }
}

export async function dismissHermesNotifications(): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications) {
    return;
  }
  await Notifications.dismissAllNotificationsAsync();
}

/** @deprecated */
export const dismissApprovalNotifications = dismissHermesNotifications;

export async function addApprovalNotificationResponseListener(
  onResponse: (response: unknown) => Promise<void>,
): Promise<{ remove: () => void } | null> {
  const Notifications = await loadNotifications();
  if (!Notifications) {
    return null;
  }
  const subscription = Notifications.addNotificationResponseReceivedListener(onResponse);
  return {
    remove: () => subscription.remove(),
  };
}
