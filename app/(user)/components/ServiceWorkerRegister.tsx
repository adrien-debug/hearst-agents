"use client";

import { useEffect } from "react";

/**
 * ServiceWorkerRegister — C8 Mobile companion (PWA).
 *
 * Enregistre /sw.js au mount du layout user. Fail-soft :
 *  - Browser sans service worker support → no-op silencieux
 *  - Registration échoue (cert HTTPS, scope, etc.) → console.warn, app continue
 *  - Pas d'enregistrement en dev (sauf si NEXT_PUBLIC_ENABLE_SW=1)
 *
 * Pas d'UI, juste un mount-side effect. Component séparé pour rester
 * "use client" sans contaminer UserLayout.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const isDev = process.env.NODE_ENV === "development";
    const force = process.env.NEXT_PUBLIC_ENABLE_SW === "1";
    if (isDev && !force) return;

    let cancelled = false;

    const onLoad = () => {
      if (cancelled) return;
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          // Force update check à chaque navigation user.
          reg.update().catch(() => {});
        })
        .catch((err) => {
          console.warn("[sw] registration failed", err);
        });
    };

    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad);

    return () => {
      cancelled = true;
      window.removeEventListener("load", onLoad);
    };
  }, []);

  return null;
}
