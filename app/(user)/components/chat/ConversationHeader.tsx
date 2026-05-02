"use client";

/**
 * ConversationHeader — barre fixe en haut du ChatStage.
 *
 * Affiche :
 *   - Titre du thread (cliquable → édition inline, Enter pour valider,
 *     Esc pour annuler) → propage vers TimelineRail via updateThreadName.
 *   - Date de dernière activité (lastActivity) en relatif FR.
 *   - Compteur d'assets liés au thread (rendu uniquement si count > 0).
 *
 * Voix régulière FR, pas de mono caps. Bordure bottom var(--border-default)
 * pour séparer du contenu chat.
 */

import { useEffect, useRef, useState } from "react";
import { useNavigationStore } from "@/stores/navigation";
import { useRightPanelData } from "../right-panel/useRightPanelData";

export function ConversationHeader() {
  const activeThreadId = useNavigationStore((s) => s.activeThreadId);
  const activeThread = useNavigationStore((s) =>
    activeThreadId ? s.threads.find((t) => t.id === activeThreadId) : undefined,
  );
  const updateThreadName = useNavigationStore((s) => s.updateThreadName);
  const { assets } = useRightPanelData();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  if (!activeThread) return null;

  const assetCount = assets.length;
  const dateLabel = formatRelativeDate(activeThread.lastActivity);

  const startEdit = () => {
    setDraft(activeThread.name);
    setEditing(true);
  };

  const commitEdit = () => {
    const next = draft.trim();
    if (next && next !== activeThread.name) {
      updateThreadName(activeThread.id, next);
    }
    setEditing(false);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  return (
    <header
      className="shrink-0 flex items-center justify-between border-b border-[var(--border-default)]"
      style={{
        padding: "var(--space-4) var(--space-12)",
        gap: "var(--space-4)",
        background: "var(--bg-elev)",
      }}
    >
      <div className="flex items-baseline min-w-0" style={{ gap: "var(--space-3)" }}>
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitEdit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelEdit();
              }
            }}
            className="t-15 font-medium bg-transparent border-b border-[var(--cykan-border)] outline-none min-w-0 flex-1"
            style={{ color: "var(--text)" }}
            maxLength={120}
            aria-label="Renommer la conversation"
          />
        ) : (
          <button
            type="button"
            onClick={startEdit}
            className="t-15 font-medium truncate min-w-0 text-left transition-colors hover:text-[var(--cykan)]"
            style={{ color: "var(--text)" }}
            title="Cliquer pour renommer"
          >
            {activeThread.name || "Sans titre"}
          </button>
        )}
        <span
          className="t-11 font-light shrink-0"
          style={{ color: "var(--text-faint)" }}
        >
          {dateLabel}
        </span>
      </div>
      {assetCount > 0 && (
        <span
          className="inline-flex items-baseline shrink-0"
          style={{ gap: "var(--space-2)" }}
          title={`${assetCount} asset${assetCount > 1 ? "s" : ""} généré${assetCount > 1 ? "s" : ""} dans ce fil`}
        >
          <span
            className="t-11 font-mono tabular-nums"
            style={{ color: "var(--cykan)" }}
          >
            {assetCount.toString().padStart(2, "0")}
          </span>
          <span className="t-11 font-light" style={{ color: "var(--text-faint)" }}>
            asset{assetCount > 1 ? "s" : ""}
          </span>
        </span>
      )}
    </header>
  );
}

function formatRelativeDate(ts: number): string {
  if (!ts) return "—";
  const d = new Date(ts);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `Aujourd'hui · ${time}`;
  if (isYesterday) return `Hier · ${time}`;
  const dateStr = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  return `${dateStr} · ${time}`;
}
