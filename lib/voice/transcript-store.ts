/**
 * Voice Transcript Store — server-side persistence (B2 Voice Agentic).
 *
 * Persiste les entries de transcript voix (user / assistant / tool_call /
 * tool_result) dans `voice_transcripts` (Supabase). Avant cette feature, le
 * transcript ne vivait que dans le store Zustand client et disparaissait à
 * chaque teardown WebRTC.
 *
 * Pattern :
 *   - une session OpenAI Realtime = un row, identifiée par session_id (UNIQUE)
 *   - les entries sont append-only dans la colonne jsonb `entries`
 *   - on lit/append via UPSERT pour ne pas avoir à gérer un INSERT initial
 *     séparé (la 1re entry d'une session crée la row)
 *
 * RLS migration 0045 — server uses service_role bypass via getServerSupabase.
 */

import { getServerSupabase } from "@/lib/platform/db/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

type VoiceEntryRole = "user" | "assistant" | "tool_call" | "tool_result";

export interface VoiceTranscriptEntry {
  id: string;
  role: VoiceEntryRole;
  text: string;
  timestamp: number;
  callId?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  output?: string;
  status?: "pending" | "success" | "error";
  providerId?: string;
}

interface VoiceTranscriptRow {
  id: string;
  userId: string;
  tenantId: string;
  threadId: string | null;
  sessionId: string;
  startedAt: number;
  endedAt: number | null;
  entries: VoiceTranscriptEntry[];
}

interface AppendInput {
  sessionId: string;
  userId: string;
  tenantId: string;
  threadId?: string | null;
  entry: VoiceTranscriptEntry;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rawDb(sb: ReturnType<typeof getServerSupabase>): SupabaseClient<any> | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return sb as unknown as SupabaseClient<any> | null;
}

/**
 * Append une entry au transcript de la session. Crée la row si elle n'existe
 * pas (UPSERT-like via SELECT puis INSERT/UPDATE — évite un trigger SQL).
 *
 * Retourne true en cas de succès, false si Supabase indispo (env tests).
 * Ne throw jamais — le voice ne doit pas casser si la persistance fail.
 */
export async function appendTranscriptEntry(input: AppendInput): Promise<boolean> {
  const sb = getServerSupabase();
  if (!sb) return false;
  const db = rawDb(sb);
  if (!db) return false;

  try {
    const { data: existing } = await db
      .from("voice_transcripts")
      .select("id, entries")
      .eq("session_id", input.sessionId)
      .maybeSingle();

    if (existing) {
      const entries = Array.isArray(existing.entries)
        ? (existing.entries as VoiceTranscriptEntry[])
        : [];
      // Si une entry avec le même id existe (cas d'un patch tool_call
      // pending → success), on remplace en place plutôt que d'append.
      const idx = entries.findIndex((e) => e.id === input.entry.id);
      const next =
        idx >= 0
          ? [...entries.slice(0, idx), input.entry, ...entries.slice(idx + 1)]
          : [...entries, input.entry];

      const { error } = await db
        .from("voice_transcripts")
        .update({ entries: next })
        .eq("id", existing.id);
      if (error) {
        console.error("[voice/transcript-store] update failed:", error.message);
        return false;
      }
      return true;
    }

    const { error } = await db.from("voice_transcripts").insert({
      user_id: input.userId,
      tenant_id: input.tenantId,
      thread_id: input.threadId ?? null,
      session_id: input.sessionId,
      entries: [input.entry],
    });
    if (error) {
      console.error("[voice/transcript-store] insert failed:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[voice/transcript-store] unexpected:", err);
    return false;
  }
}

/** Charge le transcript complet d'une session. */
export async function getTranscript(sessionId: string): Promise<VoiceTranscriptRow | null> {
  const sb = getServerSupabase();
  if (!sb) return null;
  const db = rawDb(sb);
  if (!db) return null;

  const { data, error } = await db
    .from("voice_transcripts")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error || !data) return null;

  const row = data as Record<string, unknown>;
  return {
    id: row.id as string,
    userId: row.user_id as string,
    tenantId: row.tenant_id as string,
    threadId: (row.thread_id as string | null) ?? null,
    sessionId: row.session_id as string,
    startedAt: row.started_at
      ? new Date(row.started_at as string).getTime()
      : Date.now(),
    endedAt: row.ended_at ? new Date(row.ended_at as string).getTime() : null,
    entries: Array.isArray(row.entries) ? (row.entries as VoiceTranscriptEntry[]) : [],
  };
}

/** Lie un transcript existant à un thread chat (clic "Lier au thread"). */
export async function linkTranscriptToThread(
  sessionId: string,
  threadId: string,
): Promise<boolean> {
  const sb = getServerSupabase();
  if (!sb) return false;
  const db = rawDb(sb);
  if (!db) return false;

  const { error } = await db
    .from("voice_transcripts")
    .update({ thread_id: threadId })
    .eq("session_id", sessionId);
  if (error) {
    console.error("[voice/transcript-store] link failed:", error.message);
    return false;
  }
  return true;
}

