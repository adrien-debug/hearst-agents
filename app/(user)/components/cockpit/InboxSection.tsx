"use client";

/**
 * InboxSection — bandeau "Inbox" du CockpitStage (B7 Inbox Intelligence).
 *
 * Affiche jusqu'à 5 items prioritaires (urgent → important → info), groupés
 * visuellement par bordure de priorité dans InboxItemCard. Header avec
 * count + bouton refresh. Actions inline sur chaque card.
 *
 * États :
 *  - needsConnection : empty state CTA /apps
 *  - stale && !brief : "Aucun signal généré, lance un fetch"
 *  - stale && brief : badge "il y a Xh — Rafraîchir"
 *  - brief.empty : "Aucun signal entrant" (rare)
 *  - normal : items
 */

import { useState } from "react";
import { useStageStore } from "@/stores/stage";
import { toast } from "@/app/hooks/use-toast";
import { InboxItemCard } from "./InboxItemCard";
import type { CockpitInboxSection } from "@/lib/cockpit/today";
import type { InboxItem, SuggestedAction } from "@/lib/inbox/inbox-brief";

export interface InboxSectionProps {
  inbox: CockpitInboxSection;
  /** Callback déclenché après un refresh réussi pour re-fetch /api/v2/cockpit/today. */
  onRefreshed?: () => void;
}

const VISIBLE_COUNT = 5;

export function InboxSection({ inbox, onRefreshed }: InboxSectionProps) {
  const setCommandeurOpen = useStageStore((s) => s.setCommandeurOpen);
  const [refreshing, setRefreshing] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [optimisticHidden, setOptimisticHidden] = useState<Set<string>>(new Set());

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const res = await fetch("/api/v2/inbox/refresh", {
        method: "POST",
        credentials: "include",
      });
      if (res.status === 429) {
        toast.info("Throttle", "Déjà demandé il y a moins de 5 minutes.");
      } else if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `HTTP ${res.status}`);
      } else {
        toast.success("Inbox", "Rafraîchissement lancé.");
        // Laisser ~3s au worker (ou inline-ok immédiat) puis trigger reload.
        setTimeout(() => onRefreshed?.(), 3_000);
      }
    } catch (err) {
      toast.error("Refresh échoué", err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  };

  const handleAction = async (item: InboxItem, action: SuggestedAction) => {
    const payload = (action.payload ?? {}) as Record<string, unknown>;

    switch (action.kind) {
      case "open": {
        const url = payload.url as string | undefined;
        if (url) window.open(url, "_blank", "noopener");
        return;
      }

      case "reply": {
        // Ouvre Commandeur — l'utilisateur peut taper sa réponse.
        setCommandeurOpen(true);
        toast.info("Reply", `Tape ta réponse à : ${item.title.slice(0, 40)}…`);
        return;
      }

      case "draft": {
        const res = await fetch("/api/v2/inbox/draft", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messageId: (payload.messageId as string) ?? item.id,
            sender: payload.sender,
            subject: payload.subject,
            context: item.summary,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as { draft?: { subject: string; body: string } };
        const preview = data.draft?.body?.slice(0, 100) ?? "";
        toast.success("Brouillon prêt", preview);
        return;
      }

      case "schedule": {
        // MVP : on prépare un événement "Préparer brief" 30min avant la réunion.
        // Ouvre Commandeur si pas de date connue, sinon créé direct.
        const eventTitle = (payload.title as string) ?? item.title;
        const start = new Date(item.receivedAt - 30 * 60_000).toISOString();
        const end = new Date(item.receivedAt).toISOString();
        const res = await fetch("/api/v2/inbox/schedule", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            summary: `Préparer brief : ${eventTitle}`,
            start,
            end,
            description: item.summary,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message ?? `HTTP ${res.status}`);
        }
        toast.success("Événement créé", "Bloc de prep ajouté à ton calendrier.");
        return;
      }

      case "snooze": {
        const res = await fetch("/api/v2/inbox/snooze", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId: item.id }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message ?? `HTTP ${res.status}`);
        }
        // Optimistic UI : cache l'item localement
        setOptimisticHidden((prev) => {
          const next = new Set(prev);
          next.add(item.id);
          return next;
        });
        toast.success("Snoozed", "À demain matin.");
        return;
      }
    }
  };

  // ── Empty / connection states ──────────────────────────────

  if (inbox.needsConnection) {
    return (
      <Section count={null} stale={false} onRefresh={null}>
        <EmptyState
          text="Connecte Gmail ou Slack pour activer l'inbox."
          cta={{ label: "Voir les apps", href: "/apps" }}
        />
      </Section>
    );
  }

  const items = (inbox.brief?.items ?? []).filter((it) => !optimisticHidden.has(it.id));
  const visible = showAll ? items : items.slice(0, VISIBLE_COUNT);

  if (items.length === 0) {
    return (
      <Section
        count={0}
        stale={inbox.stale}
        onRefresh={refreshing ? "loading" : handleRefresh}
        ageLabel={inbox.brief ? formatAge(inbox.brief.generatedAt) : null}
      >
        <EmptyInbox stale={inbox.stale} brief={Boolean(inbox.brief)} />
      </Section>
    );
  }

  const urgentCount = items.filter((it) => it.priority === "urgent").length;

  return (
    <Section
      count={items.length}
      urgent={urgentCount}
      stale={inbox.stale}
      onRefresh={refreshing ? "loading" : handleRefresh}
      ageLabel={inbox.brief ? formatAge(inbox.brief.generatedAt) : null}
    >
      <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
        {visible.map((item) => (
          <InboxItemCard key={item.id} item={item} onAction={handleAction} />
        ))}
      </div>
      {!showAll && items.length > VISIBLE_COUNT && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="t-11 font-light text-[var(--text-muted)] hover:text-[var(--cykan)] transition-colors self-start"
          style={{
            padding: "var(--space-2) var(--space-3)",
            cursor: "pointer",
          }}
        >
          Voir tout ({items.length}) →
        </button>
      )}
    </Section>
  );
}

