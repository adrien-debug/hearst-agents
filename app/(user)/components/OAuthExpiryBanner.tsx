"use client";

/**
 * OAuthExpiryBanner — bandeau d'alerte discret pour les tokens OAuth expirants.
 *
 * - Visible si des connexions expirent dans moins de AUTH_EXPIRING_DAYS_THRESHOLD jours
 * - Rouge si < AUTH_CRITICAL_DAYS_THRESHOLD jours, jaune sinon
 * - Dismissable (état local React — pas de DB)
 * - Charge les connexions via API /api/connections/expiring (lazy, SSR-safe)
 *
 * Tokens utilisés : --danger, --warn, --text-muted, --space-*, --radius-sm
 * Typo : .t-9 (label mono)
 */

import { useState, useEffect } from "react";
import {
  AUTH_EXPIRING_DAYS_THRESHOLD,
  AUTH_CRITICAL_DAYS_THRESHOLD,
  type ExpiringConnection,
} from "@/lib/connections/oauth-constants";

// ── Composant interne : badge connexion ──────────────────────

function ConnectionBadge({
  conn,
}: {
  conn: ExpiringConnection;
}) {
  const isCritical =
    conn.daysUntilExpiry !== null &&
    conn.daysUntilExpiry <= AUTH_CRITICAL_DAYS_THRESHOLD;
  const color = isCritical ? "var(--danger)" : "var(--warn)";

  const label =
    conn.daysUntilExpiry === 0 || conn.status === "expired"
      ? "expiré"
      : conn.daysUntilExpiry !== null
        ? `${conn.daysUntilExpiry}j`
        : "bientôt";

  return (
    <span
      className="inline-flex items-center gap-1 px-2 rounded-sm"
      style={{
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
        height: "var(--space-5)",
      }}
    >
      <span className="t-9 font-mono" style={{ color }}>
        {conn.appName}
      </span>
      <span className="t-9 font-mono" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
    </span>
  );
}

// ── Composant principal ──────────────────────────────────────

export function OAuthExpiryBanner() {
  const [connections, setConnections] = useState<ExpiringConnection[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/connections/expiring", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) return;
        const data: { connections: ExpiringConnection[] } = await res.json();
        if (!cancelled && Array.isArray(data.connections)) {
          setConnections(data.connections);
        }
      } catch {
        // Silencieux — le banner est non-critique
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  if (!loaded || dismissed || connections.length === 0) return null;

  // Couleur globale du banner = rouge si au moins une critique
  const hasCritical = connections.some(
    (c) => c.daysUntilExpiry !== null && c.daysUntilExpiry <= AUTH_CRITICAL_DAYS_THRESHOLD,
  );
  const bannerColor = hasCritical ? "var(--danger)" : "var(--warn)";
  const count = connections.length;
  const plural = count > 1 ? "connexions expirent" : "connexion expire";

  return (
    <div
      role="alert"
      className="flex items-center gap-3 px-4 py-2 shrink-0"
      style={{
        background: `color-mix(in srgb, ${bannerColor} 8%, var(--bg-elev))`,
        borderBottom: `1px solid color-mix(in srgb, ${bannerColor} 20%, transparent)`,
        transition: `opacity var(--duration-base) var(--ease-standard)`,
      }}
    >
      {/* Indicateur coloré */}
      <span
        className="shrink-0 w-1.5 h-1.5 rounded-pill"
        style={{ background: bannerColor }}
        aria-hidden="true"
      />

      {/* Message principal */}
      <span className="t-9 font-mono flex-1 min-w-0 truncate" style={{ color: "var(--text-muted)" }}>
        <span style={{ color: bannerColor }}>
          {count} {plural}
        </span>
        {" dans moins de "}{AUTH_EXPIRING_DAYS_THRESHOLD}{"j —"}
      </span>

      {/* Badges connexions */}
      <div className="flex items-center gap-2 shrink-0 hidden sm:flex">
        {connections.slice(0, 3).map((c) => (
          <ConnectionBadge key={c.connectionId} conn={c} />
        ))}
        {connections.length > 3 && (
          <span className="t-9 font-mono" style={{ color: "var(--text-muted)" }}>
            +{connections.length - 3}
          </span>
        )}
      </div>

      {/* CTA Reconnecter */}
      <a
        href="/connections"
        className="t-9 font-mono shrink-0 underline decoration-dotted"
        style={{ color: bannerColor }}
      >
        Reconnecter
      </a>

      {/* Dismiss */}
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="shrink-0 flex items-center justify-center rounded-sm"
        style={{
          width: "var(--space-5)",
          height: "var(--space-5)",
          color: "var(--text-ghost)",
          background: "transparent",
          border: "none",
          cursor: "pointer",
        }}
        aria-label="Masquer cette alerte"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
          <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
