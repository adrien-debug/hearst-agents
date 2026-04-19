/**
 * Timeline Event Persistence — durable storage for run timeline events.
 *
 * Uses the existing `run_logs` table (migration 0015) for storage:
 * - `actor` field stores the event type
 * - `message` field stores JSON-serialized event payload
 * - `level` maps from event severity
 * - `at` stores the event timestamp
 *
 * Writes are fire-and-forget safe. Reads are ordered by timestamp.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

function db(): SupabaseClient | null {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _client;
}

const PERSIST_TYPES = new Set([
  "run_started",
  "run_created",
  "execution_mode_selected",
  "agent_selected",
  "capability_blocked",
  "plan_attached",
  "step_started",
  "step_completed",
  "step_failed",
  "tool_call_started",
  "tool_call_completed",
  "delegate_enqueued",
  "delegate_completed",
  "asset_generated",
  "orchestrator_log",
  "run_completed",
  "run_failed",
]);

const SKIP_TYPES = new Set([
  "text_delta",
  "cost_updated",
  "tool_surface",
  "retrieval_mode_inferred",
  "runtime_warning",
]);

function eventToLevel(type: string): "info" | "warning" | "error" {
  if (type === "run_failed" || type === "step_failed") return "error";
  if (type === "capability_blocked") return "warning";
  return "info";
}

export function shouldPersistEvent(type: string): boolean {
  if (SKIP_TYPES.has(type)) return false;
  return PERSIST_TYPES.has(type);
}

/**
 * Persist a single run event. Fire-and-forget safe.
 */
export async function persistRunEvent(input: {
  runId: string;
  type: string;
  ts: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>;
}): Promise<void> {
  const sb = db();
  if (!sb) return;

  try {
    const { type, run_id, timestamp, ...rest } = input.payload;
    void type; void run_id; void timestamp;

    await sb.from("run_logs").insert({
      run_id: input.runId,
      at: new Date(input.ts).toISOString(),
      level: eventToLevel(input.type),
      actor: input.type,
      message: JSON.stringify(rest),
    });
  } catch (err) {
    console.error("[TimelinePersist] persistRunEvent error:", err);
  }
}

export interface PersistedTimelineEvent {
  type: string;
  ts: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>;
}

/**
 * Load persisted timeline events for a run, ordered by timestamp.
 */
export async function getPersistedRunEvents(input: {
  runId: string;
}): Promise<PersistedTimelineEvent[]> {
  const sb = db();
  if (!sb) return [];

  try {
    const { data, error } = await sb
      .from("run_logs")
      .select("actor, at, message")
      .eq("run_id", input.runId)
      .order("at", { ascending: true })
      .limit(200);

    if (error || !data) return [];

    return data.map((row) => {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(row.message ?? "{}");
      } catch { /* ignore */ }

      return {
        type: row.actor ?? "unknown",
        ts: new Date(row.at).getTime(),
        payload: {
          type: row.actor,
          timestamp: row.at,
          ...parsed,
        },
      };
    });
  } catch (err) {
    console.error("[TimelinePersist] getPersistedRunEvents error:", err);
    return [];
  }
}
