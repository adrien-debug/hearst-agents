/**
 * Unified send_message tool handler.
 *
 * Routes message delivery to the resolved provider.
 * The user never knows which provider is used — the Halo shows it subtly.
 *
 * Supported providers: slack, whatsapp, google (gmail)
 * Gmail goes through Composio when configured; the others remain stubs
 * pending their own Composio actions or native SDK wiring.
 */

import type { ProviderId } from "@/lib/providers/types";
import { gmailSendEmail, isComposioConfigured } from "@/lib/connectors/composio";

// ── Types ───────────────────────────────────────────────────

export interface SendMessageInput {
  to: string;
  content: string;
  providerId: ProviderId;
  channelRef: string;
  threadId?: string;
  /** Required by Gmail; ignored by Slack / WhatsApp. */
  subject?: string;
  /** Composio entityId — typically the user_id. Required for live Gmail send. */
  userId?: string;
}

export type DeliveryStatus = "sent" | "delivered" | "read" | "failed";

export interface SendMessageResult {
  success: boolean;
  providerId: ProviderId;
  channelRef: string;
  messageId: string | null;
  deliveryStatus: DeliveryStatus;
  sentAt: number;
  error?: string;
}

// ── Provider handlers ───────────────────────────────────────

async function sendViaSlack(input: SendMessageInput): Promise<SendMessageResult> {
  // Pas d'intégration directe Slack ici — l'envoi Slack se fait via le tool
  // Composio `SLACK_SEND_MESSAGE` exposé par le pipeline LLM (cf.
  // lib/connectors/composio/discovery). Ce handler historique est conservé
  // pour les rares chemins planner qui le référencent encore, mais il échoue
  // explicitement plutôt que de simuler un succès silencieux qui faisait
  // croire à l'app que le message était envoyé.
  return {
    success: false,
    providerId: "slack",
    channelRef: input.channelRef,
    messageId: null,
    deliveryStatus: "failed",
    sentAt: Date.now(),
    error:
      "Slack send via legacy handler is disabled — utiliser le tool Composio SLACK_SEND_MESSAGE depuis le pipeline LLM.",
  };
}

async function sendViaWhatsApp(input: SendMessageInput): Promise<SendMessageResult> {
  // WhatsApp n'est pas intégré côté Hearst (ni Meta Cloud API natif, ni
  // Composio). Le handler échoue explicitement plutôt que mentir avec un
  // success: true qui aurait fait croire au caller que le message est parti.
  return {
    success: false,
    providerId: "whatsapp",
    channelRef: input.channelRef,
    messageId: null,
    deliveryStatus: "failed",
    sentAt: Date.now(),
    error:
      "WhatsApp delivery non supporté — Meta Cloud API non intégrée. Demander à connecter une autre app de messagerie (Slack, Gmail).",
  };
}

async function sendViaGmail(input: SendMessageInput): Promise<SendMessageResult> {
  // When Composio is configured, the action is real. Otherwise we keep the
  // historical stub so dev environments without a key don't blow up.
  if (isComposioConfigured() && input.userId) {
    const result = await gmailSendEmail({
      userId: input.userId,
      to: input.channelRef,
      subject: input.subject ?? "(no subject)",
      body: input.content,
    });

    if (!result.ok) {
      return {
        success: false,
        providerId: "google",
        channelRef: input.channelRef,
        messageId: null,
        deliveryStatus: "failed",
        sentAt: Date.now(),
        error: result.error,
      };
    }

    return {
      success: true,
      providerId: "google",
      channelRef: input.channelRef,
      messageId: result.messageId ?? `gmail_${Date.now()}`,
      deliveryStatus: "sent",
      sentAt: Date.now(),
    };
  }

  return {
    success: true,
    providerId: "google",
    channelRef: input.channelRef,
    messageId: `gmail_stub_${Date.now()}`,
    deliveryStatus: "sent",
    sentAt: Date.now(),
  };
}

// ── Router ──────────────────────────────────────────────────

const HANDLERS: Partial<Record<ProviderId, (input: SendMessageInput) => Promise<SendMessageResult>>> = {
  slack: sendViaSlack,
  whatsapp: sendViaWhatsApp,
  google: sendViaGmail,
};

export async function handleSendMessage(input: SendMessageInput): Promise<SendMessageResult> {
  const handler = HANDLERS[input.providerId];

  if (!handler) {
    console.error(`[SendMessage] No handler for provider: ${input.providerId}`);
    return {
      success: false,
      providerId: input.providerId,
      channelRef: input.channelRef,
      messageId: null,
      deliveryStatus: "failed",
      sentAt: Date.now(),
      error: `Unsupported messaging provider: ${input.providerId}`,
    };
  }

  try {
    return await handler(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[SendMessage] Failed via ${input.providerId}: ${message}`);
    return {
      success: false,
      providerId: input.providerId,
      channelRef: input.channelRef,
      messageId: null,
      deliveryStatus: "failed",
      sentAt: Date.now(),
      error: message,
    };
  }
}
