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
      className="block rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] p-4 transition-colors hover:border-[var(--cykan)]/40"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-[var(--text)]">{agent.name}</h3>
        <span className="text-[10px] font-mono uppercase tracking-[0.1em] text-[var(--text-muted)]">{agent.model_provider}</span>
      </div>
      {agent.description && (
        <p className="mt-2 text-sm font-light text-[var(--text-soft)] line-clamp-2">{agent.description}</p>
      )}
    </Link>
  );
}
