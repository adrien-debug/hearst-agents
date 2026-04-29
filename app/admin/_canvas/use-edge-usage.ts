"use client";

import { useEffect } from "react";
import { useCanvasStore } from "./store";

/**
 * Fetch la carte d'usage par edge au mount (puis toutes les 60s) et la
 * stocke pour que FlowEdge dérive des épaisseurs Sankey.
 */
export function useEdgeUsage(enabled = true) {
  const setEdgeUsage = useCanvasStore((s) => s.setEdgeUsage);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const fetchUsage = async () => {
      try {
        const res = await fetch("/api/admin/metrics/edge-usage", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { totalRuns: number; usage: Record<string, number> };
        if (cancelled) return;
        setEdgeUsage(json.usage ?? {}, json.totalRuns ?? 0);
      } catch {
        // erreur réseau — on garde la carte précédente
      }
    };
    fetchUsage();
    const t = setInterval(fetchUsage, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [enabled, setEdgeUsage]);
}
