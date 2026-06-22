/** Re-export — canonical implementation in hermesNotifications.ts */
export {
  initHermesNotifications,
  initHermesNotifications as initApprovalNotifications,
  requestHermesNotificationPermission,
  requestHermesNotificationPermission as requestApprovalNotificationPermission,
  scheduleApprovalNotification,
  scheduleRunProgressNotification,
  scheduleRunProgressNotification as scheduleStatusNotification,
  clearRunProgressNotification,
  dismissHermesNotifications,
  dismissHermesNotifications as dismissApprovalNotifications,
  parseApprovalNotificationResponse,
  addApprovalNotificationResponseListener,
  type ApprovalNotificationAction,
} from './hermesNotifications';
