/**
 * Conversation Memory — types.
 *
 * Tenant-scoped conversation memory for multi-turn context.
 * Memory is always bounded and never shared across tenants.
 */

export interface ChatMessageMemory {
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

export interface ConversationMemory {
  conversationId: string;
  tenantId: string;
  workspaceId: string;
  userId?: string;
  messages: ChatMessageMemory[];
  updatedAt: number;
}
