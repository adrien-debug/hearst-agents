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
      className="block rounded-lg border border-white/10 bg-surface p-4 hover:border-cyan-accent/30 transition-colors"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-white">{agent.name}</h3>
        <span className="text-xs text-white/40">{agent.model_provider}</span>
      </div>
      {agent.description && (
        <p className="mt-2 text-sm text-white/60 line-clamp-2">{agent.description}</p>
      )}
    </Link>
  );
}
