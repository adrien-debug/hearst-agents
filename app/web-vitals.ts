/**
 * app/web-vitals.ts
 *
 * Instrumentation client des Core Web Vitals.
 *
 * Utilise le package `web-vitals` (inclus nativement dans Next.js 15).
 * Envoie les mesures via `navigator.sendBeacon` (fire-and-forget, ne bloque
 * pas le déchargement de la page). Fallback sur `fetch` si beacon non dispo.
 *
 * Appelé une seule fois depuis app/(user)/layout.tsx via un useEffect.
 */

import type { Metric } from "web-vitals";
import { onCLS, onINP, onLCP, onTTFB, onFCP } from "web-vitals";

function sendVital(reportUrl: string, metric: Metric): void {
  const payload = JSON.stringify({
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    delta: metric.delta,
    id: metric.id,
    navigationType: (metric as Metric & { navigationType?: string }).navigationType,
  });

  if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
    navigator.sendBeacon(reportUrl, payload);
  } else {
    // Fallback si sendBeacon non disponible (SSR guard ou vieux navigateur)
    fetch(reportUrl, {
      method: "POST",
      body: payload,
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    }).catch(() => {
      // Silencieux — monitoring non critique
    });
  }
}

export function initWebVitals(reportUrl: string): void {
  const report = (metric: Metric) => sendVital(reportUrl, metric);
  onCLS(report);
  onINP(report);
  onLCP(report);
  onTTFB(report);
  onFCP(report);
}
