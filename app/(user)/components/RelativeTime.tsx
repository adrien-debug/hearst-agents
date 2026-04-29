"use client";

/**
 * RelativeTime — Affichage mounted-only d'un timestamp relatif.
 *
 * Pourquoi : `formatRelative` lit `Date.now()` à chaque render. Si on
 * l'appelle directement dans le JSX d'un composant SSR-é, le label
 * calculé côté serveur ("il y a 2m") diffère de celui calculé côté
 * client ("à l'instant") quelques ms plus tard → hydration mismatch
 * → React régénère tout le subtree, flicker, perte de focus possible,
 * et dans les cas voix/WebRTC ça peut interrompre une session.
 *
 * Solution : SSR rend juste le `fallback` (vide par défaut), et au
 * mount client on calcule le vrai label + on rafraîchit toutes les
 * 30 secondes pour que "à l'instant" devienne "il y a 1m" sans
 * action user. `suppressHydrationWarning` est légitime ici : le span
 * est INTENTIONNELLEMENT différent server vs client.
 */

import { useEffect, useState } from "react";
import { formatRelative, type RelativeInput } from "@/lib/ui/format-time";

interface RelativeTimeProps {
  ts: RelativeInput;
  /** Texte rendu côté SSR (et avant le premier tick client). Vide par défaut. */
  fallback?: string;
  className?: string;
}

const REFRESH_MS = 30_000;

export function RelativeTime({ ts, fallback = "", className }: RelativeTimeProps) {
  const [label, setLabel] = useState(fallback);

  useEffect(() => {
    const update = () => setLabel(formatRelative(ts));
    update();
    const interval = setInterval(update, REFRESH_MS);
    return () => clearInterval(interval);
  }, [ts]);

  return (
    <span className={className} suppressHydrationWarning>
      {label}
    </span>
  );
}
