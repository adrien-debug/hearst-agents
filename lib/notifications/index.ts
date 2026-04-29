/**
 * Public API du module alerting + notifications in-app.
 */

export {
  dispatchAlerts,
  loadAlertingPreferences,
  saveAlertingPreferences,
  type DispatchAlertsInput,
  type DispatchAlertsResult,
} from "./alert-dispatcher";

export {
  alertingPreferencesSchema,
  parseAlertingPreferences,
  ALERTING_PREFERENCES_SETTING_KEY,
  DEFAULT_ALERTING_PREFERENCES,
  type AlertingPreferences,
  type WebhookChannelConfig,
  type EmailChannelConfig,
  type SlackChannelConfig,
} from "./schema";

export {
  setEmailSender,
  getEmailSender,
  type EmailSender,
  type EmailMessage,
  type AlertContext,
  type AlertWebhookPayload,
  type ChannelResult,
  CHANNEL_HTTP_TIMEOUT_MS,
} from "./channels";

export {
  THROTTLE_WINDOW_MS,
  type ThrottleStore,
} from "./throttle";

export {
  createNotification,
  listNotifications,
  markRead,
  markAllRead,
  formatSignalTitle,
  NotificationKindSchema,
  NotificationSeveritySchema,
  NotificationSchema,
  type Notification,
  type NotificationKind,
  type NotificationSeverity,
  type CreateNotificationInput,
  type ListNotificationsInput,
} from "./in-app";
