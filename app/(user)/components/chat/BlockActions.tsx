"use client";

import { useState, useCallback, type ReactNode } from "react";
import type { BlockActionId } from "./Block";

/**
 * BlockActions — barre d'actions inline visible UNIQUEMENT au hover du
 * block parent (group-hover). Aucun cadre, pas de fond, mini icônes 12px
 * + label texte mono uppercase. Aria-labels obligatoires.
 *
 * Actions : Expand · Mission · Asset · Edit · Refine.
 */

interface ActionDef {
  id: BlockActionId;
  label: string;
  ariaLabel: string;
  icon: ReactNode;
}

const ICON_SIZE = 12;

function IconExpand() {
  return (
    <svg
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

function IconTarget() {
  return (
    <svg
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function IconArchive() {
  return (
    <svg
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect x="1" y="3" width="22" height="5" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </svg>
  );
}

function IconPencil() {
  return (
    <svg
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function IconSparkles() {
  return (
    <svg
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3v4" />
      <path d="M12 17v4" />
      <path d="M3 12h4" />
      <path d="M17 12h4" />
      <path d="m5 5 2.5 2.5" />
      <path d="m16.5 16.5 2.5 2.5" />
      <path d="m5 19 2.5-2.5" />
      <path d="m16.5 7.5 2.5-2.5" />
    </svg>
  );
}

const ACTIONS: ActionDef[] = [
  {
    id: "expand",
    label: "Ouvrir",
    ariaLabel: "Ouvrir le block en vue détaillée",
    icon: <IconExpand />,
  },
  {
    id: "mission",
    label: "Mission",
    ariaLabel: "Transformer en mission",
    icon: <IconTarget />,
  },
  {
    id: "asset",
    label: "Asset",
    ariaLabel: "Sauvegarder comme asset",
    icon: <IconArchive />,
  },
  {
    id: "edit",
    label: "Éditer",
    ariaLabel: "Éditer le block",
    icon: <IconPencil />,
  },
  {
    id: "refine",
    label: "Affiner",
    ariaLabel: "Affiner le block (re-prompt)",
    icon: <IconSparkles />,
  },
];

interface BlockActionsProps {
  onAction: (id: BlockActionId) => void;
  /**
   * Quand true, le bouton "Éditer" est rendu actif. Si false, on l'affiche
   * quand même (UX cohérente) mais le mode édition reste géré localement
   * par le block parent.
   */
  editable?: boolean;
}

export function BlockActions({ onAction, editable = true }: BlockActionsProps) {
  const [feedback, setFeedback] = useState<string | null>(null);

  const fire = useCallback(
    (id: BlockActionId, label: string) => {
      onAction(id);
      // Feedback visuel "Bientôt" pour les actions stub. Le caller détecte
      // les actions implémentées via onAction et override si besoin.
      if (id === "mission" || id === "refine") {
        setFeedback(`${label} · Bientôt`);
        window.setTimeout(() => setFeedback(null), 1500);
      } else if (id === "asset") {
        setFeedback(`${label} · Sauvegardé`);
        window.setTimeout(() => setFeedback(null), 1500);
      }
    },
    [onAction],
  );

  return (
    <div
      data-testid="block-actions"
      className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center"
      style={{
        transitionDuration: "var(--duration-base)",
        marginTop: "var(--space-3)",
        gap: "var(--space-3)",
      }}
    >
      {ACTIONS.map((action) => {
        const isEdit = action.id === "edit";
        const disabled = isEdit && !editable;
        return (
          <button
            key={action.id}
            type="button"
            aria-label={action.ariaLabel}
            data-testid={`block-action-${action.id}`}
            disabled={disabled}
            onClick={() => fire(action.id, action.label)}
            className="inline-flex items-center t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)] hover:text-[var(--cykan)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors bg-transparent"
            style={{
              gap: "var(--space-2)",
              transitionDuration: "var(--duration-base)",
            }}
          >
            <span aria-hidden className="inline-flex">
              {action.icon}
            </span>
            <span>{action.label}</span>
          </button>
        );
      })}
      {feedback && (
        <span
          role="status"
          aria-live="polite"
          className="t-9 font-mono uppercase tracking-marquee text-[var(--cykan)]"
          style={{ marginLeft: "var(--space-2)" }}
        >
          {feedback}
        </span>
      )}
    </div>
  );
}
