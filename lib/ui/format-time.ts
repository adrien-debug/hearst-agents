/**
 * Helpers de formatage temporel UI.
 *
 * `formatRelative` est la source de vérité unique pour les timestamps
 * relatifs ("à l'instant", "il y a Nm", "il y a Nh", "il y a Nj",
 * "il y a Nsem", "il y a Nmo"). Précédemment dupliqué dans 4 fichiers
 * (right-panel-helpers, FocalCard inline, runs/page, assets/page),
 * tous fusionnés ici.
 *
 * **Important** : cette fonction lit `Date.now()` et est donc temps-
 * dépendante. Ne PAS l'appeler depuis un Server Component ni dans le
 * render d'un Client Component qui peut être SSR-é, sinon hydration
 * mismatch garantie. Passer par <RelativeTime /> pour le mount-only.
 */

export type RelativeInput = number | string | Date | null | undefined;

function toMillis(input: RelativeInput): number | null {
  if (input == null) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (input instanceof Date) {
    const t = input.getTime();
    return Number.isFinite(t) ? t : null;
  }
  // string — accepte ISO, RFC, ou number-as-string
  const t = new Date(input).getTime();
  return Number.isFinite(t) ? t : null;
}

export function formatRelative(input: RelativeInput): string {
  const ts = toMillis(input);
  if (ts === null) return "—";

  const diff = Date.now() - ts;
  if (diff < 0) return "à venir";

  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours}h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `il y a ${days}j`;

  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `il y a ${weeks}sem`;

  const months = Math.floor(days / 30);
  return `il y a ${months}mo`;
}
