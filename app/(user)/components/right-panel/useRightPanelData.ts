"use client";

import { useEffect, useState, useRef } from "react";
import type { RightPanelData } from "@/lib/core/types";
import { mapFocalObject, mapFocalObjects } from "@/lib/core/types/focal";
import { useFocalStore } from "@/stores/focal";
import { useNavigationStore } from "@/stores/navigation";
import { useRuntimeStore } from "@/stores/runtime";

export interface RightPanelDataState {
  loading: boolean;
  assets: RightPanelData["assets"];
  missions: RightPanelData["missions"];
  activeThreadId: string | null;
}

export function useRightPanelData(): RightPanelDataState {
  const activeThreadId = useNavigationStore((s) => s.activeThreadId);

  const [data, setData] = useState<RightPanelData | null>(null);
  const [loading, setLoading] = useState(true);

  const [trackedThreadId, setTrackedThreadId] = useState<string | null>(
    activeThreadId ?? null,
  );
  if (trackedThreadId !== (activeThreadId ?? null)) {
    setTrackedThreadId(activeThreadId ?? null);
    setData(null);
  }

  const activeThreadIdRef = useRef(activeThreadId);
  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  const runtimeEvents = useRuntimeStore((s) => s.events);
  const lastAssetEventTsRef = useRef<number>(0);
  useEffect(() => {
    if (!activeThreadId) return;
    const assetEvent = runtimeEvents.find((e) => e.type === "asset_generated");
    if (!assetEvent || assetEvent.timestamp <= lastAssetEventTsRef.current)
      return;
    lastAssetEventTsRef.current = assetEvent.timestamp;
    fetch(
      `/api/v2/right-panel?thread_id=${encodeURIComponent(activeThreadId)}`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((panelData: RightPanelData | null) => {
        if (panelData) setData(panelData);
      })
      .catch(() => {});
  }, [runtimeEvents, activeThreadId]);

  useEffect(() => {
    if (!activeThreadId) {
      let cancelled = false;
      Promise.resolve().then(() => {
        if (!cancelled) setLoading(true);
      });
      void Promise.all([
        fetch("/api/v2/missions", { credentials: "include" })
          .then((r) => (r.ok ? r.json() : { missions: [] }))
          .catch(() => ({ missions: [] })),
        fetch("/api/v2/assets", { credentials: "include" })
          .then((r) => (r.ok ? r.json() : { assets: [] }))
          .catch(() => ({ assets: [] })),
      ]).then(([mResp, aResp]) => {
        if (cancelled) return;
        const missions = (mResp.missions ?? []) as RightPanelData["missions"];
        const rawAssets = (aResp.assets ?? []) as Array<
          Record<string, unknown>
        >;
        const assets = rawAssets.map(
          (a): RightPanelData["assets"][number] => ({
            id: String(a.id ?? ""),
            name: String(a.name ?? a.title ?? "Untitled"),
            type: String(a.type ?? a.kind ?? "doc"),
            runId: String(a.run_id ?? a.runId ?? ""),
          }),
        );
        setData({
          assets,
          missions,
          focalObject: undefined,
          secondaryObjects: undefined,
        } as RightPanelData);
        setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }

    const streamThreadId = activeThreadId;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) setLoading(true);
    });

    const url = `/api/v2/right-panel/stream?thread_id=${encodeURIComponent(streamThreadId)}`;
    const es = new EventSource(url);

    const applyPanel = (panelData: RightPanelData) => {
      if (cancelled || activeThreadIdRef.current !== streamThreadId) return;
      setData(panelData);
      const hydrateThreadState = useFocalStore.getState().hydrateThreadState;
      const tid = activeThreadIdRef.current;
      const mappedFocal = panelData.focalObject
        ? mapFocalObject(panelData.focalObject, tid)
        : null;
      const secondary = panelData.secondaryObjects
        ? mapFocalObjects(
            panelData.secondaryObjects as unknown[],
            tid,
          ).slice(0, 3)
        : [];
      hydrateThreadState(mappedFocal, secondary);
      setLoading(false);
    };

    es.addEventListener("panel", (ev: MessageEvent<string>) => {
      try {
        const panelData = JSON.parse(ev.data) as RightPanelData;
        applyPanel(panelData);
      } catch (e) {
        console.error("[useRightPanelData] SSE panel parse failed:", e);
      }
    });

    es.onerror = () => {};

    return () => {
      cancelled = true;
      es.close();
    };
  }, [activeThreadId]);

  const assets = data?.assets ?? [];
  const missions = data?.missions ?? [];

  return {
    loading,
    assets,
    missions,
    activeThreadId,
  };
}
