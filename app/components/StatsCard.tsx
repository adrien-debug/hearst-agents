"use client";

interface StatsCardProps {
  label: string;
  value: string | number;
  sub?: string;
}

export default function StatsCard({ label, value, sub }: StatsCardProps) {
  return (
    <div className="rounded-lg border border-white/10 bg-surface p-4">
      <p className="text-xs text-white/40 uppercase tracking-wider">{label}</p>
      <p className="mt-1 text-2xl font-light text-white">{value}</p>
      {sub && <p className="mt-1 text-xs text-white/30">{sub}</p>}
    </div>
  );
}
