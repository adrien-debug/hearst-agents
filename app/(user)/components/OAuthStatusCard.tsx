"use client";

/**
 * Carte de statut OAuth — affichée dans le RightPanel pendant qu'un flow
 * de connexion à un service externe est en cours dans une popup.
 *
 * Visible quand `useOAuthStore().status !== "idle"`. 4 variantes :
 * - opening / active : cykan, bouton "ramener la fenêtre"
 * - success         : cykan ✓ (auto-clear après 3s côté ConnectionsHub)
 * - error           : danger + bouton "fermer"
 * - cancelled       : muted (popup fermée sans completer) + bouton "fermer"
 *
 * Le store n'est PAS persisté ; la carte disparaît au refresh — c'est
 * intentionnel, un OAuth orphelin n'a pas à survivre à un reload.
 */

import { useOAuthStore } from "@/stores/oauth";

export function OAuthStatusCard() {
  const status = useOAuthStore((s) => s.status);
  const slug = useOAuthStore((s) => s.slug);
  const appName = useOAuthStore((s) => s.appName);
  const errorMessage = useOAuthStore((s) => s.errorMessage);
  const focusPopup = useOAuthStore((s) => s.focusPopup);
  const clear = useOAuthStore((s) => s.clear);

  if (status === "idle" || !slug) return null;

  const display = appName ?? slug;

  // Couleurs et label par status. On reste sur les tokens DS exposés.
  const variant: {
    color: string;
    bg: string;
    border: string;
    label: string;
    showFocus: boolean;
    showDismiss: boolean;
  } = (() => {
    switch (status) {
      case "opening":
        return {
          color: "var(--cykan-deep)",
          bg: "var(--cykan-surface)",
          border: "var(--cykan-border)",
          label: "ouverture de la fenêtre…",
          showFocus: true,
          showDismiss: false,
        };
      case "active":
        return {
          color: "var(--cykan-deep)",
          bg: "var(--cykan-surface)",
          border: "var(--cykan-border)",
          label: "authentifie-toi dans la fenêtre",
          showFocus: true,
          showDismiss: false,
        };
      case "success":
        return {
          color: "var(--cykan-deep)",
          bg: "var(--cykan-surface)",
          border: "var(--cykan-border)",
          label: "connecté ✓",
          showFocus: false,
          showDismiss: false,
        };
      case "error":
        return {
          color: "var(--color-error)",
          bg: "var(--color-error-bg)",
          border: "var(--color-error-border)",
          label: errorMessage ?? "connexion impossible",
          showFocus: false,
          showDismiss: true,
        };
      case "cancelled":
        return {
          color: "var(--text-faint)",
          bg: "var(--surface-2)",
          border: "var(--border-shell)",
          label: "fenêtre fermée — connexion annulée",
          showFocus: false,
          showDismiss: true,
        };
      default:
        return {
          color: "var(--cykan-deep)",
          bg: "var(--cykan-surface)",
          border: "var(--cykan-border)",
          label: "",
          showFocus: false,
          showDismiss: false,
        };
    }
  })();

  return (
    <div
      role="status"
      aria-live="polite"
      className="px-4 py-3 border-b"
      style={{
        background: variant.bg,
        borderColor: variant.border,
      }}
    >
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <div
          className="t-9 font-mono uppercase flex items-baseline gap-2"
          style={{ letterSpacing: "var(--tracking-section)" }}
        >
          <span style={{ color: variant.color }}>OAUTH</span>
          <span style={{ color: "var(--text-ghost)" }}>·</span>
          <span style={{ color: "var(--text)" }}>{display}</span>
        </div>
        {variant.showDismiss && (
          <button
            type="button"
            onClick={clear}
            className="t-9 font-mono uppercase hover:text-[var(--text)] transition-colors"
            style={{
              color: "var(--text-faint)",
              letterSpacing: "var(--tracking-section)",
            }}
            aria-label="Fermer"
          >
            fermer
          </button>
        )}
      </div>

      <p
        className="t-11"
        style={{ color: "var(--text-soft)", lineHeight: "var(--leading-snug)" }}
      >
        {variant.label}
      </p>

      {variant.showFocus && (
        <button
          type="button"
          onClick={focusPopup}
          className="mt-3 t-9 font-mono uppercase transition-colors"
          style={{
            color: variant.color,
            letterSpacing: "var(--tracking-section)",
          }}
        >
          ramener la fenêtre →
        </button>
      )}
    </div>
  );
}
