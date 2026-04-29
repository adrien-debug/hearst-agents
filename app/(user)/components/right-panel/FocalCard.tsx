"use client";

/**
 * FocalCard — Zone de notifications communication (emails, messages, alerts).
 *
 * Affiche les dernières communications importantes du thread actif.
 * Click sur une notification → ouvre le focal central avec le détail.
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

  // Transforme certains events en notifications de communication
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
    high: { color: "var(--warn)", bg: "rgba(245,158,11,0.10)", label: "important" },
    urgent: { color: "var(--danger)", bg: "rgba(239,68,68,0.10)", label: "urgent" },
  };
  const c = config[priority];
  return (
    <span
      className="t-9 font-mono tracking-[0.18em] uppercase px-2 py-0.5 rounded-sm"
      style={{ color: c.color, background: c.bg }}
    >
      {c.label}
    </span>
  );
}

export function FocalCard({ activeThreadId }: FocalCardProps) {
  const show = useFocalStore((s) => s.show);
  const notifications = useNotifications();

  // Empty state — pas de communications récentes
  if (notifications.length === 0) {
    return (
      <div
        className="border-b border-[var(--border-shell)] flex items-center gap-4 px-4"
        style={{ height: "var(--space-32)" }}
      >
        <span
          className="shrink-0 w-16 h-16 text-[var(--text-faint)]"
          style={{ opacity: 0.3 }}
          aria-hidden
        >
          <AssetGlyphSVG type="message" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="t-9 font-mono tracking-[0.22em] uppercase text-[var(--text-ghost)] mb-2">
            COMMUNICATION
          </p>
          <p className="t-13 text-[var(--text-faint)] leading-snug">
            Aucune notification récente.
          </p>
          <p className="t-11 text-[var(--text-ghost)] mt-1">
            Les emails et messages apparaîtront ici.
          </p>
        </div>
      </div>
    );
  }

  // Affiche la dernière notification en grand + les suivantes compactes
  const [latest, ...rest] = notifications;

  return (
    <div
      className="border-b border-[var(--border-shell)] flex flex-col px-4 py-4"
      style={{ height: "var(--space-32)" }}
    >
      {/* Header section */}
      <div className="flex items-center justify-between mb-2">
        <p className="t-9 font-mono tracking-[0.22em] uppercase text-[var(--text-ghost)]">
          NOTIFICATIONS
        </p>
        {notifications.length > 1 && (
          <span className="t-9 font-mono text-[var(--text-faint)]">
            +{notifications.length - 1}
          </span>
        )}
      </div>

      {/* Latest notification — cliquable */}
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
            <span className="t-9 text-[var(--text-muted)] truncate">
              {latest.subtitle}
            </span>
          )}
          <span className="t-9 font-mono text-[var(--text-faint)]">
            {formatTimeAgo(latest.timestamp)}
          </span>
        </span>
      </button>

      {/* Mini chips pour les autres notifications */}
      {rest.length > 0 && (
        <div className="flex items-center gap-2 mt-2 shrink-0">
          {rest.slice(0, 2).map((notif) => (
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
              <span className="t-9 text-[var(--text-faint)] truncate max-w-[120px]">
                {notif.title}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
