/**
 * Runtime State Adapter — Supabase persistence for v2 runs and scheduled missions.
 *
 * Uses existing `runs` table (metadata jsonb for v2 fields) and `missions` table.
 * All operations are fire-and-forget safe — errors are logged, never thrown upstream.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PersistedRunRecord, PersistedScheduledMission } from "./types";

/**
 * Untyped Supabase client — bypasses stale generated types.
 * Migrations 0014/0015 added columns/tables not yet in database.types.ts.
 */
let _raw: SupabaseClient | null = null;

function db(): SupabaseClient | null {
  if (_raw) return _raw;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _raw = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _raw;
}

// ── Runs ────────────────────────────────────────────────────

const STATUS_MAP: Record<string, string> = {
  running: "running",
  completed: "completed",
  failed: "failed",
};

export async function saveRun(run: PersistedRunRecord): Promise<boolean> {
  const sb = db();
  if (!sb) {
    console.warn("[RuntimeState] No Supabase client — run not persisted:", run.id);
    return false;
  }

  try {
    const { error } = await sb.from("runs").upsert({
      id: run.id,
      kind: "chat" as const,
      status: STATUS_MAP[run.status] ?? "running",
      input: { message: run.input, surface: run.surface },
      user_id: run.userId,
      trigger: "orchestrator_v2",
      metadata: {
        v2: true,
        tenantId: run.tenantId,
        workspaceId: run.workspaceId,
        executionMode: run.executionMode,
        agentId: run.agentId,
        backend: run.backend,
        missionId: run.missionId,
        assets: run.assets,
      },
    });

    if (error) {
      console.error("[RuntimeState] saveRun error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[RuntimeState] saveRun exception:", err);
    return false;
  }
}

export async function updateRun(
  runId: string,
  patch: Partial<PersistedRunRecord>,
): Promise<boolean> {
  const sb = db();
  if (!sb) return false;

  try {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (patch.status) {
      update.status = STATUS_MAP[patch.status] ?? patch.status;
    }
    if (patch.completedAt) {
      update.finished_at = new Date(patch.completedAt).toISOString();
    }

    const metaPatch: Record<string, unknown> = {};
    if (patch.executionMode !== undefined) metaPatch.executionMode = patch.executionMode;
    if (patch.agentId !== undefined) metaPatch.agentId = patch.agentId;
    if (patch.backend !== undefined) metaPatch.backend = patch.backend;
    if (patch.missionId !== undefined) metaPatch.missionId = patch.missionId;
    if (patch.assets !== undefined) metaPatch.assets = patch.assets;

    if (Object.keys(metaPatch).length > 0) {
      // Merge into existing metadata using Postgres jsonb concat
      const { data: existing } = await sb
        .from("runs")
        .select("metadata")
        .eq("id", runId)
        .single();

      const merged = { ...(existing?.metadata as Record<string, unknown> ?? {}), ...metaPatch };
      update.metadata = merged;
    }

    if (Object.keys(update).length <= 1) return true; // only updated_at

    const { error } = await sb.from("runs").update(update).eq("id", runId);
    if (error) {
      console.error("[RuntimeState] updateRun error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[RuntimeState] updateRun exception:", err);
    return false;
  }
}

export async function getRuns(params?: {
  userId?: string;
  tenantId?: string;
  workspaceId?: string;
  limit?: number;
}): Promise<PersistedRunRecord[]> {
  const sb = db();
  if (!sb) return [];

  try {
    let query = sb
      .from("runs")
      .select("id, input, status, metadata, user_id, created_at, finished_at")
      .eq("trigger", "orchestrator_v2")
      .order("created_at", { ascending: false })
      .limit(params?.limit ?? 50);

    if (params?.userId) {
      query = query.eq("user_id", params.userId);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[RuntimeState] getRuns error:", error.message);
      return [];
    }

    return (data ?? []).map(toRunRecord);
  } catch (err) {
    console.error("[RuntimeState] getRuns exception:", err);
    return [];
  }
}

export async function getRunById(runId: string): Promise<PersistedRunRecord | null> {
  const sb = db();
  if (!sb) return null;

  try {
    const { data, error } = await sb
      .from("runs")
      .select("id, input, status, metadata, user_id, created_at, finished_at")
      .eq("id", runId)
      .single();

    if (error || !data) return null;
    return toRunRecord(data);
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRunRecord(row: any): PersistedRunRecord {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const input = (row.input ?? {}) as Record<string, unknown>;

  return {
    id: row.id,
    tenantId: (meta.tenantId as string) ?? "",
    workspaceId: (meta.workspaceId as string) ?? "",
    userId: row.user_id ?? "",
    input: (input.message as string) ?? "",
    surface: input.surface as string | undefined,
    executionMode: meta.executionMode as string | undefined,
    agentId: meta.agentId as string | undefined,
    backend: meta.backend as string | undefined,
    missionId: meta.missionId as string | undefined,
    status: mapDbStatus(row.status),
    createdAt: new Date(row.created_at).getTime(),
    completedAt: row.finished_at ? new Date(row.finished_at).getTime() : undefined,
    assets: (meta.assets as PersistedRunRecord["assets"]) ?? [],
  };
}

function mapDbStatus(s: string): PersistedRunRecord["status"] {
  if (s === "completed") return "completed";
  if (s === "failed") return "failed";
  return "running";
}

// ── Scheduled Missions ──────────────────────────────────────

export async function saveScheduledMission(
  mission: PersistedScheduledMission,
): Promise<boolean> {
  const sb = db();
  if (!sb) {
    console.warn("[RuntimeState] No Supabase client — mission not persisted:", mission.id);
    return false;
  }

  try {
    const { error } = await sb.from("missions").insert({
      id: mission.id,
      user_id: mission.userId,
      title: mission.name,
      surface: "home",
      status: mission.enabled ? "created" : "cancelled",
      actions: {
        type: "scheduled",
        tenantId: mission.tenantId,
        workspaceId: mission.workspaceId,
        schedule: mission.schedule,
        input: mission.input,
        lastRunAt: mission.lastRunAt,
        lastRunId: mission.lastRunId,
      },
      services: [],
    });

    if (error) {
      console.error("[RuntimeState] saveScheduledMission error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[RuntimeState] saveScheduledMission exception:", err);
    return false;
  }
}

export async function updateScheduledMission(
  missionId: string,
  patch: Partial<PersistedScheduledMission>,
): Promise<boolean> {
  const sb = db();
  if (!sb) return false;

  try {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (patch.enabled !== undefined) {
      update.status = patch.enabled ? "created" : "cancelled";
    }

    const hasOpsFields =
      patch.lastRunAt !== undefined ||
      patch.lastRunId !== undefined ||
      patch.lastRunStatus !== undefined ||
      patch.lastError !== undefined;

    if (hasOpsFields) {
      const { data: existing } = await sb
        .from("missions")
        .select("actions")
        .eq("id", missionId)
        .single();

      const actions = (existing?.actions ?? {}) as Record<string, unknown>;
      if (patch.lastRunAt !== undefined) actions.lastRunAt = patch.lastRunAt;
      if (patch.lastRunId !== undefined) actions.lastRunId = patch.lastRunId;
      if (patch.lastRunStatus !== undefined) actions.lastRunStatus = patch.lastRunStatus;
      if (patch.lastError !== undefined) actions.lastError = patch.lastError;
      update.actions = actions;
    }

    const { error } = await sb.from("missions").update(update).eq("id", missionId);
    if (error) {
      console.error("[RuntimeState] updateScheduledMission error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[RuntimeState] updateScheduledMission exception:", err);
    return false;
  }
}

export async function getScheduledMissions(): Promise<PersistedScheduledMission[]> {
  const sb = db();
  if (!sb) return [];

  try {
    const { data, error } = await sb
      .from("missions")
      .select("id, user_id, title, status, actions, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("[RuntimeState] getScheduledMissions error:", error.message);
      return [];
    }

    return (data ?? [])
      .filter((row) => {
        const actions = row.actions as Record<string, unknown> | null;
        return actions?.type === "scheduled";
      })
      .map(toScheduledMission);
  } catch (err) {
    console.error("[RuntimeState] getScheduledMissions exception:", err);
    return [];
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toScheduledMission(row: any): PersistedScheduledMission {
  const actions = (row.actions ?? {}) as Record<string, unknown>;

  return {
    id: row.id,
    tenantId: (actions.tenantId as string) ?? "",
    workspaceId: (actions.workspaceId as string) ?? "",
    userId: row.user_id ?? "",
    name: row.title ?? "",
    input: (actions.input as string) ?? "",
    schedule: (actions.schedule as string) ?? "",
    enabled: row.status !== "cancelled",
    createdAt: new Date(row.created_at).getTime(),
    lastRunAt: actions.lastRunAt as number | undefined,
    lastRunId: actions.lastRunId as string | undefined,
    lastRunStatus: actions.lastRunStatus as PersistedScheduledMission["lastRunStatus"],
    lastError: actions.lastError as string | undefined,
  };
}
