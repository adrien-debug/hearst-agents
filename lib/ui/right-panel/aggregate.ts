/**
 * Right Panel — Aggregator.
 *
 * Builds RightPanelData from Supabase persistence (canonical) with
 * in-memory fallback for resilience.
 */

import { getAllRuns as getMemoryRuns } from "@/lib/runtime/runs/store";
import { getAllMissions as getMemoryMissions } from "@/lib/runtime/missions/store";
import {
  getRuns as getPersistedRuns,
  getScheduledMissions as getPersistedMissions,
} from "@/lib/runtime/state/adapter";
import { getConnectionsByScope } from "@/lib/connectors/control-plane/store";
import { getAllMissionOps } from "@/lib/runtime/missions/ops-store";
import { getSchedulerMode } from "@/lib/runtime/missions/scheduler-init";
import { getServerSupabase } from "@/lib/supabase-server";
import { manifestAsset } from "@/lib/right-panel/manifestation";
import { formatOutput, type OutputTier } from "@/lib/runtime/formatting/pipeline";
import type { Asset, AssetKind, AssetProvenance } from "@/lib/assets/types";
import type { RightPanelData } from "./types";

const MAX_RUNS = 20;
const MAX_ASSETS = 50;

export async function buildRightPanelData(threadId?: string): Promise<RightPanelData> {
  // ── Runs ─────────────────────────────────────────────────
  let runs = await getPersistedRuns({ limit: MAX_RUNS });
  const fromPersistence = runs.length > 0;

  if (!fromPersistence) {
    const mem = getMemoryRuns(MAX_RUNS);
    runs = mem.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      workspaceId: r.workspaceId,
      userId: r.userId,
      input: r.input,
      surface: r.surface,
      executionMode: r.executionMode,
      agentId: r.agentId,
      backend: r.backend,
      missionId: r.missionId,
      status: r.status,
      createdAt: r.createdAt,
      completedAt: r.completedAt,
      assets: r.assets,
    }));
  }

  // Current run = latest with status "running" (in-memory has priority for live data)
  const memRuns = getMemoryRuns(5);
  const liveRun = memRuns.find((r) => r.status === "running");
  const currentRun = liveRun
    ? {
        id: liveRun.id,
        status: liveRun.status,
        executionMode: liveRun.executionMode,
        agentId: liveRun.agentId,
        backend: liveRun.backend,
      }
    : undefined;

  const recentRuns = runs.map((r) => ({
    id: r.id,
    input: r.input.slice(0, 200),
    status: r.status,
    executionMode: r.executionMode,
    agentId: r.agentId,
    createdAt: r.createdAt,
    completedAt: r.completedAt,
  }));

  const assets = runs
    .flatMap((r) =>
      r.assets.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        runId: r.id,
      })),
    )
    .slice(0, MAX_ASSETS);

  // ── Missions ─────────────────────────────────────────────
  let missionList = await getPersistedMissions();

  if (missionList.length === 0) {
    missionList = getMemoryMissions().map((m) => ({
      id: m.id,
      tenantId: m.tenantId,
      workspaceId: m.workspaceId,
      userId: m.userId,
      name: m.name,
      input: m.input,
      schedule: m.schedule,
      enabled: m.enabled,
      createdAt: m.createdAt,
      lastRunAt: m.lastRunAt,
      lastRunId: m.lastRunId,
    }));
  }

  const opsMap = getAllMissionOps();

  const missions = missionList.map((m) => {
    const live = opsMap.get(m.id);
    const isLiveRunning = live?.status === "running";

    return {
      id: m.id,
      name: m.name,
      input: m.input,
      schedule: m.schedule,
      enabled: m.enabled,
      lastRunAt: live?.lastRunAt ?? m.lastRunAt,
      lastRunId: live?.lastRunId ?? m.lastRunId,
      opsStatus: isLiveRunning ? ("running" as const) : (m.lastRunStatus ?? live?.lastRunStatus),
      lastError: live?.lastError ?? m.lastError,
    };
  });

  // ── Connector Health ──────────────────────────────────────
  let connectorHealth: RightPanelData["connectorHealth"];
  try {
    const conns = await getConnectionsByScope({
      tenantId: "dev-tenant",
      workspaceId: "dev-workspace",
    });
    if (conns.length > 0) {
      connectorHealth = {
        healthy: conns.filter((c) => c.status === "connected").length,
        degraded: conns.filter((c) => c.status === "degraded" || c.status === "error").length,
        disconnected: conns.filter((c) => c.status === "disconnected" || c.status === "pending_auth").length,
      };
    }
  } catch {
    /* connector health is optional */
  }

  // ── Scheduler / Ops Summary ──────────────────────────────
  const mode = getSchedulerMode();
  const scheduler = {
    isLeader: mode === "leader" || mode === "local_fallback",
    mode,
  };

  const allOps = Array.from(opsMap.values());
  const missionOpsSummary = {
    running: allOps.filter((o) => o.status === "running").length,
    failed: allOps.filter((o) => o.lastRunStatus === "failed").length,
    blocked: allOps.filter((o) => o.lastRunStatus === "blocked").length,
  };

  // ── Focal + Secondary Objects from DB (latest 3 assets, thread-scoped) ──
  let focalObject: Record<string, unknown> | undefined;
  const secondaryObjects: Record<string, unknown>[] = [];
  try {
    const sb = getServerSupabase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbRaw = sb as unknown as { from: (table: string) => any } | null;
    if (sb && sbRaw) {
      let assetQuery = sbRaw
        .from("assets")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(3);

      if (threadId) {
        assetQuery = assetQuery.eq("thread_id", threadId);
      }

      const { data: latestAssets } = await assetQuery;

      if (latestAssets && latestAssets.length > 0) {
        for (let i = 0; i < latestAssets.length; i++) {
          const row = latestAssets[i] as Record<string, unknown>;
          const asset: Asset = {
            id: row.id as string,
            threadId: row.thread_id as string,
            kind: row.kind as AssetKind,
            title: (row.title as string) ?? "",
            summary: (row.summary as string | undefined) ?? undefined,
            outputTier: (row.output_tier as OutputTier | undefined) ?? undefined,
            provenance: (row.provenance ?? {}) as AssetProvenance,
            createdAt: new Date(row.created_at as string).getTime(),
            contentRef: (row.content_ref as string | undefined) ?? undefined,
            runId: (row.run_id as string | undefined) ?? undefined,
          };

          const formatted = asset.contentRef
            ? formatOutput(asset.contentRef, (asset.outputTier ?? asset.kind) as OutputTier)
            : undefined;
          const fo = manifestAsset(asset, formatted);
          if (!fo) continue;

          const provId = asset.provenance?.providerId;
          const obj = { ...fo as unknown as Record<string, unknown>, ...(provId ? { sourceProviderId: provId } : {}) };

          if (i === 0) {
            focalObject = obj;
          } else {
            secondaryObjects.push(obj);
          }
        }
      }
    }
  } catch {
    /* focal object hydration is optional */
  }

  return { currentRun, recentRuns, assets, missions, connectorHealth, scheduler, missionOpsSummary, focalObject, secondaryObjects };
}
