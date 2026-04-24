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
import { getAssets as getPersistedAssets } from "@/lib/runtime/assets/adapter";
import { getConnectionsByScope } from "@/lib/connectors/control-plane/store";
import { getAllMissionOps } from "@/lib/runtime/missions/ops-store";
import { getSchedulerMode } from "@/lib/runtime/missions/scheduler-init";
import { getServerSupabase } from "@/lib/supabase-server";
import { manifestAsset, resolveFocalObject } from "@/lib/right-panel/manifestation";
import { formatOutput, type OutputTier } from "@/lib/runtime/formatting/pipeline";
import { getPlansForThread, getMissionsForThread } from "@/lib/planner/store";
import type { Asset, AssetKind, AssetProvenance } from "@/lib/assets/types";
import type { RightPanelData, FocalObjectView } from "./types";

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

  // Current run = latest with live status (running, awaiting_approval, awaiting_clarification)
  const memRuns = getMemoryRuns(5);
  const liveStatuses = ["running", "awaiting_approval", "awaiting_clarification"];
  const liveRun = memRuns.find((r) => liveStatuses.includes(r.status));
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

  // Get assets from Supabase (canonical) + runs as fallback
  const persistedAssets = await getPersistedAssets({ limit: MAX_ASSETS });

  // Map to RightPanelAsset format
  const assets: { id: string; name: string; type: string; runId: string }[] =
    persistedAssets.length > 0
      ? persistedAssets.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          runId: a.run_id,
        }))
      : runs
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

  // ── Focal + Secondary Objects — Résolution canonique (plans → missions → assets) ──
  let focalObject: FocalObjectView | undefined;
  const secondaryObjects: FocalObjectView[] = [];

  if (threadId) {
    try {
      // 1. Récupérer les plans, missions et assets du thread
      const plans = getPlansForThread(threadId);
      const missionsForThread = getMissionsForThread(threadId);

      // 2. Récupérer les assets du thread (depuis DB ou mémoire)
      let threadAssets: Asset[] = [];
      try {
        const sb = getServerSupabase();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sbRaw = sb as unknown as { from: (table: string) => any } | null;
        if (sb && sbRaw) {
          const { data: assetRows } = await sbRaw
            .from("assets")
            .select("*")
            .eq("thread_id", threadId)
            .order("created_at", { ascending: false })
            .limit(5);

          if (assetRows) {
            threadAssets = assetRows.map((row: Record<string, unknown>) => ({
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
            }));
          }
        }
      } catch {
        /* fallback: assets optionnels */
      }

      // 3. Résolution focale canonique selon priorité définie dans resolveFocalObject()
      // 1. plan awaiting_approval → 2. plan executing → 3. latest asset → 4. active mission
      const resolvedFocal = resolveFocalObject(plans, missionsForThread, threadAssets);

      if (resolvedFocal) {
        // Mapper vers FocalObjectView (subset léger pour le client)
        focalObject = {
          objectType: resolvedFocal.objectType,
          id: resolvedFocal.id,
          title: resolvedFocal.title,
          status: resolvedFocal.status,
          summary: (resolvedFocal as { summary?: string }).summary,
          sections: (resolvedFocal as { sections?: Array<{ heading?: string; body: string }> }).sections,
          threadId: resolvedFocal.threadId,
          sourcePlanId: resolvedFocal.sourcePlanId,
          sourceAssetId: resolvedFocal.sourceAssetId,
          morphTarget: resolvedFocal.morphTarget,
          primaryAction: resolvedFocal.primaryAction,
          body: (resolvedFocal as { body?: string }).body,
          wordCount: (resolvedFocal as { wordCount?: number }).wordCount,
          provider: (resolvedFocal as { providerId?: string }).providerId,
          createdAt: resolvedFocal.createdAt,
          updatedAt: resolvedFocal.updatedAt,
        };

        // 4. Construire les objets secondaires (assets restants, plans non-focaux, etc.)
        const focalSourceId = resolvedFocal.sourcePlanId || resolvedFocal.sourceAssetId;

        // Ajouter les assets non-focaux comme secondaires
        for (const asset of threadAssets) {
          if (asset.id === focalSourceId) continue; // Skip le focal déjà pris
          const fo = manifestAsset(asset);
          if (!fo) continue;
          secondaryObjects.push({
            objectType: fo.objectType,
            id: fo.id,
            title: fo.title,
            status: fo.status,
            summary: (fo as { summary?: string }).summary,
            threadId: fo.threadId,
            sourceAssetId: fo.sourceAssetId,
            morphTarget: fo.morphTarget,
            createdAt: fo.createdAt,
            updatedAt: fo.updatedAt,
          });
        }

        // Ajouter les plans actifs non-focaux comme secondaires
        for (const plan of plans) {
          if (plan.id === focalSourceId) continue;
          if (plan.status === "awaiting_approval" || plan.status === "executing") {
            secondaryObjects.push({
              objectType: plan.type === "mission" ? "mission_draft" : plan.type === "monitoring" ? "watcher_draft" : "outline",
              id: `plan_${plan.id}`,
              title: plan.intent.slice(0, 60),
              status: plan.status === "awaiting_approval" ? "awaiting_approval" : "composing",
              threadId: plan.threadId,
              sourcePlanId: plan.id,
              createdAt: plan.createdAt,
              updatedAt: plan.updatedAt,
            });
          }
        }
      }
    } catch (err) {
      console.error("[RightPanelAggregate] Focal resolution failed:", err);
      /* fallback: focal object optionnel */
    }
  }

  // Fallback legacy: si pas de résolution canonique, utiliser les assets récents
  if (!focalObject) {
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

            const contentIsInline =
              asset.contentRef &&
              asset.contentRef.length > 0 &&
              /\s/.test(asset.contentRef);
            const formatted = contentIsInline
              ? formatOutput(asset.contentRef!, (asset.outputTier ?? asset.kind) as OutputTier)
              : undefined;
            const fo = manifestAsset(asset, formatted);
            if (!fo) continue;

            const obj: FocalObjectView = {
              objectType: fo.objectType,
              id: fo.id,
              title: fo.title,
              status: fo.status,
              summary: (fo as { summary?: string }).summary,
              sections: (fo as { sections?: Array<{ heading?: string; body: string }> }).sections,
              threadId: fo.threadId,
              sourceAssetId: fo.sourceAssetId,
              morphTarget: fo.morphTarget,
              primaryAction: fo.primaryAction,
              createdAt: fo.createdAt,
              updatedAt: fo.updatedAt,
            };

            if (i === 0) {
              focalObject = obj;
            } else {
              secondaryObjects.push(obj);
            }
          }
        }
      }
    } catch {
      /* focal object legacy fallback optionnel */
    }
  }

  return { currentRun, recentRuns, assets, missions, connectorHealth, scheduler, missionOpsSummary, focalObject, secondaryObjects };
}
