/**
 * Exports publics du module webhooks custom.
 *
 * Usage :
 *   import { dispatchWebhookEvent, WEBHOOK_EVENTS } from "@/lib/webhooks";
 */

export { WEBHOOK_EVENTS } from "./types";
export type { WebhookEvent, WebhookPayload, CustomWebhook } from "./types";

export {
  createWebhook,
  listWebhooks,
  getActiveWebhooksForEvent,
  updateWebhook,
  deleteWebhook,
  updateWebhookStatus,
  createWebhookSchema,
  updateWebhookSchema,
} from "./store";
export type { CreateWebhookInput, UpdateWebhookPatch } from "./store";

export { dispatchWebhookEvent, dispatchWebhookEventAsync, signPayload } from "./dispatcher";
