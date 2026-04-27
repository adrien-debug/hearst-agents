/**
 * Conversation Memory — store.
 *
 * Writes are persisted to Supabase (chat_messages table) asynchronously.
 * Reads fetch from Supabase with an in-memory fallback when the DB is
 * unavailable (dev, cold-start, network error).
 *
 * The in-memory layer also acts as a write-buffer: messages appended in
 * the current request are immediately visible to getRecentMessages() in
 * the same request before the async write completes.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { TenantScope } from "@/lib/multi-tenant/types";
import type { ChatMessageMemory, ConversationMemory } from "./types";

const MAX_MESSAGES_PER_CONVERSATION = 24;

// ── In-memory write-buffer (per process / request) ──────────
const buffer: Map<string, ConversationMemory> = new Map();

// ── Supabase client (service role — server only) ─────────────
let _sb: SupabaseClient | null = null;

function db(): SupabaseClient | null {
  if (_sb) return _sb;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _sb = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _sb;
}

// ── Helpers ──────────────────────────────────────────────────

function bufferKey(conversationId: string, tenantId: string): string {
  return `${tenantId}::${conversationId}`;
}

// ── Public API ───────────────────────────────────────────────

export function getConversationMemory(
  conversationId: string,
): ConversationMemory | null {
  for (const conv of buffer.values()) {
    if (conv.conversationId === conversationId) return conv;
  }
  return null;
}

export function appendMessage(
  conversationId: string,
  message: ChatMessageMemory,
  scope: TenantScope,
): void {
  const key = bufferKey(conversationId, scope.tenantId);
  let conv = buffer.get(key);

  if (!conv) {
    conv = {
      conversationId,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      userId: scope.userId,
      messages: [],
      updatedAt: Date.now(),
    };
    buffer.set(key, conv);
  }

  conv.messages.push(message);
  conv.updatedAt = Date.now();

  if (conv.messages.length > MAX_MESSAGES_PER_CONVERSATION) {
    conv.messages = conv.messages.slice(-MAX_MESSAGES_PER_CONVERSATION);
  }

  // Async write to Supabase — fire-and-forget, never blocks the caller
  void persistMessage(conversationId, message, scope);
}

export async function getRecentMessages(
  conversationId: string,
  limit = 10,
): Promise<ChatMessageMemory[]> {
  const sb = db();
  if (sb) {
    try {
      const { data, error } = await sb
        .from("chat_messages")
        .select("role, content, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(MAX_MESSAGES_PER_CONVERSATION);

      if (!error && data && data.length > 0) {
        const rows = data as Array<{ role: string; content: string; created_at: string }>;
        return rows.slice(-limit).map((r) => ({
          role: r.role as "user" | "assistant",
          content: r.content,
          createdAt: new Date(r.created_at).getTime(),
        }));
      }
    } catch (err) {
      console.warn("[Memory] Supabase read failed, falling back to buffer:", err);
    }
  }

  // In-memory fallback
  for (const conv of buffer.values()) {
    if (conv.conversationId === conversationId) {
      return conv.messages.slice(-limit);
    }
  }
  return [];
}

export function clearConversation(conversationId: string): void {
  for (const [key, conv] of buffer.entries()) {
    if (conv.conversationId === conversationId) {
      buffer.delete(key);
    }
  }
  // Best-effort async delete from Supabase
  const sb = db();
  if (sb) {
    void sb.from("chat_messages").delete().eq("conversation_id", conversationId);
  }
}

// ── Supabase persistence ─────────────────────────────────────

async function persistMessage(
  conversationId: string,
  message: ChatMessageMemory,
  scope: TenantScope,
): Promise<void> {
  const sb = db();
  if (!sb) return;
  try {
    const { error } = await sb.from("chat_messages").insert({
      conversation_id: conversationId,
      user_id: scope.userId ?? "anonymous",
      tenant_id: scope.tenantId,
      workspace_id: scope.workspaceId,
      role: message.role,
      content: message.content,
      created_at: new Date(message.createdAt).toISOString(),
    });
    if (error) {
      console.error("[Memory] persistMessage error:", error.message);
    }
  } catch (err) {
    console.error("[Memory] persistMessage exception:", err);
  }
}
