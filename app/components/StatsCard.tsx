"use client";

interface StatsCardProps {
  label: string;
  value: string | number;
  sub?: string;
}

export default function StatsCard({ label, value, sub }: StatsCardProps) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-white/[0.02] p-4 hover:border-white/[0.12] hover:from-white/[0.06] hover:to-white/[0.03] transition-all">
      <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-white/30">{label}</p>
      <p className="mt-2 text-2xl font-light text-white">{value}</p>
      {sub && <p className="mt-1 text-[10px] font-mono tracking-wide text-white/30">{sub}</p>}
    </div>
  );
}
