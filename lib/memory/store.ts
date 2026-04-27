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
 *
 * Two flavours of persistence coexist:
 *  - Text-only (`appendMessage` / `getRecentMessages`): legacy compact rows.
 *  - Structured (`appendModelMessages` / `getRecentModelMessages`):
 *    full AI SDK ModelMessage payloads, including tool calls and tool
 *    results. Required for cross-turn confirmation flows so the model has
 *    the original tool-call args available when the user types "confirmer".
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ModelMessage } from "ai";
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
      // Only legacy text-only rows here. Structured rows (payload IS NOT NULL)
      // belong to the AI pipeline path and are returned by
      // `getRecentModelMessages` instead — querying both paths would
      // duplicate the user/assistant text in the conversation context.
      const { data, error } = await sb
        .from("chat_messages")
        .select("role, content, created_at")
        .eq("conversation_id", conversationId)
        .is("payload", null)
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

// ── Structured (ModelMessage) persistence ────────────────────

/** In-process buffer of structured messages keyed by `tenant::conversation`. */
const structuredBuffer: Map<string, ModelMessage[]> = new Map();

function structuredKey(conversationId: string, tenantId: string): string {
  return `${tenantId}::${conversationId}::struct`;
}

function extractText(content: ModelMessage["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((p): p is { type: "text"; text: string } =>
      typeof p === "object" && p !== null && (p as { type?: string }).type === "text",
    )
    .map((p) => p.text)
    .join("\n");
}

/**
 * Persist a batch of structured ModelMessages (AI SDK output) for a
 * conversation. Each message is stored with its full payload so the next
 * turn can reconstruct the exact tool-call / tool-result history.
 */
export function appendModelMessages(
  conversationId: string,
  modelMessages: ModelMessage[],
  scope: TenantScope,
): void {
  if (!conversationId || modelMessages.length === 0) return;

  const key = structuredKey(conversationId, scope.tenantId);
  const existing = structuredBuffer.get(key) ?? [];
  const next = [...existing, ...modelMessages].slice(-MAX_MESSAGES_PER_CONVERSATION);
  structuredBuffer.set(key, next);

  // Async write to Supabase
  void persistModelMessages(conversationId, modelMessages, scope);
}

async function persistModelMessages(
  conversationId: string,
  modelMessages: ModelMessage[],
  scope: TenantScope,
): Promise<void> {
  const sb = db();
  if (!sb) return;
  const now = Date.now();
  try {
    const rows = modelMessages.map((m, i) => ({
      conversation_id: conversationId,
      user_id: scope.userId ?? "anonymous",
      tenant_id: scope.tenantId,
      workspace_id: scope.workspaceId,
      role: m.role,
      content: extractText(m.content),
      payload: m as unknown as Record<string, unknown>,
      // Spread inserts apart by 1ms so chronological ordering survives the round-trip.
      created_at: new Date(now + i).toISOString(),
    }));
    const { error } = await sb.from("chat_messages").insert(rows);
    if (error) {
      console.error("[Memory] persistModelMessages error:", error.message);
    }
  } catch (err) {
    console.error("[Memory] persistModelMessages exception:", err);
  }
}

/**
 * Reload structured ModelMessages for a conversation. Prefers Supabase
 * (where tool-call/tool-result payloads survive cold starts) and falls
 * back to the in-process buffer.
 */
export async function getRecentModelMessages(
  conversationId: string,
  limit = 20,
): Promise<ModelMessage[]> {
  const sb = db();
  if (sb) {
    try {
      const { data, error } = await sb
        .from("chat_messages")
        .select("role, content, payload, created_at")
        .eq("conversation_id", conversationId)
        .not("payload", "is", null)
        .order("created_at", { ascending: true })
        .limit(MAX_MESSAGES_PER_CONVERSATION);

      if (!error && data && data.length > 0) {
        const rows = data as Array<{
          role: string;
          content: string;
          payload: unknown;
          created_at: string;
        }>;
        const messages = rows
          .map((r) => r.payload as ModelMessage | null)
          .filter((m): m is ModelMessage => m !== null && typeof m === "object");
        return messages.slice(-limit);
      }
    } catch (err) {
      console.warn("[Memory] Supabase structured read failed, falling back to buffer:", err);
    }
  }

  // In-process fallback
  for (const [key, msgs] of structuredBuffer.entries()) {
    if (key.includes(`::${conversationId}::struct`)) {
      return msgs.slice(-limit);
    }
  }
  return [];
}
