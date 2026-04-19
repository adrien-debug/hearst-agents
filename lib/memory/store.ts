/**
 * Conversation Memory — store.
 *
 * In-memory store with bounded message windows per conversation.
 * Tenant-scoped: memory is never shared across tenants.
 */

import type { TenantScope } from "@/lib/multi-tenant/types";
import type { ChatMessageMemory, ConversationMemory } from "./types";

const MAX_MESSAGES_PER_CONVERSATION = 24;

const conversations: Map<string, ConversationMemory> = new Map();

export function getConversationMemory(
  conversationId: string,
): ConversationMemory | null {
  return conversations.get(conversationId) ?? null;
}

export function appendMessage(
  conversationId: string,
  message: ChatMessageMemory,
  scope: TenantScope,
): void {
  let conv = conversations.get(conversationId);

  if (conv) {
    if (conv.tenantId !== scope.tenantId || conv.workspaceId !== scope.workspaceId) {
      console.error("[Memory] tenant mismatch — refusing to append");
      return;
    }
  } else {
    conv = {
      conversationId,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      userId: scope.userId,
      messages: [],
      updatedAt: Date.now(),
    };
    conversations.set(conversationId, conv);
  }

  conv.messages.push(message);
  conv.updatedAt = Date.now();

  if (conv.messages.length > MAX_MESSAGES_PER_CONVERSATION) {
    conv.messages = conv.messages.slice(-MAX_MESSAGES_PER_CONVERSATION);
  }
}

export function getRecentMessages(
  conversationId: string,
  limit = 10,
): ChatMessageMemory[] {
  const conv = conversations.get(conversationId);
  if (!conv) return [];
  return conv.messages.slice(-limit);
}

export function clearConversation(conversationId: string): void {
  conversations.delete(conversationId);
}
