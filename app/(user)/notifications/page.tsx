"use client";

/**
 * /notifications — Centre de notifications complet.
 *
 * Liste filtrable par sévérité (critical/warning/info) et par type
 * (signal/report_ready/export_done/share_viewed). Mark-read individuel
 * + mark-all-read.
 *
 * Tokens uniquement (CLAUDE.md §1) — refactor depuis 100% inline styles
 * vers Tailwind + tokens CSS via classes.
 */

import { useEffect, useState } from "react";
import { useNotificationsStore } from "@/stores/notifications";
import type { AppNotification } from "@/stores/notifications";
import { PageHeader } from "../components/PageHeader";
import { EmptyState, RowSkeleton } from "../components/ui";

// ── Helpers ────────────────────────────────────────────────────────────────

function relativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `Il y a ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Il y a ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `Il y a ${days}j`;
}

const SEVERITY_COLORS: Record<AppNotification["severity"], string> = {
  critical: "var(--danger)",
  warning: "var(--warn)",
  info: "var(--color-info)",
};

const SEVERITY_BG: Record<AppNotification["severity"], string> = {
  critical: "var(--color-error-bg)",
  warning: "var(--color-warning-bg)",
  info: "var(--color-info-bg)",
};

const KIND_LABELS: Record<AppNotification["kind"], string> = {
  signal: "Signal",
  report_ready: "Rapport prêt",
  export_done: "Export terminé",
  share_viewed: "Partage consulté",
};

const SEVERITY_LABELS: Record<AppNotification["severity"], string> = {
  critical: "Critique",
  warning: "Avertissement",
  info: "Info",
};

// ── Icônes ─────────────────────────────────────────────────────────────────

function BellIcon() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

// ── Composant ──────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const notifications = useNotificationsStore((s) => s.notifications);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const loading = useNotificationsStore((s) => s.loading);
  const markRead = useNotificationsStore((s) => s.markRead);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);
  const fetchNotifications = useNotificationsStore((s) => s.fetchNotifications);

  const [severityFilter, setSeverityFilter] = useState<AppNotification["severity"] | "all">("all");
  const [kindFilter, setKindFilter] = useState<AppNotification["kind"] | "all">("all");

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  const filtered = notifications.filter((n) => {
    if (severityFilter !== "all" && n.severity !== severityFilter) return false;
    if (kindFilter !== "all" && n.kind !== kindFilter) return false;
    return true;
  });

  const subtitle = unreadCount > 0
    ? `${unreadCount} non lue${unreadCount > 1 ? "s" : ""}`
    : "Aucune notification non lue";

  return (
    <div
      className="flex-1 flex flex-col min-h-0 overflow-y-auto text-[var(--text)]"
      style={{ background: "var(--bg-elev)" }}
    >
      <PageHeader
        title="Notifications"
        subtitle={subtitle}
        breadcrumb={[{ label: "Hearst", href: "/" }, { label: "Notifications" }]}
        actions={
          unreadCount > 0 ? (
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="t-11 font-medium px-3 py-2 rounded-md transition-colors text-[var(--cykan)] bg-[var(--surface-1)] border border-[var(--border-default)] hover:text-[var(--text)] hover:border-[var(--cykan-border-hover)]"
              style={{
                transitionDuration: "var(--duration-fast)",
                transitionTimingFunction: "var(--ease-standard)",
              }}
            >
              Tout marquer lu
            </button>
          ) : null
        }
      />

      <div
        className="flex flex-col px-12 py-6"
        style={{ gap: "var(--space-4)" }}
      >
        {/* Filtres */}
        <div className="flex flex-wrap items-center" style={{ gap: "var(--space-2)" }}>
          {/* Sévérité */}
          {(["all", "critical", "warning", "info"] as const).map((s) => {
            const isActive = severityFilter === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSeverityFilter(s)}
                className="t-10 px-3 py-1 rounded-pill border transition-colors"
                style={{
                  borderColor: isActive ? "var(--border-strong)" : "var(--border-subtle)",
                  background: isActive ? "var(--surface-2)" : "transparent",
                  color: s === "all"
                    ? (isActive ? "var(--text-soft)" : "var(--text-faint)")
                    : (isActive ? SEVERITY_COLORS[s] : "var(--text-faint)"),
                  letterSpacing: "var(--tracking-hairline)",
                  transitionDuration: "var(--duration-fast)",
                  transitionTimingFunction: "var(--ease-standard)",
                }}
              >
                {s === "all" ? "Tous" : SEVERITY_LABELS[s]}
              </button>
            );
          })}

          <span
            aria-hidden
            className="self-center text-[var(--border-default)]"
          >
            |
          </span>

          {/* Kind */}
          {(["all", "signal", "report_ready", "export_done", "share_viewed"] as const).map((k) => {
            const isActive = kindFilter === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKindFilter(k)}
                className="t-10 px-3 py-1 rounded-pill border transition-colors"
                style={{
                  borderColor: isActive ? "var(--border-strong)" : "var(--border-subtle)",
                  background: isActive ? "var(--surface-2)" : "transparent",
                  color: isActive ? "var(--text-soft)" : "var(--text-faint)",
                  letterSpacing: "var(--tracking-hairline)",
                  transitionDuration: "var(--duration-fast)",
                  transitionTimingFunction: "var(--ease-standard)",
                }}
              >
                {k === "all" ? "Tout type" : KIND_LABELS[k]}
              </button>
            );
          })}
        </div>

        {/* État chargement */}
        {loading && filtered.length === 0 && (
          <RowSkeleton count={4} height="var(--space-20)" />
        )}

        {/* État vide */}
        {!loading && filtered.length === 0 && (
          <EmptyState
            icon={<BellIcon />}
            title="Aucune notification"
            description={
              severityFilter !== "all" || kindFilter !== "all"
                ? "Modifie les filtres pour élargir la sélection."
                : undefined
            }
          />
        )}

        {/* Liste */}
        {filtered.length > 0 && (
          <div
            className="flex flex-col overflow-hidden rounded-md border border-[var(--border-subtle)]"
            style={{ gap: "1px" }}
          >
            {filtered.map((notif) => (
              <NotifCard
                key={notif.id}
                notif={notif}
                onRead={() => void markRead(notif.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Carte notification ─────────────────────────────────────────────────────

function NotifCard({
  notif,
  onRead,
}: {
  notif: AppNotification;
  onRead: () => void;
}) {
  const isUnread = notif.read_at === null;

  return (
    <div
      className={`flex border-b border-[var(--border-subtle)] last:border-b-0 transition-colors ${
        isUnread ? "bg-[var(--surface-1)] cursor-pointer" : "bg-transparent"
      }`}
      style={{
        gap: "var(--space-3)",
        padding: "var(--space-4)",
      }}
      onClick={isUnread ? onRead : undefined}
    >
      {/* Indicateur sévérité */}
      <div
        className="rounded-pill shrink-0 self-stretch"
        style={{
          width: "var(--space-1)",
          background: isUnread ? SEVERITY_COLORS[notif.severity] : "var(--border-subtle)",
        }}
        aria-hidden
      />

      {/* Contenu */}
      <div className="flex-1 min-w-0 flex flex-col" style={{ gap: "var(--space-1)" }}>
        <div className="flex flex-wrap items-baseline justify-between" style={{ gap: "var(--space-2)" }}>
          <span
            className={`t-13 ${isUnread ? "text-[var(--text-soft)] font-semibold" : "text-[var(--text-muted)] font-normal"}`}
          >
            {notif.title}
          </span>
          <span className="t-9 text-[var(--text-ghost)] whitespace-nowrap">
            {relativeTime(notif.created_at)}
          </span>
        </div>

        {notif.body && (
          <p className="t-11 text-[var(--text-faint)] m-0">
            {notif.body}
          </p>
        )}

        <div
          className="flex flex-wrap items-center"
          style={{ gap: "var(--space-2)", marginTop: "var(--space-1)" }}
        >
          <span
            className="t-9 font-medium inline-flex items-center rounded-xs"
            style={{
              padding: "1px var(--space-2)",
              background: SEVERITY_BG[notif.severity],
              color: SEVERITY_COLORS[notif.severity],
              borderRadius: "var(--radius-xs)",
            }}
          >
            {SEVERITY_LABELS[notif.severity]}
          </span>
          <span className="t-9 font-light text-[var(--text-ghost)]">
            {KIND_LABELS[notif.kind]}
          </span>
        </div>
      </div>

      {/* Bouton marquer lu */}
      {isUnread && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRead();
          }}
          className="t-9 self-start whitespace-nowrap shrink-0 px-2 py-1 rounded-xs border border-[var(--border-subtle)] bg-transparent text-[var(--text-ghost)] hover:text-[var(--cykan)] transition-colors"
          style={{
            borderRadius: "var(--radius-xs)",
            transitionDuration: "var(--duration-fast)",
            transitionTimingFunction: "var(--ease-standard)",
          }}
        >
          Marquer lu
        </button>
      )}
    </div>
  );
}
