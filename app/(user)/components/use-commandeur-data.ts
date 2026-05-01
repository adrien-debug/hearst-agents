"use client";

/**
 * useCommandeurData — Hook fetcher pour le Commandeur sémantique.
 *
 * Stratégie :
 *  - debounce 200ms sur la query
 *  - cache LRU 10 dernières queries (memory only, scope page)
 *  - abort le fetch précédent dès qu'une nouvelle query arrive
 *  - retourne { results, loading, error }
 *
 * Quand query est vide → reset immédiat (pas de fetch). Le Commandeur
 * rend alors uniquement les sections statiques (Actions + Recent).
 */

import { useEffect, useRef, useState } from "react";

export interface CommandeurSearchResults {
  assets: Array<{ id: string; title: string; kind: string }>;
  threads: Array<{ id: string; title: string; preview: string }>;
  missions: Array<{ id: string; title: string; status: string }>;
  runs: Array<{ id: string; label: string; createdAt: string }>;
  kgNodes: Array<{ id: string; label: string; type: string }>;
}

const EMPTY: CommandeurSearchResults = {
  assets: [],
  threads: [],
  missions: [],
  runs: [],
  kgNodes: [],
};

const LRU_CAP = 10;
const DEBOUNCE_MS = 200;

interface CacheEntry {
  q: string;
  results: CommandeurSearchResults;
}

// Cache au scope module — partagé entre toutes les invocations du hook.
const lruCache: CacheEntry[] = [];

function lruGet(q: string): CommandeurSearchResults | null {
  const idx = lruCache.findIndex((e) => e.q === q);
  if (idx === -1) return null;
  // Promote to head
  const [entry] = lruCache.splice(idx, 1);
  lruCache.unshift(entry);
  return entry.results;
}

function lruSet(q: string, results: CommandeurSearchResults) {
  const idx = lruCache.findIndex((e) => e.q === q);
  if (idx !== -1) lruCache.splice(idx, 1);
  lruCache.unshift({ q, results });
  if (lruCache.length > LRU_CAP) lruCache.pop();
}

export function useCommandeurData(query: string, enabled: boolean) {
  const [results, setResults] = useState<CommandeurSearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = query.trim();

    if (!enabled || !trimmed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset des résultats quand query vide / palette fermée
      setResults(EMPTY);
      setLoading(false);
      setError(null);
      return;
    }

    const cached = lruGet(trimmed);
    if (cached) {
      setResults(cached);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/v2/search?q=${encodeURIComponent(trimmed)}&limit=20`,
          { credentials: "include", signal: controller.signal },
        );
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as CommandeurSearchResults;
        const normalized: CommandeurSearchResults = {
          assets: data.assets ?? [],
          threads: data.threads ?? [],
          missions: data.missions ?? [],
          runs: data.runs ?? [],
          kgNodes: data.kgNodes ?? [],
        };
        lruSet(trimmed, normalized);
        if (!controller.signal.aborted) {
          setResults(normalized);
          setLoading(false);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        const reason = err instanceof Error ? err.message : "Erreur recherche";
        setError(reason);
        setLoading(false);
        setResults(EMPTY);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, enabled]);

  return { results, loading, error };
}
