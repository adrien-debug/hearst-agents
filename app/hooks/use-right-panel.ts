"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type {
  RightPanelData,
  RightPanelAsset,
} from "@/lib/ui/right-panel/types";
import { useRunStreamOptional, type StreamEvent } from "@/app/lib/run-stream-context";
import { useSidebarOptional } from "@/app/hooks/use-sidebar";

const POLL_INTERVAL_MS = 30_000;

const EMPTY: RightPanelData = {
  recentRuns: [],
  assets: [],
  missions: [],
};

export function useRightPanel() {
  const [data, setData] = useState<RightPanelData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const mountedRef = useRef(true);
  const stream = useRunStreamOptional();
  const pollRef = useRef<(() => Promise<void>) | null>(null);
  const sidebarCtx = useSidebarOptional();
  const activeThreadId = sidebarCtx?.state.activeThreadId;

  // ── Polling fallback ───────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;

    async function poll() {
      try {
        const url = activeThreadId ? `/api/v2/right-panel?thread_id=${encodeURIComponent(activeThreadId)}` : "/api/v2/right-panel";
        const res = await fetch(url);
        if (!mountedRef.current) return;
        if (!res.ok) {
          setError(true);
          setLoading(false);
          return;
        }
        const json = (await res.json()) as RightPanelData;
        if (!mountedRef.current) return;
        setData((prev) => ({
          ...json,
          focalObject: prev.focalObject ?? json.focalObject,
          secondaryObjects: prev.secondaryObjects?.length
            ? prev.secondaryObjects
            : json.secondaryObjects,
        }));
        setError(false);
      } catch {
        if (!mountedRef.current) return;
        setError(true);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    }

    pollRef.current = poll;

    const id = setInterval(poll, POLL_INTERVAL_MS);
    poll();

    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [activeThreadId]);

  // ── SSE live merge ─────────────────────────────────────────
  useEffect(() => {
    if (!stream) return;

    return stream.subscribe((event: StreamEvent) => {
      switch (event.type) {
        case "run_started":
          setData((prev) => ({
            ...prev,
            currentRun: {
              id: (event.run_id as string) ?? "unknown",
              status: "running",
            },
          }));
          break;

        case "execution_mode_selected":
          setData((prev) => ({
            ...prev,
            currentRun: prev.currentRun
              ? {
                  ...prev.currentRun,
                  executionMode: event.mode as string,
                  backend: event.backend as string | undefined,
                }
              : undefined,
          }));
          break;

        case "agent_selected":
          setData((prev) => ({
            ...prev,
            currentRun: prev.currentRun
              ? {
                  ...prev.currentRun,
                  agentId: event.agent_id as string,
                }
              : undefined,
          }));
          break;

        case "run_completed":
          setData((prev) => {
            const completed = prev.currentRun;
            return {
              ...prev,
              currentRun: undefined,
              recentRuns: completed
                ? [
                    {
                      id: completed.id,
                      input: "Completed run",
                      status: "completed",
                      executionMode: completed.executionMode,
                      agentId: completed.agentId,
                      createdAt: Date.now(),
                      completedAt: Date.now(),
                    },
                    ...prev.recentRuns,
                  ].slice(0, 20)
                : prev.recentRuns,
            };
          });
          break;

        case "run_failed":
          setData((prev) => ({
            ...prev,
            currentRun: undefined,
          }));
          break;

        case "asset_generated":
          setData((prev) => ({
            ...prev,
            assets: [
              {
                id: (event.asset_id as string) ?? "",
                name: (event.name as string) ?? "Asset",
                type: (event.asset_type as string) ?? "doc",
                runId: (event.run_id as string) ?? "",
              } satisfies RightPanelAsset,
              ...prev.assets,
            ].slice(0, 50),
          }));
          break;

        case "focal_object_ready":
          setData((prev) => ({
            ...prev,
            focalObject: event.focal_object as Record<string, unknown>,
          }));
          break;

        case "scheduled_mission_created":
          setData((prev) => ({
            ...prev,
            missions: [
              {
                id: (event.mission_id as string) ?? "",
                name: (event.name as string) ?? "Mission",
                input: (event.input as string) ?? "",
                schedule: (event.schedule as string) ?? "",
                enabled: true,
              },
              ...prev.missions,
            ],
          }));
          break;
      }
    });
  }, [stream]);

  const refresh = useCallback(() => {
    pollRef.current?.();
  }, []);

  return { data, loading, error, refresh };
}
