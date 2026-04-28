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
      className="block border border-[var(--border-shell)] bg-[var(--surface-1)] p-4 transition-colors hover:border-[var(--cykan-border-hover)] hover:bg-[var(--surface-2)]"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-[var(--text)]">{agent.name}</h3>
        <span className="t-10 font-mono tracking-wide text-[var(--text-faint)]">{agent.model_provider}</span>
      </div>
      {agent.description && (
        <p className="mt-2 t-13 font-normal text-[var(--text-muted)] line-clamp-2">{agent.description}</p>
      )}
    </Link>
  );
}
