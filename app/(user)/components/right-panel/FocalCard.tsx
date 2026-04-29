"use client";

/**
 * FocalCard — Zone de notifications communication (emails, messages, alerts).
 *
 * Structure FIXE : container toujours rendu, même hauteur (var(--space-32)),
 * même header. Empty state à l'intérieur — pas d'early return qui change la
 * structure du DOM.
 */

import { useFocalStore } from "@/stores/focal";
import { useRuntimeStore } from "@/stores/runtime";
import { AssetGlyphSVG } from "../right-panel-helpers";

interface FocalCardProps {
  focalObject?: unknown;
  secondaryObjects?: unknown[];
  activeThreadId: string | null;
}

interface CommNotification {
  id: string;
  type: "email" | "message" | "slack" | "alert" | "approval";
  title: string;
  subtitle?: string;
  timestamp: number;
  priority: "normal" | "high" | "urgent";
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours}h`;
  return `il y a ${Math.floor(hours / 24)}j`;
}

function useNotifications(): CommNotification[] {
  const events = useRuntimeStore((s) => s.events);
  const notifications: CommNotification[] = [];

  for (const event of events.slice(0, 10)) {
    if (event.type === "email_received" || event.type === "message_received") {
      notifications.push({
        id: `${event.timestamp}-${event.type}`,
        type: event.type === "email_received" ? "email" : "message",
        title: (event.title as string) || (event.subject as string) || "Nouveau message",
        subtitle: (event.sender as string) || (event.from as string),
        timestamp: event.timestamp,
        priority: "normal",
      });
    } else if (event.type === "approval_requested") {
      notifications.push({
        id: `${event.timestamp}-approval`,
        type: "approval",
        title: "Validation requise",
        subtitle: (event.title as string) || "Action nécessaire",
        timestamp: event.timestamp,
        priority: "urgent",
      });
    } else if (event.type === "tool_call_completed" && event.tool?.toString().includes("slack")) {
      notifications.push({
        id: `${event.timestamp}-slack`,
        type: "slack",
        title: "Message Slack envoyé",
        subtitle: (event.channel as string) || "Slack",
        timestamp: event.timestamp,
        priority: "normal",
      });
    }
  }

  return notifications.slice(0, 3);
}

function NotificationGlyph({ type }: { type: CommNotification["type"] }) {
  const glyphs: Record<typeof type, string> = {
    email: "message",
    message: "message",
    slack: "message",
    alert: "brief",
    approval: "brief",
  };
  return (
    <span className="w-8 h-8 text-[var(--cykan)]" aria-hidden>
      <AssetGlyphSVG type={glyphs[type]} />
    </span>
  );
}

function NotificationPill({ priority }: { priority: CommNotification["priority"] }) {
  const config = {
    normal: { color: "var(--text-faint)", bg: "var(--surface-1)", label: "info" },
    high: { color: "var(--warn)", bg: "var(--surface-1)", label: "important" },
    urgent: { color: "var(--danger)", bg: "var(--surface-1)", label: "urgent" },
  };
  const c = config[priority];
  return (
    <span
      className="t-9 font-mono uppercase tracking-stretch px-2 py-0.5 rounded-sm"
      style={{
        color: c.color,
        background: c.bg,
      }}
    >
      {c.label}
    </span>
  );
}

export function FocalCard({ activeThreadId: _activeThreadId }: FocalCardProps) {
  const show = useFocalStore((s) => s.show);
  const notifications = useNotifications();
  const [latest, ...rest] = notifications;
  const hasNotifications = notifications.length > 0;

  return (
    <div
      className="border-b border-[var(--border-shell)] flex flex-col px-4 py-4"
      style={{ height: "var(--space-32)" }}
    >
      {/* Header — toujours rendu */}
      <div className="flex items-center justify-between mb-2 shrink-0">
        <p className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
          Notifications
        </p>
        <span className="t-9 font-mono tracking-display text-[var(--text-ghost)]">
          {hasNotifications && rest.length > 0
            ? `+${rest.length}`
            : notifications.length.toString().padStart(2, "0")}
        </span>
      </div>

      {/* Corps — bouton si plein, empty state si vide. Même hauteur dans les deux cas. */}
      {hasNotifications && latest ? (
        <button
          type="button"
          onClick={show}
          className="flex-1 min-h-0 flex items-center gap-3 cursor-pointer text-left rounded-sm overflow-hidden hover:bg-[var(--cykan-bg-hover)] transition-colors"
          style={{ background: "var(--surface-1)", padding: "var(--space-3)" }}
        >
          <NotificationGlyph type={latest.type} />
          <span className="flex-1 min-w-0 flex flex-col gap-1">
            <span className="flex items-center gap-2">
              <span
                className="t-13 font-medium text-[var(--text)] leading-snug truncate"
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 1,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {latest.title}
              </span>
              <NotificationPill priority={latest.priority} />
            </span>
            {latest.subtitle && (
              <span className="t-9 text-[var(--text-muted)] truncate">{latest.subtitle}</span>
            )}
            <span className="t-9 font-mono text-[var(--text-faint)]">
              {formatTimeAgo(latest.timestamp)}
            </span>
          </span>
        </button>
      ) : (
        <div
          className="flex-1 min-h-0 flex items-center gap-3 rounded-sm"
          style={{
            background: "var(--card-flat-bg)",
            border: "1px dashed var(--card-flat-border)",
            padding: "var(--space-3)",
          }}
        >
          <span
            className="shrink-0 w-8 h-8 text-[var(--text-faint)]"
            style={{ opacity: 0.3 }}
            aria-hidden
          >
            <AssetGlyphSVG type="message" />
          </span>
          <div className="flex-1 min-w-0 flex flex-col">
            <p className="t-11 font-mono uppercase text-[var(--text-faint)]">
              Aucune notification récente
            </p>
          </div>
        </div>
      )}

      {/* Mini chips — toujours réservé l'espace même si vide pour stabilité layout */}
      <div
        className="flex items-center gap-2 mt-2 shrink-0"
        style={{ minHeight: "var(--space-6)" }}
      >
        {hasNotifications &&
          rest.slice(0, 2).map((notif) => (
            <button
              key={notif.id}
              type="button"
              onClick={show}
              className="flex items-center gap-2 px-2 py-1 rounded-sm bg-[var(--surface-1)] hover:bg-[var(--cykan-bg-hover)] transition-colors"
              title={notif.title}
            >
              <span className="w-4 h-4 text-[var(--text-muted)]">
                <AssetGlyphSVG type={notif.type === "email" ? "message" : "brief"} />
              </span>
              <span
                className="t-9 text-[var(--text-faint)] truncate"
                style={{ maxWidth: "var(--space-24)" }}
              >
                {notif.title}
              </span>
            </button>
          ))}
      </div>
    </div>
  );
}
