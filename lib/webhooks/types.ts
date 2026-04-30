/**
 * Types canoniques pour le système de webhooks custom.
 *
 * Les webhooks custom sont distincts des alertes signaux (lib/notifications) :
 * ils se déclenchent sur des événements produit (rapport généré, mission terminée, etc.)
 * et sont configurés directement par le tenant via l'API REST.
 */

export const WEBHOOK_EVENTS = [
  "report.generated",
  "report.exported",
  "report.shared",
  "mission.completed",
  "mission.failed",
  "signal.triggered",
  "asset.created",
  "asset.deleted",
  "comment.added",
  "auth.token_expiring",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export interface WebhookPayload {
  event: WebhookEvent | "test.ping";
  tenantId: string;
  timestamp: string; // ISO 8601
  data: Record<string, unknown>;
}

export interface CustomWebhook {
  id: string;
  tenantId: string;
  name: string;
  url: string;
  secret?: string;
  events: WebhookEvent[];
  active: boolean;
  createdAt: string;
  lastTriggeredAt?: string;
  lastStatus?: "success" | "failed";
}
