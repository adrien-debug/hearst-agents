"use client";

const ITEMS: Array<{ label: string; color: string }> = [
  { label: "actif", color: "var(--cykan)" },
  { label: "ok", color: "var(--cykan)" },
  { label: "bloqué", color: "var(--warn)" },
  { label: "fail", color: "var(--danger)" },
  { label: "idle", color: "rgba(255,255,255,0.3)" },
];

export default function FlowLegend() {
  return (
    <div className="hidden md:flex items-center gap-4 t-10 font-mono uppercase tracking-[0.14em] text-[var(--text-faint)]">
      {ITEMS.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          <span
            className="inline-block size-2 rounded-full"
            style={{ background: it.color, boxShadow: `0 0 6px ${it.color}` }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}
