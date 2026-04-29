"use client";

const ITEMS: Array<{ label: string; color: string }> = [
  { label: "actif", color: "var(--cykan)" },
  { label: "ok", color: "var(--cykan)" },
  { label: "bloqué", color: "var(--warn)" },
  { label: "fail", color: "var(--danger)" },
  { label: "idle", color: "var(--text-ghost)" },
];

export default function FlowLegend() {
  return (
    <div className="hidden md:flex items-center gap-(--space-4) t-10 font-mono uppercase tracking-(--tracking-label) text-text-faint">
      {ITEMS.map((it) => (
        <span key={it.label} className="flex items-center gap-(--space-2)">
          <span
            className="inline-block size-(--space-2) rounded-(--radius-full)"
            style={{ background: it.color, boxShadow: `0 0 6px ${it.color}` }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}
