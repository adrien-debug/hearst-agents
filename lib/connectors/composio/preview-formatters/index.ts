/**
 * Preview Formatters Registry — mapping action_name → formatter custom.
 *
 * Avant ce module, tous les writes Composio étaient previewés via le
 * `formatActionPreview` générique de `write-guard.ts` qui dump les args en
 * JSON brut. Pour les actions top 10 (Gmail, Slack, Notion, Linear,
 * Calendar, HubSpot, Stripe, Asana, Trello, Airtable, WhatsApp), on
 * surcharge avec un format dédié plus lisible côté UI.
 *
 * Le `to-ai-tools.ts` consulte ce registry : si une entrée existe pour
 * l'action en cours → utilise le formatter, sinon → retombe sur le
 * generic `formatActionPreview`.
 */

import { formatGmailSendEmail, formatGmailReply } from "./gmail";
import { formatSlackSendMessage } from "./slack";
import { formatNotionCreatePage } from "./notion";
import { formatLinearCreateIssue } from "./linear";
import { formatCalendarCreateEvent } from "./googlecalendar";
import { formatHubspotCreateContact, formatHubspotUpdateDeal } from "./hubspot";
import { formatStripeCreateInvoice, formatStripeRefund } from "./stripe";
import { formatAsanaCreateTask } from "./asana";
import { formatTrelloCreateCard } from "./trello";
import { formatAirtableCreateRecord } from "./airtable";
import { formatWhatsappSendMessage } from "./whatsapp";

export type PreviewFormatter = (args: Record<string, unknown>) => string;

/**
 * Registry — clés = action names Composio canoniques (UPPER_SNAKE).
 *
 * On enregistre TOUS les alias canoniques courants (ex: GMAIL_SEND_EMAIL +
 * GMAIL_SEND_MAIL — Composio change parfois la nomenclature). La résolution
 * `getFormatterForAction` matche d'abord par nom exact, puis fait un
 * matching plus permissif (préfixe APP + segment d'action).
 */
const REGISTRY: Record<string, PreviewFormatter> = {
  // Gmail
  GMAIL_SEND_EMAIL: formatGmailSendEmail,
  GMAIL_SEND_MAIL: formatGmailSendEmail,
  GMAIL_REPLY_TO_EMAIL: formatGmailReply,
  GMAIL_SEND_EMAIL_REPLY: formatGmailReply,

  // Slack
  SLACK_SEND_MESSAGE: formatSlackSendMessage,
  SLACK_CHAT_POST_MESSAGE: formatSlackSendMessage,
  SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL: formatSlackSendMessage,

  // Notion
  NOTION_CREATE_PAGE: formatNotionCreatePage,
  NOTION_PAGES_CREATE: formatNotionCreatePage,
  NOTION_CREATE_DATABASE_ITEM: formatNotionCreatePage,

  // Linear
  LINEAR_CREATE_ISSUE: formatLinearCreateIssue,
  LINEAR_ISSUE_CREATE: formatLinearCreateIssue,
  LINEAR_CREATE_LINEAR_ISSUE: formatLinearCreateIssue,

  // Google Calendar
  GOOGLECALENDAR_CREATE_EVENT: formatCalendarCreateEvent,
  GOOGLECALENDAR_EVENTS_INSERT: formatCalendarCreateEvent,
  GOOGLECALENDAR_QUICK_ADD: formatCalendarCreateEvent,
  GOOGLE_CALENDAR_CREATE_EVENT: formatCalendarCreateEvent,

  // HubSpot
  HUBSPOT_CREATE_CONTACT: formatHubspotCreateContact,
  HUBSPOT_CONTACTS_CREATE: formatHubspotCreateContact,
  HUBSPOT_UPDATE_DEAL: formatHubspotUpdateDeal,
  HUBSPOT_DEALS_UPDATE: formatHubspotUpdateDeal,

  // Stripe
  STRIPE_CREATE_INVOICE: formatStripeCreateInvoice,
  STRIPE_INVOICES_CREATE: formatStripeCreateInvoice,
  STRIPE_REFUND: formatStripeRefund,
  STRIPE_REFUNDS_CREATE: formatStripeRefund,
  STRIPE_CREATE_REFUND: formatStripeRefund,

  // Asana
  ASANA_CREATE_TASK: formatAsanaCreateTask,
  ASANA_TASKS_CREATE: formatAsanaCreateTask,

  // Trello
  TRELLO_CREATE_CARD: formatTrelloCreateCard,
  TRELLO_CARDS_CREATE: formatTrelloCreateCard,

  // Airtable
  AIRTABLE_CREATE_RECORD: formatAirtableCreateRecord,
  AIRTABLE_RECORDS_CREATE: formatAirtableCreateRecord,

  // WhatsApp
  WHATSAPP_SEND_MESSAGE: formatWhatsappSendMessage,
  WHATSAPP_MESSAGES_SEND: formatWhatsappSendMessage,
};

/**
 * Cherche un formatter pour une action. Retourne `null` si aucun match
 * → le caller retombe sur le generic `formatActionPreview`.
 *
 * Stratégie de matching :
 *  1. Match exact (canonical key)
 *  2. Match par fragments (APP + verbe + objet) — couvre les variantes
 *     de nomenclature Composio (CREATE_X / X_CREATE / CREATE_NEW_X).
 */
export function getFormatterForAction(actionName: string): PreviewFormatter | null {
  const upper = actionName.toUpperCase();
  const exact = REGISTRY[upper];
  if (exact) return exact;

  // Fallback : matching par fragments
  for (const [key, fn] of Object.entries(REGISTRY)) {
    if (sameAppAndVerbObject(upper, key)) return fn;
  }
  return null;
}

function sameAppAndVerbObject(a: string, b: string): boolean {
  const partsA = a.split("_");
  const partsB = b.split("_");
  // App slug = premier segment
  if (partsA[0] !== partsB[0]) return false;

  // Vérifie qu'il y a au moins 2 segments d'action en commun (ex:
  // SEND/MESSAGE, CREATE/EVENT, CREATE/PAGE).
  const restA = new Set(partsA.slice(1));
  const restB = partsB.slice(1);
  const overlap = restB.filter((p) => restA.has(p));
  return overlap.length >= 2;
}

/** Liste les actions enregistrées (pour debug + tests). */
export function listRegisteredActions(): string[] {
  return Object.keys(REGISTRY);
}

// Re-exports
export {
  formatGmailSendEmail,
  formatGmailReply,
  formatSlackSendMessage,
  formatNotionCreatePage,
  formatLinearCreateIssue,
  formatCalendarCreateEvent,
  formatHubspotCreateContact,
  formatHubspotUpdateDeal,
  formatStripeCreateInvoice,
  formatStripeRefund,
  formatAsanaCreateTask,
  formatTrelloCreateCard,
  formatAirtableCreateRecord,
  formatWhatsappSendMessage,
};
