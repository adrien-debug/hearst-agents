"use client";

import { useEffect, useState } from "react";

/**
 * useOfflineStatus — listen `online` / `offline` events.
 *
 * Fail-soft : si `navigator.onLine === undefined` (anciens browsers, tests SSR),
 * on assume online. Évite de bloquer l'UI sur faux négatif.
 *
 * Retour : `{ isOnline: boolean }`. Components s'en servent pour afficher
 * une bannière ou switcher en mode cache (AssetStage).
 */
export function useOfflineStatus(): { isOnline: boolean } {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (typeof navigator === "undefined") return true;
    if (typeof navigator.onLine === "undefined") return true;
    return navigator.onLine;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return { isOnline };
}
