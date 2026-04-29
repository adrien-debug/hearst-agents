"use client";

import { useEffect, useState } from "react";
import { useNotificationsStore } from "@/stores/notifications";
import type { AppNotification } from "@/stores/notifications";

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

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        padding: "var(--space-6)",
        gap: "var(--space-4)",
        overflowY: "auto",
        color: "var(--text)",
      }}
    >
      {/* En-tête */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 className="t-18" style={{ fontWeight: "var(--weight-semibold)" as string, margin: 0 }}>
            Notifications
          </h1>
          {unreadCount > 0 && (
            <p className="t-11" style={{ color: "var(--text-muted)", margin: 0, marginTop: "var(--space-1)" }}>
              {unreadCount} non lue{unreadCount > 1 ? "s" : ""}
            </p>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => void markAllRead()}
            className="t-11"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-sm)",
              color: "var(--cykan)",
              padding: "var(--space-2) var(--space-3)",
              cursor: "pointer",
              fontWeight: "var(--weight-medium)" as string,
              transition: `opacity var(--duration-fast) var(--ease-standard)`,
            }}
          >
            Tout marquer lu
          </button>
        )}
      </div>

      {/* Filtres */}
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
        {/* Sévérité */}
        {(["all", "critical", "warning", "info"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSeverityFilter(s)}
            className="t-10"
            style={{
              padding: "var(--space-1) var(--space-3)",
              borderRadius: "var(--radius-pill)",
              border: `1px solid ${severityFilter === s ? "var(--border-strong)" : "var(--border-subtle)"}`,
              background: severityFilter === s ? "var(--surface-2)" : "transparent",
              color: s === "all"
                ? (severityFilter === "all" ? "var(--text-soft)" : "var(--text-faint)")
                : (severityFilter === s ? SEVERITY_COLORS[s] : "var(--text-faint)"),
              cursor: "pointer",
              letterSpacing: "var(--tracking-hairline)",
              transition: `all var(--duration-fast) var(--ease-standard)`,
            }}
          >
            {s === "all" ? "Tous" : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}

        <span style={{ color: "var(--border-default)", alignSelf: "center" }}>|</span>

        {/* Kind */}
        {(["all", "signal", "report_ready", "export_done", "share_viewed"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKindFilter(k)}
            className="t-10"
            style={{
              padding: "var(--space-1) var(--space-3)",
              borderRadius: "var(--radius-pill)",
              border: `1px solid ${kindFilter === k ? "var(--border-strong)" : "var(--border-subtle)"}`,
              background: kindFilter === k ? "var(--surface-2)" : "transparent",
              color: kindFilter === k ? "var(--text-soft)" : "var(--text-faint)",
              cursor: "pointer",
              letterSpacing: "var(--tracking-hairline)",
              transition: `all var(--duration-fast) var(--ease-standard)`,
            }}
          >
            {k === "all" ? "Tout type" : KIND_LABELS[k]}
          </button>
        ))}
      </div>

      {/* État chargement */}
      {loading && filtered.length === 0 && (
        <div style={{ padding: "var(--space-8)", textAlign: "center" }}>
          <p className="t-11" style={{ color: "var(--text-faint)" }}>Chargement…</p>
        </div>
      )}

      {/* État vide */}
      {!loading && filtered.length === 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "var(--space-16)",
            gap: "var(--space-3)",
          }}
        >
          <span style={{ fontSize: "48px" }}>🔔</span>
          <p className="t-13" style={{ color: "var(--text-faint)", margin: 0 }}>
            Aucune notification
          </p>
          {(severityFilter !== "all" || kindFilter !== "all") && (
            <p className="t-11" style={{ color: "var(--text-ghost)", margin: 0 }}>
              Essaie de modifier les filtres.
            </p>
          )}
        </div>
      )}

      {/* Liste */}
      {filtered.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-1)",
            borderRadius: "var(--radius-md)",
            overflow: "hidden",
            border: "1px solid var(--border-subtle)",
          }}
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
      style={{
        display: "flex",
        gap: "var(--space-3)",
        padding: "var(--space-4)",
        background: isUnread ? "var(--surface-1)" : "transparent",
        borderBottom: "1px solid var(--border-subtle)",
        cursor: isUnread ? "pointer" : "default",
      }}
      onClick={isUnread ? onRead : undefined}
    >
      {/* Indicateur sévérité */}
      <div
        style={{
          width: "var(--space-1)",
          borderRadius: "var(--radius-pill)",
          background: isUnread ? SEVERITY_COLORS[notif.severity] : "var(--border-subtle)",
          alignSelf: "stretch",
          flexShrink: 0,
        }}
      />

      {/* Contenu */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <span
            className="t-13"
            style={{
              color: isUnread ? "var(--text-soft)" : "var(--text-muted)",
              fontWeight: isUnread
                ? ("var(--weight-semibold)" as string)
                : ("var(--weight-regular)" as string),
            }}
          >
            {notif.title}
          </span>
          <span className="t-9" style={{ color: "var(--text-ghost)", whiteSpace: "nowrap" }}>
            {relativeTime(notif.created_at)}
          </span>
        </div>

        {notif.body && (
          <p
            className="t-11"
            style={{
              color: "var(--text-faint)",
              margin: 0,
              marginTop: "var(--space-1)",
            }}
          >
            {notif.body}
          </p>
        )}

        <div
          style={{
            display: "flex",
            gap: "var(--space-2)",
            marginTop: "var(--space-2)",
            flexWrap: "wrap",
          }}
        >
          <span
            className="t-9"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--space-1)",
              padding: "1px var(--space-2)",
              borderRadius: "var(--radius-xs)",
              background: SEVERITY_BG[notif.severity],
              color: SEVERITY_COLORS[notif.severity],
              letterSpacing: "var(--tracking-caption)",
              textTransform: "uppercase" as const,
            }}
          >
            {notif.severity}
          </span>
          <span
            className="t-9"
            style={{
              color: "var(--text-ghost)",
              letterSpacing: "var(--tracking-caption)",
              textTransform: "uppercase" as const,
              alignSelf: "center",
            }}
          >
            {KIND_LABELS[notif.kind]}
          </span>
        </div>
      </div>

      {/* Bouton marquer lu */}
      {isUnread && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRead();
          }}
          className="t-9"
          style={{
            alignSelf: "flex-start",
            background: "none",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-xs)",
            color: "var(--text-ghost)",
            padding: "var(--space-1) var(--space-2)",
            cursor: "pointer",
            flexShrink: 0,
            whiteSpace: "nowrap",
            transition: `color var(--duration-fast) var(--ease-standard)`,
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--cykan)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-ghost)"; }}
        >
          Marquer lu
        </button>
      )}
    </div>
  );
}
