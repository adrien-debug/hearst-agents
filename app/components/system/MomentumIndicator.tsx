"use client";

import { useMomentum } from "@/app/hooks/use-momentum";

const MAX_VISIBLE = 4;

function statusDotClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "running" || s === "composing" || s === "delivering" || s === "active") {
    return "bg-cyan-accent/55 shadow-[0_0_6px_rgba(0,229,255,0.35)]";
  }
  if (s === "awaiting_approval" || s === "blocked") {
    return "bg-amber-400/45 shadow-[0_0_5px_rgba(251,191,36,0.35)]";
  }
  return "bg-white/18";
}

/**
 * Compact strip of active missions / run / focal states.
 * Renders nothing when `useMomentum().hasActive` is false.
 */
export function MomentumIndicator() {
  const { items, hasActive } = useMomentum();

  if (!hasActive) return null;

  const shown = items.slice(0, MAX_VISIBLE);
  const overflow = items.length - shown.length;

  return (
    <div
      className="flex min-w-0 max-w-[min(52vw,420px)] flex-wrap items-center justify-end gap-x-3 gap-y-1"
      aria-label="Activité en cours"
    >
      {shown.map((it) => (
        <div
          key={it.id}
          className="flex min-w-0 max-w-[200px] items-center gap-1.5"
          title={`${it.name} — ${it.status}`}
        >
          <span className={`h-1 w-1 shrink-0 rounded-full ${statusDotClass(it.status)}`} />
          <span className="truncate font-mono text-[8px] uppercase tracking-[0.14em] text-white/38">
            {it.kind}
          </span>
          <span className="truncate text-[10px] text-white/52">
            {it.name}
          </span>
          <span className="shrink-0 font-mono text-[8px] uppercase tracking-wide text-white/28">
            {it.status}
          </span>
        </div>
      ))}
      {overflow > 0 && (
        <span className="font-mono text-[8px] text-white/25">+{overflow}</span>
      )}
    </div>
  );
}
