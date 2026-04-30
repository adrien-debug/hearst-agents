"use client";

/**
 * InboxItemCard — card actionnable pour un item Inbox dans le CockpitStage.
 *
 * Layout :
 *  - Glyph (kind: 📧/💬/📅) + priorité (couleur de bordure gauche)
 *  - Title + summary
 *  - Action buttons inline (selon suggestedActions)
 *
 * Actions :
 *  - reply / draft / schedule : POST sur leur endpoint respectif
 *  - snooze : POST /api/v2/inbox/snooze + onSnoozed
 *  - open : navigate ou window.open
 */

import { useState } from "react";
import { toast } from "@/app/hooks/use-toast";
import type { InboxItem, SuggestedAction, InboxItemPriority } from "@/lib/inbox/inbox-brief";

export interface InboxItemCardProps {
  item: InboxItem;
  onAction: (item: InboxItem, action: SuggestedAction) => void | Promise<void>;
}

function glyph(kind: InboxItem["kind"]): string {
  switch (kind) {
    case "email":
      return "📧";
    case "slack":
      return "💬";
    case "calendar":
      return "📅";
  }
}

function priorityBorder(priority: InboxItemPriority): string {
  switch (priority) {
    case "urgent":
      return "var(--danger)";
    case "important":
      return "var(--warn)";
    case "info":
      return "var(--text-ghost)";
  }
}

function priorityLabel(priority: InboxItemPriority): string {
  switch (priority) {
    case "urgent":
      return "urgent";
    case "important":
      return "important";
    case "info":
      return "info";
  }
}

export function InboxItemCard({ item, onAction }: InboxItemCardProps) {
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const handleClick = async (action: SuggestedAction) => {
    if (pendingAction) return;
    setPendingAction(action.kind);
    try {
      await onAction(item, action);
    } catch (err) {
      toast.error("Action échouée", err instanceof Error ? err.message : String(err));
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div
      className="halo-suggestion flex flex-col text-left"
      style={{
        padding: "var(--space-4)",
        gap: "var(--space-3)",
        borderLeft: `2px solid ${priorityBorder(item.priority)}`,
      }}
      data-testid={`inbox-item-${item.id}`}
      data-priority={item.priority}
      data-kind={item.kind}
    >
      <div className="flex items-start justify-between" style={{ gap: "var(--space-3)" }}>
        <div className="flex-1 min-w-0 flex items-start" style={{ gap: "var(--space-3)" }}>
          <span
            aria-hidden
            className="shrink-0"
            style={{ fontSize: "var(--space-4)", lineHeight: 1 }}
          >
            {glyph(item.kind)}
          </span>
          <div className="flex-1 min-w-0">
            <p
              className="t-13 truncate"
              style={{ fontWeight: 500, color: "var(--text-l0)" }}
            >
              {item.title}
            </p>
            <p
              className="t-11 truncate"
              style={{ color: "var(--text-faint)", marginTop: "var(--space-1)" }}
            >
              {item.summary}
            </p>
          </div>
        </div>

        <span
          className="t-9 font-mono uppercase shrink-0"
          style={{
            letterSpacing: "var(--tracking-marquee)",
            color: priorityBorder(item.priority),
          }}
        >
          {priorityLabel(item.priority)}
        </span>
      </div>

      <div className="flex flex-wrap items-center" style={{ gap: "var(--space-2)" }}>
        <span
          className="t-9 font-mono uppercase"
          style={{
            letterSpacing: "var(--tracking-marquee)",
            color: "var(--text-faint)",
          }}
        >
          {item.source}
        </span>
        <span style={{ flex: 1 }} />
        {item.suggestedActions.map((action) => (
          <button
            key={action.kind}
            type="button"
            onClick={() => handleClick(action)}
            disabled={pendingAction !== null}
            className="t-9 font-mono uppercase disabled:opacity-50"
            style={{
              letterSpacing: "var(--tracking-marquee)",
              color: "var(--cykan)",
              padding: "var(--space-1) var(--space-3)",
              borderRadius: "var(--radius-pill)",
              border: "1px solid var(--border-subtle)",
              background: "transparent",
              cursor: "pointer",
            }}
            data-action-kind={action.kind}
          >
            {pendingAction === action.kind ? "…" : action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
