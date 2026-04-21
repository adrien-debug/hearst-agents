"use client";

/**
 * Focal Object Renderer — Unified rendering surface for all right panel objects.
 *
 * One shared structural shell. Type-specific content zones.
 * Every object shares the same grammar: title, status, body, provenance, action.
 *
 * Invariants:
 * - NO tabs, NO lists, NO generic cards, NO dashboard stacks, NO admin chrome
 * - MAX 1 primaryAction per object
 * - Provenance is subtle (text-[9px] mono, zinc-600)
 * - Title is typographic, not a header bar
 */

import { useRef, useEffect, useState, memo } from "react";
import type { FocalObject, FocalAction } from "@/lib/right-panel/objects";
import { getProviderUi, getProviderLabel } from "@/lib/providers/registry";

export const TYPE_LABELS: Record<string, string> = {
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

// ── Shared shell ────────────────────────────────────────────

export const FocalObjectRenderer = memo(function FocalObjectRenderer({
  object,
  onAction,
  isPending,
  mode = "full",
}: {
  object: FocalObject;
  onAction?: (action: FocalAction) => void;
  isPending?: boolean;
  mode?: "preview" | "full";
}) {
  const isPreview = mode === "preview";
  const isEmerging = object.status === "composing" || object.status === "delivering";

  return (
    <div
      key={object.id}
      className={`flex flex-col max-w-[60ch] animate-in fade-in slide-in-from-bottom-3 duration-150 ease-out ${
        isPreview ? "px-6 pt-6 pb-4 gap-3" : "p-6 gap-6"
      }`}
    >
      {/* Status + type badge */}
        <div className="flex items-center gap-3">
          <StatusDot status={object.status} />
          <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/50">
            {TYPE_LABELS[object.objectType] ?? object.objectType}
          </span>
        </div>

      {/* Title */}
      {object.title && (
        <h2 className={`font-medium tracking-tight text-white leading-snug ${
          isPreview ? "text-lg" : "text-[28px]"
        }`}>
          {object.title}
        </h2>
      )}

      {/* Type-specific body */}
      <div className="flex-1 min-h-0">
        {isEmerging && !isPreview ? (
          <SkeletonBody />
        ) : (
          <ObjectBody object={object} mode={mode} />
        )}
      </div>

      {/* Provenance */}
      <Provenance object={object} />

      {/* Primary action (max 1) */}
      {object.primaryAction && onAction && (
        <div className="pt-2">
          <button
            onClick={() => onAction(object.primaryAction!)}
            disabled={isPending}
            className="text-[11px] font-mono tracking-wider text-amber-500 border border-amber-500 bg-transparent px-3 py-1.5 hover:bg-amber-500/10 hover:border-amber-500/80 transition-colors duration-200 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            {isPending ? "EN COURS..." : object.primaryAction.label}
          </button>
        </div>
      )}
    </div>
  );
});

// ── Scannable body renderer ─────────────────────────────────

function ScanBody({ text, large }: { text: string; large?: boolean }) {
  const lines = text
    .split("\n")
    .map((l) => l.replace(/^[-–•*]\s*/, "").trim())
    .filter(Boolean);

  const textClass = large
    ? "text-[15px] text-white/80 leading-loose max-w-[60ch]"
    : "text-[14px] text-white/80 leading-relaxed max-w-[60ch]";

  if (lines.length <= 1) {
    return <p className={textClass}>{lines[0] ?? text}</p>;
  }

  return (
    <div className="space-y-3">
      {lines.slice(0, 8).map((line, i) => (
        <div key={i} className="flex gap-2.5">
          <div className="w-1 h-1 mt-2 shrink-0 rounded-full bg-white/20" />
          <p className={textClass}>{line}</p>
        </div>
      ))}
    </div>
  );
}

// ── Type-specific body renderers ────────────────────────────

function ObjectBody({ object, mode }: { object: FocalObject; mode: "preview" | "full" }) {
  const large = mode === "full";
  const bodyClass = large
    ? "text-[15px] text-white/80 leading-loose"
    : "text-[14px] text-white/80 leading-relaxed";
  const sectionGap = large ? "space-y-8" : "space-y-6";

  if (mode === "preview") {
    let summaryText = "";
    if ("summary" in object && typeof object.summary === "string") summaryText = object.summary;
    else if ("body" in object && typeof object.body === "string") summaryText = object.body;
    else if ("intent" in object && typeof object.intent === "string") summaryText = object.intent;
    else if ("condition" in object && typeof object.condition === "string") summaryText = object.condition;

    return summaryText ? (
      <p className="text-sm text-white/70 leading-relaxed line-clamp-2">{summaryText}</p>
    ) : null;
  }

  switch (object.objectType) {
    case "message_draft":
      return (
        <div className={sectionGap}>
          {object.recipient && (
            <p className="text-[10px] font-mono text-white/50">→ {object.recipient}</p>
          )}
          {object.body && <p className={bodyClass}>{object.body}</p>}
        </div>
      );

    case "message_receipt":
      return (
        <div className={sectionGap}>
          <p className="text-[10px] font-mono text-white/50">→ {object.recipient}</p>
          <p className={bodyClass}>{object.body}</p>
          <DeliveryBadge status={object.deliveryStatus} />
        </div>
      );

    case "brief":
      return (
        <div className={sectionGap}>
          {object.summary && <ScanBody text={object.summary} large={large} />}
          {object.sections.map((s, i) => (
            <div key={i} className="space-y-2">
              {s.heading && (
                <p className="text-[10px] font-mono uppercase tracking-wider text-white/50">{s.heading}</p>
              )}
              <ScanBody text={s.body} large={large} />
            </div>
          ))}
          <WordCount count={object.wordCount} />
        </div>
      );

    case "outline":
      return (
        <div className={sectionGap}>
          {object.summary && <p className={bodyClass}>{object.summary}</p>}
          {object.sectionTitles.length > 0 && (
            <div className="space-y-2 pl-2 border-l border-white/5">
              {object.sectionTitles.map((t, i) => (
                <p key={i} className="text-[13px] text-white font-light">{t}</p>
              ))}
            </div>
          )}
        </div>
      );

    case "report":
      return (
        <div className={sectionGap}>
          {object.summary && <ScanBody text={object.summary} large={large} />}
          {object.sections.map((s, i) => (
            <div key={i} className="space-y-2">
              {s.heading && (
                <p className="text-[10px] font-mono uppercase tracking-wider text-white/50">{s.heading}</p>
              )}
              <ScanBody text={s.body} large={large} />
            </div>
          ))}
          <WordCount count={object.wordCount} />
        </div>
      );

    case "mission_draft":
      return (
        <div className={sectionGap}>
          <p className={bodyClass}>{object.intent}</p>
          {object.schedule && (
            <p className="text-[10px] font-mono text-white/50">⟳ {object.schedule}</p>
          )}
        </div>
      );

    case "mission_active":
      return (
        <div className={sectionGap}>
          <p className={bodyClass}>{object.intent}</p>
          {object.schedule && (
            <p className="text-[10px] font-mono text-white/50">⟳ {object.schedule}</p>
          )}
          <div className="flex items-center gap-4 text-[9px] font-mono text-white/30">
            {object.lastRunAt && <span>Dernier : {formatRelative(object.lastRunAt)}</span>}
            {object.nextRunAt && <span>Prochain : {formatRelative(object.nextRunAt)}</span>}
          </div>
        </div>
      );

    case "watcher_draft":
      return (
        <div className={sectionGap}>
          <p className={bodyClass}>{object.condition}</p>
          {object.description && (
            <p className="text-[13px] text-white/70 font-light">{object.description}</p>
          )}
        </div>
      );

    case "watcher_active":
      return (
        <div className={sectionGap}>
          <p className={bodyClass}>{object.condition}</p>
          <div className="flex items-center gap-4 text-[9px] font-mono text-white/30">
            {object.lastCheckedAt && <span>Vérifié : {formatRelative(object.lastCheckedAt)}</span>}
            <span>{object.triggerCount} déclenchement{object.triggerCount !== 1 ? "s" : ""}</span>
          </div>
        </div>
      );
  }
}

function SkeletonBody() {
  return (
    <div className="space-y-3">
      <div className="h-3 w-[80%] rounded bg-white/10 animate-pulse" />
      <div className="h-3 w-[60%] rounded bg-white/10 animate-pulse" />
      <div className="h-3 w-[70%] rounded bg-white/10 animate-pulse" />
    </div>
  );
}

// ── Shared atoms ────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  const color =
    status === "active" || status === "delivered" ? "bg-white/50" :
    status === "composing" || status === "delivering" ? "bg-white/40 animate-pulse" :
    status === "awaiting_approval" ? "bg-amber-400/50 animate-pulse" :
    status === "failed" ? "bg-red-400/50" :
    status === "paused" ? "bg-white/15" :
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
    <span className="text-[9px] font-mono uppercase tracking-wider text-white/30">
      {label}
    </span>
  );
}

function WordCount({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="text-[9px] font-mono text-white/30">
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

  const ui = getProviderUi(providerId);
  const label = getProviderLabel(providerId);
  const createdAt = (object as Record<string, unknown>).createdAt as number | undefined;

  return (
    <div className="flex items-center gap-1.5 text-[9px] font-mono text-white/50 tracking-wide mt-1">
      <span className={`${ui.color.split(" ")[1] ?? "text-white/50"}`}>
        {ui.initial}
      </span>
      <span>via {label}</span>
      {channelRef && <><span className="text-white/50">·</span><span>{channelRef}</span></>}
      {createdAt && (
        <><span className="text-white/50">·</span><span>{formatRelative(createdAt)}</span></>
      )}
    </div>
  );
}

// ── Constants ───────────────────────────────────────────────

// TYPE_LABELS moved to top for export

// ── Helpers ─────────────────────────────────────────────────

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "à l'instant";
  if (diff < 3_600_000) return `il y a ${Math.floor(diff / 60_000)}min`;
  if (diff < 86_400_000) return `il y a ${Math.floor(diff / 3_600_000)}h`;
  return `il y a ${Math.floor(diff / 86_400_000)}j`;
}
