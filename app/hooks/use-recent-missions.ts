"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";

export interface RecentMission {
  id: string;
  title: string;
  surface: string;
  status: string;
  result: string | null;
  error: string | null;
  services: string[];
  created_at: string;
  updated_at: string;
}

export function useRecentMissions() {
  const { data: session } = useSession();
  const [missions, setMissions] = useState<RecentMission[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    if (!session) {
      setMissions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch("/api/missions/recent")
      .then((r) => (r.ok ? r.json() : { missions: [] }))
      .then((data) => {
        if (Array.isArray(data.missions)) setMissions(data.missions);
      })
      .catch(() => setMissions([]))
      .finally(() => setLoading(false));
  }, [session]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { missions, loading, refresh };
}
