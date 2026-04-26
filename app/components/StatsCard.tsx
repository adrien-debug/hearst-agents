"use client";

interface StatsCardProps {
  label: string;
  value: string | number;
  sub?: string;
}

export default function StatsCard({ label, value, sub }: StatsCardProps) {
  return (
    <div className="rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] p-4">
      <p className="ghost-meta-label">{label}</p>
      <p className="mt-2 text-2xl font-light text-[var(--text)]">{value}</p>
      {sub && <p className="mt-1 text-[10px] font-mono uppercase tracking-[0.12em] text-[var(--text-faint)]">{sub}</p>}
    </div>
  );
}
