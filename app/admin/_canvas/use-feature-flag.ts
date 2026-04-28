"use client";

import { useCallback, useEffect, useState } from "react";

interface SettingRow {
  key: string;
  value: unknown;
  category: string;
}

/**
 * Tiny hook for one feature flag. Fetches the flag's current value from
 * `/api/admin/settings?category=feature_flags` on mount, and flips it via
 * `POST /api/admin/settings` (optimistic + revert on failure).
 */
export function useFeatureFlag(key: string, defaultValue: boolean) {
  const [value, setValueState] = useState<boolean>(defaultValue);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      if (!cancelled) setLoading(true);
    });
    (async () => {
      try {
        const res = await fetch("/api/admin/settings?category=feature_flags");
        if (!res.ok) {
          // Auth or server error — keep default, surface silently.
          if (!cancelled) {
            setValueState(defaultValue);
            setError(null);
          }
          return;
        }
        const text = await res.text();
        if (!text) {
          if (!cancelled) setValueState(defaultValue);
          return;
        }
        const data = JSON.parse(text) as { settings?: SettingRow[] };
        if (cancelled) return;
        const row = data?.settings?.find((s) => s.key === key);
        if (row) setValueState(row.value === true || row.value === "true");
        else setValueState(defaultValue);
        setError(null);
      } catch {
        if (!cancelled) setValueState(defaultValue);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [key, defaultValue]);

  const setValue = useCallback(
    async (next: boolean) => {
      const prev = value;
      setValueState(next);
      setLoading(true);
      try {
        const res = await fetch("/api/admin/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, value: next, category: "feature_flags" }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setError(null);
      } catch (e: unknown) {
        setValueState(prev);
        setError(e instanceof Error ? e.message : "save failed");
      } finally {
        setLoading(false);
      }
    },
    [key, value],
  );

  return { value, loading, error, setValue };
}
