"use client";

interface ModelBadgeProps {
  provider: string;
  model: string;
}

export default function ModelBadge({ provider, model }: ModelBadgeProps) {
  return (
    <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-white/10 text-white/70">
      {provider}: {model}
    </span>
  );
}
