"use client";

import { useCallback, useEffect, useState } from "react";
import type { SchedulerStatus, MissionOpsRecord } from "@/lib/runtime/missions/ops-types";

interface SchedulerAdminData {
  loading: boolean;
  error: boolean;
  scheduler: SchedulerStatus | null;
  missions: MissionOpsRecord[];
  refresh: () => void;
}

export function useSchedulerAdmin(): SchedulerAdminData {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [scheduler, setScheduler] = useState<SchedulerStatus | null>(null);
  const [missions, setMissions] = useState<MissionOpsRecord[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, opsRes] = await Promise.all([
        fetch("/api/v2/scheduler/status"),
        fetch("/api/v2/missions/ops"),
      ]);

      if (!statusRes.ok || !opsRes.ok) {
        setError(true);
        return;
      }

      const statusData = await statusRes.json();
      const opsData = await opsRes.json();

      setScheduler(statusData.scheduler ?? null);
      setMissions(opsData.missions ?? []);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 15_000);
    return () => clearInterval(id);
  }, [fetchData]);

  return { loading, error, scheduler, missions, refresh: fetchData };
}
