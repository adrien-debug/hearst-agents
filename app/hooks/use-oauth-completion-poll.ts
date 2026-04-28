"use client";

/**
 * useOAuthCompletionPoll — détecte la fin d'un flow OAuth Composio.
 *
 * Pourquoi un hook : Composio termine le flow OAuth sur leur propre page
 * `platform.composio.dev/redirect?status=success`, pas sur notre redirectUri.
 * Conséquence : la popup ne navigue jamais vers /apps?connected=<slug>, donc
 * notre callback `useEffect` ne s'exécute pas, et `postMessage` est bloqué
 * cross-origin (l'origin de la popup reste celui de Composio).
 *
 * Solution : pendant que le store OAuth est en `opening` ou `active`, on
 * poll `/api/composio/connections`. Dès que le slug visé apparaît avec
 * status ACTIVE (et n'y était pas au démarrage du flow), on déclenche le
 * callback `onSuccess`, on ferme la popup et on bascule le store en
 * `success`. Le polling s'arrête automatiquement quand le store sort de
 * l'état "en cours".
 *
 * Fréquence : 2 500 ms — suffisamment court pour que l'utilisateur voie
 * la confirmation rapidement après avoir cliqué "close" dans la popup
 * Composio, suffisamment long pour ne pas saturer l'API.
 */

import { useEffect, useRef } from "react";
import { useOAuthStore } from "@/stores/oauth";

const POLL_INTERVAL_MS = 2500;

export function useOAuthCompletionPoll(onSuccess: (slug: string) => void) {
  const status = useOAuthStore((s) => s.status);
  const slug = useOAuthStore((s) => s.slug);

  // Capture l'état initial des connexions (slugs déjà actifs au moment où
  // l'OAuth démarre) pour ne déclencher onSuccess que sur une nouvelle
  // apparition. Sinon un slug déjà actif déclencherait à chaque tick.
  const initialActiveSlugsRef = useRef<Set<string> | null>(null);

  // Stocke la référence callback dans une ref pour éviter de redémarrer
  // l'interval à chaque render quand le parent change `onSuccess`.
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((status !== "opening" && status !== "active") || !slug) {
      initialActiveSlugsRef.current = null;
      return;
    }

    let cancelled = false;
    let timer: number | null = null;
    const slugLower = slug.toLowerCase();

    const tick = async () => {
      if (cancelled) return;
      try {
        const res = await fetch("/api/composio/connections", {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          connections?: Array<{ appName: string; status: string }>;
        };
        const conns = data.connections ?? [];

        // Premier tick : on capture la baseline des slugs déjà actifs.
        if (initialActiveSlugsRef.current === null) {
          initialActiveSlugsRef.current = new Set(
            conns
              .filter((c) => c.status.toUpperCase() === "ACTIVE")
              .map((c) => c.appName.toLowerCase()),
          );
          return;
        }

        // Apparition nouvelle = connexion réussie pendant le flow.
        const isActiveNow = conns.some(
          (c) =>
            c.appName.toLowerCase() === slugLower &&
            c.status.toUpperCase() === "ACTIVE",
        );
        const wasActiveBefore = initialActiveSlugsRef.current.has(slugLower);

        if (isActiveNow && !wasActiveBefore) {
          // Ferme la popup encore ouverte (l'utilisateur n'a pas cliqué close).
          const { popup } = useOAuthStore.getState();
          if (popup && !popup.closed) popup.close();
          useOAuthStore.getState().setStatus("success");
          onSuccessRef.current(slug);
          // Le store se clear côté ConnectionsHub (timeout) — pas ici, sinon
          // un cycle de re-render relancerait le polling.
        }
      } catch {
        // Erreur réseau silencieuse — on retry au prochain tick.
      } finally {
        if (!cancelled) {
          timer = window.setTimeout(tick, POLL_INTERVAL_MS);
        }
      }
    };

    timer = window.setTimeout(tick, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [status, slug]);
}