// ── Subcomponents ──────────────────────────────────────────

function Section({
  count,
  urgent,
  stale,
  ageLabel,
  onRefresh,
  children,
}: {
  count: number | null;
  urgent?: number;
  stale: boolean;
  ageLabel?: string | null;
  onRefresh: (() => void) | "loading" | null;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col" style={{ gap: "var(--space-5)" }}>
      <header className="flex items-center justify-between" style={{ gap: "var(--space-3)" }}>
        <div className="flex items-center" style={{ gap: "var(--space-3)" }}>
          <span className="t-13 font-medium text-[var(--text-l1)]">
            Inbox
          </span>
          {count !== null && count > 0 && (
            <span className="t-11 font-mono tabular-nums text-[var(--text-faint)]">
              {count.toString().padStart(2, "0")}{urgent ? ` · ${urgent} urgents` : ""}
            </span>
          )}
          {ageLabel && stale && (
            <span className="t-11 font-medium text-[var(--warn)]">
              {ageLabel}
            </span>
          )}
        </div>
        {onRefresh !== null && (
          <button
            type="button"
            onClick={onRefresh === "loading" ? undefined : onRefresh}
            disabled={onRefresh === "loading"}
            className="t-11 font-light text-[var(--cykan)] hover:opacity-80 disabled:opacity-50 transition-opacity"
            style={{
              padding: "var(--space-1) var(--space-3)",
              borderRadius: "var(--radius-pill)",
              border: "1px solid var(--border-subtle)",
              background: "transparent",
              cursor: onRefresh === "loading" ? "wait" : "pointer",
            }}
            data-testid="inbox-refresh"
          >
            {onRefresh === "loading" ? "…" : "Rafraîchir"}
          </button>
        )}
      </header>
      {children}
    </section>
  );
}

function EmptyState({ text, cta }: { text: string; cta: { label: string; href: string } }) {
  return (
    <div
      className="flex items-center justify-between"
      style={{
        padding: "var(--space-5) var(--space-6)",
        border: "1px dashed var(--border-subtle)",
        borderRadius: "var(--radius-md)",
        gap: "var(--space-4)",
      }}
    >
      <p className="t-13" style={{ color: "var(--text-l2)" }}>
        {text}
      </p>
      <a
        href={cta.href}
        className="t-13 font-light text-[var(--cykan)] hover:opacity-80 transition-opacity shrink-0"
      >
        {cta.label} →
      </a>
    </div>
  );
}

function EmptyInbox({ stale, brief }: { stale: boolean; brief: boolean }) {
  if (stale && !brief) {
    return (
      <div
        className="flex items-center"
        style={{
          padding: "var(--space-5) var(--space-6)",
          border: "1px dashed var(--border-subtle)",
          borderRadius: "var(--radius-md)",
          gap: "var(--space-4)",
        }}
      >
        <p className="t-13" style={{ color: "var(--text-l2)" }}>
          Aucun brief pour l&apos;instant. Lance un fetch pour synchroniser.
        </p>
      </div>
    );
  }
  return (
    <div
      className="flex items-center"
      style={{
        padding: "var(--space-5) var(--space-6)",
        border: "1px dashed var(--border-subtle)",
        borderRadius: "var(--radius-md)",
        gap: "var(--space-4)",
      }}
    >
      <p className="t-13" style={{ color: "var(--text-l2)" }}>
        Aucun signal entrant. Belle inbox-zero.
      </p>
    </div>
  );
}

function formatAge(generatedAt: number): string {
  const ageMs = Date.now() - generatedAt;
  const min = Math.round(ageMs / 60_000);
  if (min < 60) return `il y a ${min}min`;
  const h = Math.round(min / 60);
  return `il y a ${h}h`;
}
