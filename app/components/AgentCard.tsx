"use client";

import Link from "next/link";

interface AgentCardProps {
  agent: {
    id: string;
    slug: string;
    name: string;
    description?: string | null;
    model_provider?: string | null;
  };
}

export default function AgentCard({ agent }: AgentCardProps) {
  return (
    <Link
      href={`/admin/agents/${agent.id}`}
      className="block rounded-lg border border-white/[0.06] bg-gradient-to-br from-white/[0.05] to-white/[0.02] p-4 transition-all hover:border-[var(--cykan)]/30 hover:from-white/[0.08] hover:to-white/[0.03]"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-white">{agent.name}</h3>
        <span className="t-10 font-mono tracking-wide text-white/40">{agent.model_provider}</span>
      </div>
      {agent.description && (
        <p className="mt-2 text-sm font-normal text-white/60 line-clamp-2">{agent.description}</p>
      )}
    </Link>
  );
}
