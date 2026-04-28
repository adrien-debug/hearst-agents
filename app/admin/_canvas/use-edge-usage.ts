"use client";

import { useEffect } from "react";
import { useCanvasStore } from "./store";

/**
 * Fetches the per-edge usage map once on mount and stores it for FlowEdge to
 * derive Sankey-style stroke widths. Refresh is on a low cadence (60s) since
 * edge frequencies move slowly relative to packet animations.
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
        // network error — keep previous usage map.
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
