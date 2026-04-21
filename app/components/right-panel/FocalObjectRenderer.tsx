"use client";

/**
 * Focal Object Renderer — Unified rendering surface for all right panel objects.
 *
 * One shared structural shell. Type-specific content zones.
 * Every object shares the same grammar: title, status, body, provenance, action.
 *
 * Invariants:
 * - NO tabs
 * - NO lists
 * - NO generic cards
 * - NO dashboard stacks
 * - NO admin chrome
 * - MAX 1 primaryAction per object
 * - Provenance is subtle (text-[9px] mono, white/20)
 * - Title is typographic, not a header bar
 */

import { useRef, useEffect, useState } from "react";
import type { FocalObject, FocalAction } from "@/lib/right-panel/objects";
import { getProviderUi, getProviderLabel } from "@/lib/providers/registry";

// ── Shared shell ────────────────────────────────────────────

export function FocalObjectRenderer({
  object,
  onAction,
}: {
  object: FocalObject;
  onAction?: (action: FocalAction) => void;
}) {
  const prevIdRef = useRef(object.id);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (object.id !== prevIdRef.current) {
      prevIdRef.current = object.id;
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 600);
      return () => clearTimeout(t);
    }
  }, [object.id]);

  return (
    <div
      className="flex flex-col gap-6 py-6 animate-in fade-in duration-300"
      style={{
        transition: "opacity 600ms cubic-bezier(0.22, 1, 0.36, 1)",
        opacity: pulse ? 0.6 : 1,
      }}
    >
      {/* Status + type badge */}
      <div className="flex items-center gap-3">
        <StatusDot status={object.status} />
        <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/25">
          {TYPE_LABELS[object.objectType] ?? object.objectType}
        </span>
      </div>

      {/* Title */}
      {object.title && (
        <h2 className="text-[15px] font-light text-white/90 leading-snug tracking-wide">
          {object.title}
        </h2>
      )}

      {/* Type-specific body */}
      <div className="flex-1 min-h-0">
        <ObjectBody object={object} />
      </div>

      {/* Provenance */}
      <Provenance object={object} />

      {/* Primary action (max 1) */}
      {object.primaryAction && onAction && (
        <div className="pt-2">
          <button
            onClick={() => onAction(object.primaryAction!)}
            className="text-[11px] font-mono tracking-wider text-cyan-400/80 hover:text-cyan-300 transition-colors duration-200"
          >
            {object.primaryAction.label}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Type-specific body renderers ────────────────────────────

function ObjectBody({ object }: { object: FocalObject }) {
  switch (object.objectType) {
    case "message_draft":
      return (
        <div className="space-y-3">
          {object.recipient && (
            <p className="text-[10px] font-mono text-white/30">
              → {object.recipient}
            </p>
          )}
          {object.body && (
            <p className="text-[13px] text-white/70 font-light leading-relaxed">
              {object.body}
            </p>
          )}
        </div>
      );

    case "message_receipt":
      return (
        <div className="space-y-3">
          <p className="text-[10px] font-mono text-white/30">
            → {object.recipient}
          </p>
          <p className="text-[13px] text-white/70 font-light leading-relaxed">
            {object.body}
          </p>
          <DeliveryBadge status={object.deliveryStatus} />
        </div>
      );

    case "brief":
      return (
        <div className="space-y-4">
          {object.summary && (
            <p className="text-[13px] text-white/70 font-light leading-relaxed">
              {object.summary}
            </p>
          )}
          {object.sections.map((s, i) => (
            <div key={i} className="space-y-1">
              {s.heading && (
                <p className="text-[10px] font-mono uppercase tracking-wider text-white/30">
                  {s.heading}
                </p>
              )}
              <p className="text-[12px] text-white/60 font-light leading-relaxed">
                {s.body}
              </p>
            </div>
          ))}
          <WordCount count={object.wordCount} />
        </div>
      );

    case "outline":
      return (
        <div className="space-y-3">
          {object.summary && (
            <p className="text-[13px] text-white/70 font-light leading-relaxed">
              {object.summary}
            </p>
          )}
          {object.sectionTitles.length > 0 && (
            <div className="space-y-1.5 pl-2 border-l border-white/5">
              {object.sectionTitles.map((t, i) => (
                <p key={i} className="text-[11px] text-white/40 font-light">
                  {t}
                </p>
              ))}
            </div>
          )}
        </div>
      );

    case "report":
      return (
        <div className="space-y-4">
          {object.summary && (
            <p className="text-[13px] text-white/70 font-light leading-relaxed">
              {object.summary}
            </p>
          )}
          {object.sections.map((s, i) => (
            <div key={i} className="space-y-1">
              {s.heading && (
                <p className="text-[10px] font-mono uppercase tracking-wider text-white/30">
                  {s.heading}
                </p>
              )}
              <p className="text-[12px] text-white/60 font-light leading-relaxed">
                {s.body}
              </p>
            </div>
          ))}
          <WordCount count={object.wordCount} />
        </div>
      );

    case "mission_draft":
      return (
        <div className="space-y-3">
          <p className="text-[13px] text-white/70 font-light leading-relaxed">
            {object.intent}
          </p>
          {object.schedule && (
            <p className="text-[10px] font-mono text-white/30">
              ⟳ {object.schedule}
            </p>
          )}
        </div>
      );

    case "mission_active":
      return (
        <div className="space-y-3">
          <p className="text-[13px] text-white/70 font-light leading-relaxed">
            {object.intent}
          </p>
          {object.schedule && (
            <p className="text-[10px] font-mono text-white/30">
              ⟳ {object.schedule}
            </p>
          )}
          <div className="flex items-center gap-4 text-[9px] font-mono text-white/20">
            {object.lastRunAt && (
              <span>Dernier : {formatRelative(object.lastRunAt)}</span>
            )}
            {object.nextRunAt && (
              <span>Prochain : {formatRelative(object.nextRunAt)}</span>
            )}
          </div>
        </div>
      );

    case "watcher_draft":
      return (
        <div className="space-y-3">
          <p className="text-[13px] text-white/70 font-light leading-relaxed">
            {object.condition}
          </p>
          {object.description && (
            <p className="text-[11px] text-white/40 font-light">
              {object.description}
            </p>
          )}
        </div>
      );

    case "watcher_active":
      return (
        <div className="space-y-3">
          <p className="text-[13px] text-white/70 font-light leading-relaxed">
            {object.condition}
          </p>
          <div className="flex items-center gap-4 text-[9px] font-mono text-white/20">
            {object.lastCheckedAt && (
              <span>Vérifié : {formatRelative(object.lastCheckedAt)}</span>
            )}
            <span>{object.triggerCount} déclenchement{object.triggerCount !== 1 ? "s" : ""}</span>
          </div>
        </div>
      );
  }
}

// ── Shared atoms ────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  const color =
    status === "active" || status === "delivered" ? "bg-emerald-400/60" :
    status === "composing" || status === "delivering" ? "bg-cyan-400/60 animate-pulse" :
    status === "awaiting_approval" ? "bg-amber-400/60 animate-pulse" :
    status === "failed" ? "bg-red-400/60" :
    status === "paused" ? "bg-white/20" :
    "bg-white/10";

  return <span className={`h-[5px] w-[5px] rounded-full ${color}`} />;
}

function DeliveryBadge({ status }: { status: string }) {
  const label =
    status === "read" ? "Lu" :
    status === "delivered" ? "Reçu" :
    status === "sent" ? "Envoyé" :
    status === "failed" ? "Échec" :
    status;

  return (
    <span className="text-[9px] font-mono uppercase tracking-wider text-white/20">
      {label}
    </span>
  );
}

function WordCount({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="text-[9px] font-mono text-white/15">
      {count} mots
    </span>
  );
}

function Provenance({ object }: { object: FocalObject }) {
  let providerId: string | undefined;
  let channelRef: string | undefined;

  if (object.objectType === "message_draft" || object.objectType === "message_receipt") {
    providerId = object.providerId;
    if (object.objectType === "message_receipt") channelRef = object.channelRef;
  }

  if (!providerId && (object as Record<string, unknown>).sourceProviderId) {
    providerId = (object as Record<string, unknown>).sourceProviderId as string;
  }

  if (!providerId) return null;

  const ui = getProviderUi(providerId as any);
  const label = getProviderLabel(providerId as any);
  const createdAt = (object as Record<string, unknown>).createdAt as number | undefined;

  return (
    <div className="flex items-center gap-1.5 text-[9px] font-mono text-white/20 tracking-wide mt-1">
      <span className={`${ui.color.split(" ")[1] ?? "text-white/30"}`}>
        {ui.initial}
      </span>
      <span className="text-white/15">via {label}</span>
      {channelRef && <><span className="text-white/10">·</span><span>{channelRef}</span></>}
      {createdAt && (
        <><span className="text-white/10">·</span><span className="text-white/12">{formatRelative(createdAt)}</span></>
      )}
    </div>
  );
}

// ── Constants ───────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  message_draft: "MESSAGE",
  message_receipt: "ENVOYÉ",
  brief: "SYNTHÈSE",
  outline: "EN COURS",
  report: "RAPPORT",
  watcher_draft: "SURVEILLANCE",
  watcher_active: "SURVEILLANCE ACTIVE",
  mission_draft: "MISSION",
  mission_active: "MISSION ACTIVE",
};

// ── Helpers ─────────────────────────────────────────────────

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "à l'instant";
  if (diff < 3_600_000) return `il y a ${Math.floor(diff / 60_000)}min`;
  if (diff < 86_400_000) return `il y a ${Math.floor(diff / 3_600_000)}h`;
  return `il y a ${Math.floor(diff / 86_400_000)}j`;
}
