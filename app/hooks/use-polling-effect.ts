"use client";

/**
 * usePollingEffect — factorise le pattern `setInterval` + cleanup pour les
 * 5 sites de polling actifs (missions/ops, runs/[id], planner, cockpit
 * tick, etc.).
 *
 * Avant : chaque page avait son propre `useEffect` avec `setInterval` +
 * `clearInterval` répétitif, parfois avec des bugs subtils (cleanup
 * absent en early return, callback closure stale).
 *
 * Maintenant : 1 hook qui :
 *  - exécute `callback` toutes les `intervalMs`
 *  - garantit un cleanup propre au unmount ou changement de deps
 *  - skip si `enabled === false` (ex. page non active, run terminé)
 *  - exécute immédiatement au mount si `immediate === true`
 *
 * Ne fusionne PAS les requêtes globalement : chaque hook reste isolé.
 * Si un jour on veut un vrai polling manager (visibility-aware, request
 * coalescing), on l'ajoutera comme couche par-dessus ce hook.
 */

import { useEffect, useRef } from "react";

interface PollingOptions {
  enabled?: boolean;
  immediate?: boolean;
}

export function usePollingEffect(
  callback: () => void | Promise<void>,
  intervalMs: number,
  deps: ReadonlyArray<unknown> = [],
  options: PollingOptions = {},
): void {
  const { enabled = true, immediate = false } = options;
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;

    const tick = () => {
      void callbackRef.current();
    };

    if (immediate) tick();

    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, immediate, ...deps]);
}
