"use client";

import { useEffect, useRef, useState } from "react";
import { useNotificationsStore } from "@/stores/notifications";
import type { AppNotification } from "@/stores/notifications";

// ── Icônes inline (aucune dépendance externe) ──────────────────────────────

function BellIcon({ hasUnread }: { hasUnread: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke={hasUnread ? "var(--text)" : "var(--text-muted)"}
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function SeverityDot({ severity }: { severity: AppNotification["severity"] }) {
  const color =
    severity === "critical"
      ? "var(--danger)"
      : severity === "warning"
        ? "var(--warn)"
        : "var(--color-info)";
  return (
    <span
      style={{
        width: "var(--space-2)",
        height: "var(--space-2)",
        borderRadius: "var(--radius-pill)",
        background: color,
        flexShrink: 0,
        display: "inline-block",
        marginTop: "var(--space-1)",
      }}
    />
  );
}

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

function kindLabel(kind: AppNotification["kind"]): string {
  switch (kind) {
    case "signal":
      return "Signal";
    case "report_ready":
      return "Rapport prêt";
    case "export_done":
      return "Export terminé";
    case "share_viewed":
      return "Partage consulté";
  }
}

// ── Composant principal ────────────────────────────────────────────────────

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const notifications = useNotificationsStore((s) => s.notifications);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const loading = useNotificationsStore((s) => s.loading);
  const markRead = useNotificationsStore((s) => s.markRead);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);
  const startPolling = useNotificationsStore((s) => s.startPolling);
  const stopPolling = useNotificationsStore((s) => s.stopPolling);

  // Polling actif tant que le composant est monté
  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  // Ferme le dropdown si clic extérieur
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Ferme avec Echap
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const preview = notifications.slice(0, 10);
  const hasUnread = unreadCount > 0;

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-flex" }}>
      {/* Bouton cloche */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${hasUnread ? ` (${unreadCount} non lues)` : ""}`}
        aria-expanded={open}
        style={{
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "var(--space-8)",
          height: "var(--space-8)",
          borderRadius: "var(--radius-md)",
          border: "none",
          background: open ? "var(--surface-2)" : "transparent",
          cursor: "pointer",
          transition: `background var(--duration-base) var(--ease-standard)`,
          outline: "none",
        }}
        onMouseEnter={(e) => {
          if (!open) (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-1)";
        }}
        onMouseLeave={(e) => {
          if (!open) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
        }}
        onFocus={(e) => {
          (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 0 2px var(--border-focus)";
        }}
        onBlur={(e) => {
          (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
        }}
      >
        <BellIcon hasUnread={hasUnread} />
        {/* Badge */}
        {hasUnread && (
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: "var(--space-1)",
              right: "var(--space-1)",
              minWidth: "var(--space-4)",
              height: "var(--space-4)",
              borderRadius: "var(--radius-pill)",
              background: "var(--danger)",
              color: "var(--text)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 3px",
              lineHeight: 1,
              fontWeight: "var(--weight-bold)" as string,
              fontSize: "9px",
              letterSpacing: "var(--tracking-hairline)",
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          style={{
            position: "absolute",
            top: "calc(100% + var(--space-2))",
            right: 0,
            width: "clamp(300px, 22vw, 380px)",
            borderRadius: "var(--radius-lg)",
            background: "var(--mat-400)",
            border: "1px solid var(--border-default)",
            boxShadow: "var(--shadow-card)",
            zIndex: "var(--z-modal)" as unknown as number,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "var(--space-3) var(--space-4)",
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            <span
              className="t-11"
              style={{
                color: "var(--text-soft)",
                fontWeight: "var(--weight-semibold)" as string,
                letterSpacing: "var(--tracking-caption)",
                textTransform: "uppercase" as const,
              }}
            >
              Notifications
            </span>
            <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
              {loading && (
                <span className="t-9" style={{ color: "var(--text-faint)" }}>
                  Actualisation…
                </span>
              )}
              {hasUnread && (
                <button
                  onClick={() => void markAllRead()}
                  className="t-9"
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--cykan)",
                    padding: "var(--space-1) var(--space-2)",
                    borderRadius: "var(--radius-xs)",
                    letterSpacing: "var(--tracking-hairline)",
                    transition: `opacity var(--duration-fast) var(--ease-standard)`,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.7"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
                >
                  Tout marquer lu
                </button>
              )}
            </div>
          </div>

          {/* Liste */}
          <div
            style={{
              maxHeight: "clamp(200px, 40vh, 400px)",
              overflowY: "auto",
            }}
          >
            {preview.length === 0 ? (
              <div
                style={{
                  padding: "var(--space-8) var(--space-4)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "var(--space-2)",
                }}
              >
                <span
                  style={{ color: "var(--text-ghost)", display: "inline-flex" }}
                  aria-hidden
                >
                  <BellIcon hasUnread={false} />
                </span>
                <span className="t-11" style={{ color: "var(--text-faint)" }}>
                  Aucune notification
                </span>
              </div>
            ) : (
              preview.map((notif) => (
                <NotifRow
                  key={notif.id}
                  notif={notif}
                  onRead={() => void markRead(notif.id)}
                />
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 10 && (
            <div
              style={{
                padding: "var(--space-2) var(--space-4)",
                borderTop: "1px solid var(--border-subtle)",
                textAlign: "center",
              }}
            >
              <a
                href="/notifications"
                className="t-9"
                onClick={() => setOpen(false)}
                style={{
                  color: "var(--cykan)",
                  textDecoration: "none",
                  letterSpacing: "var(--tracking-hairline)",
                }}
              >
                Voir toutes les notifications →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Ligne notification ─────────────────────────────────────────────────────

function NotifRow({
  notif,
  onRead,
}: {
  notif: AppNotification;
  onRead: () => void;
}) {
  const isUnread = notif.read_at === null;

  return (
    <button
      onClick={onRead}
      style={{
        width: "100%",
        display: "flex",
        gap: "var(--space-3)",
        padding: "var(--space-3) var(--space-4)",
        background: isUnread ? "var(--surface-1)" : "transparent",
        border: "none",
        borderBottom: "1px solid var(--border-subtle)",
        cursor: "pointer",
        textAlign: "left",
        transition: `background var(--duration-fast) var(--ease-standard)`,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-2)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = isUnread
          ? "var(--surface-1)"
          : "transparent";
      }}
    >
      <SeverityDot severity={notif.severity} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)" }}>
          <span
            className="t-11"
            style={{
              color: isUnread ? "var(--text-soft)" : "var(--text-muted)",
              fontWeight: isUnread
                ? ("var(--weight-semibold)" as string)
                : ("var(--weight-regular)" as string),
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
            }}
          >
            {notif.title}
          </span>
          <span
            className="t-9"
            style={{
              color: "var(--text-ghost)",
              whiteSpace: "nowrap",
              letterSpacing: "var(--tracking-hairline)",
              flexShrink: 0,
            }}
          >
            {relativeTime(notif.created_at)}
          </span>
        </div>
        {notif.body && (
          <p
            className="t-10"
            style={{
              color: "var(--text-faint)",
              margin: 0,
              marginTop: "var(--space-1)",
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {notif.body}
          </p>
        )}
        <span
          className="t-9"
          style={{
            color: "var(--text-ghost)",
            marginTop: "var(--space-1)",
            display: "block",
            letterSpacing: "var(--tracking-caption)",
            textTransform: "uppercase" as const,
          }}
        >
          {kindLabel(notif.kind)}
        </span>
      </div>
    </button>
  );
}
