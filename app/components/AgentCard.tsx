import Link from "next/link";
import ModelBadge from "./ModelBadge";

interface Agent {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  model_provider: string;
  model_name: string;
  status: string;
}

const statusDot: Record<string, string> = {
  active: "bg-emerald-500",
  paused: "bg-amber-500",
  archived: "bg-zinc-600",
};

export default function AgentCard({ agent }: { agent: Agent }) {
  return (
    <Link
      href={`/agents/${agent.id}`}
      className="group flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-950/80 p-5 transition-colors hover:border-zinc-700"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${statusDot[agent.status] ?? "bg-zinc-600"}`}
          />
          <h3 className="text-sm font-semibold text-white group-hover:text-zinc-100">
            {agent.name}
          </h3>
        </div>
        <ModelBadge provider={agent.model_provider} model={agent.model_name} />
      </div>
      {agent.description && (
        <p className="line-clamp-2 text-xs leading-relaxed text-zinc-500">
          {agent.description}
        </p>
      )}
    </Link>
  );
}
