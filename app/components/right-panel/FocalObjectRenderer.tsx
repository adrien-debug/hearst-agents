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

import { memo, useEffect, useRef, useState } from "react";
import type { FocalObject, FocalAction } from "@/lib/right-panel/objects";
import { getProviderUi, getProviderLabel } from "@/lib/providers/registry";

const EMOJI_RE = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;
function cleanText(s: string): string {
  return s
    .replace(EMOJI_RE, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/^\|[-:| ]+\|$/gm, "")
    .replace(/^\|(.+)\|$/gm, "$1")
    .replace(/^---+$/gm, "")
    .replace(/^>\s*/gm, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export const TYPE_LABELS: Record<string, string> = {
  message_draft: "MESSAGE",
  message_receipt: "ENVOYÉ",
  brief: "SYNTHÈSE",
  outline: "EN COURS",
  report: "RAPPORT",
  doc: "DOCUMENT",
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
      className={`flex w-full flex-col animate-in fade-in slide-in-from-bottom-3 duration-150 ease-out ${
        isPreview ? "gap-3" : "ghost-document-surface gap-7 p-6"
      }`}
    >
      {/* Status + type badge */}
        <div className="flex items-center gap-3">
          <StatusDot status={object.status} />
          <span className="tag">
            {TYPE_LABELS[object.objectType] ?? object.objectType}
          </span>
        </div>

      {/* Title */}
      {object.title && (
        <h2 className={`bounded-title-3 max-w-full font-light tracking-tight text-white/90 leading-snug ${
          isPreview ? "text-lg" : "text-[1.72rem]"
        }`}>
          {cleanText(object.title)}
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
            className="action-button"
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
  const lines = cleanText(text)
    .split("\n")
    .map((l) => l.replace(/^[-–•*#]\s*/, "").trim())
    .filter(Boolean);

  const textClass = large
    ? "bounded-anywhere text-[15px] text-white/70 font-light leading-[1.82]"
    : "bounded-anywhere text-[14px] text-white/62 leading-relaxed max-w-[60ch]";

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

// ── Document V2 Renderer (Editorial + Afterglow) ────────────

function useAfterglow(text: string) {
  const [glow, setGlow] = useState(false);
  const prevText = useRef(text);

  useEffect(() => {
    if (prevText.current !== text) {
      prevText.current = text;
      setGlow(true);
      const t = setTimeout(() => setGlow(false), 3000); // 3s decay
      return () => clearTimeout(t);
    }
  }, [text]);

  return glow;
}

function DocumentSection({ heading, body, mode }: { heading?: string; body: string; mode: "preview" | "full" }) {
  const isFull = mode === "full";
  const glow = useAfterglow(body);

  const lines = cleanText(body)
    .split("\n")
    .map((l) => l.replace(/^[-–•*#]\s*/, "").trim())
    .filter((l) => l.length > 0 && !/^[-|:]+$/.test(l));

  return (
    <div className="relative group">
      {/* Gutter Resonance (1px line on the left when updating) */}
      <div 
        className={`absolute -left-6 top-0 bottom-0 w-px transition-all duration-3000 ease-out ${
          glow ? "bg-cyan-accent/30" : "bg-transparent"
        }`} 
      />
      
      <div className={`space-y-4 ${isFull ? "mb-12" : "mb-6"}`}>
        {heading && (
          <h3 className={`bounded-anywhere font-mono font-normal tracking-[0.4em] uppercase transition-colors duration-3000 ease-out ${
            glow ? "text-cyan-accent/50" : "text-white/30"
          } ${isFull ? "text-[13px]" : "text-xs"}`}>
            {heading}
          </h3>
        )}
        
        <div className="space-y-4">
          {lines.map((line, i) => {
            const isList = line.startsWith("-") || line.startsWith("•") || line.startsWith("*");
            const cleanLine = line.replace(/^[-–•*]\s*/, "");
            
            return (
              <div key={i} className={isList ? "pl-4 relative" : ""}>
                {isList && <span className="absolute left-0 top-[0.6em] w-1 h-1 rounded-full bg-zinc-500" />}
                <p className={`bounded-anywhere transition-colors duration-3000 ease-out ${
                  glow ? "text-white/90" : "text-zinc-300"
                } ${isFull ? "text-[15px] leading-[1.85] antialiased" : "text-[14px] leading-relaxed"}`}>
                  {cleanLine}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Type-specific body renderers ────────────────────────────

function ObjectBody({ object, mode }: { object: FocalObject; mode: "preview" | "full" }) {
  const large = mode === "full";
  const bodyClass = large
    ? "bounded-anywhere text-[15px] text-white/72 font-light leading-[1.82]"
    : "bounded-anywhere text-[13px] text-white/62 leading-relaxed";
  const sectionGap = large ? "space-y-8" : "space-y-6";

  if (mode === "preview") {
    let summaryText = "";
    if ("summary" in object && typeof object.summary === "string") summaryText = object.summary;
    else if ("body" in object && typeof object.body === "string") summaryText = object.body;
    else if ("intent" in object && typeof object.intent === "string") summaryText = object.intent;
    else if ("condition" in object && typeof object.condition === "string") summaryText = object.condition;

    return summaryText ? (
      <p className="bounded-anywhere text-sm text-white/70 leading-relaxed line-clamp-2">{cleanText(summaryText)}</p>
    ) : null;
  }

  switch (object.objectType) {
    case "message_draft":
      return (
        <div className={sectionGap}>
          {object.recipient && (
            <p className="text-[11px] font-mono text-white/58">→ {object.recipient}</p>
          )}
          {object.body && <p className={bodyClass}>{object.body}</p>}
        </div>
      );

    case "message_receipt":
      return (
        <div className={sectionGap}>
          <p className="text-[11px] font-mono text-white/58">→ {object.recipient}</p>
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
                <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-white/56">{s.heading}</p>
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
                <p className="text-[11px] font-mono uppercase tracking-[0.24em] text-white/56">{s.heading}</p>
              )}
              <ScanBody text={s.body} large={large} />
            </div>
          ))}
          <WordCount count={object.wordCount} />
        </div>
      );

    case "doc":
      return (
        <div className={large ? "space-y-0 pt-4" : sectionGap}>
          {object.summary && <DocumentSection body={object.summary} mode={mode} />}
          {object.sections.map((s, i) => (
            <DocumentSection key={i} heading={s.heading} body={s.body} mode={mode} />
          ))}
          <WordCount count={object.wordCount} />
        </div>
      );

    case "mission_draft":
      return (
        <div className={sectionGap}>
          <p className={bodyClass}>{object.intent}</p>
          {object.schedule && (
            <p className="text-[11px] font-mono text-white/58">⟳ {object.schedule}</p>
          )}
        </div>
      );

    case "mission_active":
      return (
        <div className={sectionGap}>
          <p className={bodyClass}>{object.intent}</p>
          {object.schedule && (
            <p className="text-[11px] font-mono text-white/58">⟳ {object.schedule}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-mono text-white/40">
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
            <p className="text-[15px] text-white/70 font-light leading-relaxed">{object.description}</p>
          )}
        </div>
      );

    case "watcher_active":
      return (
        <div className={sectionGap}>
          <p className={bodyClass}>{object.condition}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-mono text-white/40">
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
      <p className="ghost-kicker">Stabilisation</p>
      <p className="text-[14px] leading-7 text-white/34">
        Le contenu prend forme.
      </p>
    </div>
  );
}

// ── Shared atoms ────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  const active = status === "active" || status === "delivered" || status === "composing" || status === "delivering";
  const amber = status === "awaiting_approval";
  const red = status === "failed";

  if (active) return <span className="status-dot" />;
  if (amber) return <span className="h-1.5 w-1.5 rounded-full bg-amber-400/50 shadow-[0_0_6px_rgba(251,191,36,0.45)]" />;
  if (red) return <span className="w-1.5 h-1.5 rounded-full bg-red-400/50 shadow-[0_0_6px_rgba(248,113,113,0.6)]" />;
  return <span className="w-1.5 h-1.5 rounded-full bg-white/10" />;
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
    <span className="text-[10px] font-mono text-white/32 tracking-[0.14em] uppercase">
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

  const objectRaw = object as unknown as Record<string, unknown>;
  if (!providerId && objectRaw.sourceProviderId) {
    providerId = objectRaw.sourceProviderId as string;
  }

  if (!providerId) return null;

  const ui = getProviderUi(providerId);
  const label = getProviderLabel(providerId);
  const createdAt = objectRaw.createdAt as number | undefined;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-white/40 tracking-wide">
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
