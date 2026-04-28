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
  // TODO: integrate with Slack Web API (chat.postMessage)
  return {
    success: true,
    providerId: "slack",
    channelRef: input.channelRef,
    messageId: `slack_${Date.now()}`,
    deliveryStatus: "sent",
    sentAt: Date.now(),
  };
}

async function sendViaWhatsApp(input: SendMessageInput): Promise<SendMessageResult> {
  // TODO: integrate with Meta Cloud API (messages endpoint)
  // POST https://graph.facebook.com/v18.0/{phone-number-id}/messages
  return {
    success: true,
    providerId: "whatsapp",
    channelRef: input.channelRef,
    messageId: `wa_${Date.now()}`,
    deliveryStatus: "sent",
    sentAt: Date.now(),
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
