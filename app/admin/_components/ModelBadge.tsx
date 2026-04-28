"use client";

interface ModelBadgeProps {
  provider: string;
  model: string;
}

export default function ModelBadge({ provider, model }: ModelBadgeProps) {
  return (
    <span className="inline-flex items-center px-2 py-1 t-10 bg-[var(--surface-2)] text-[var(--text-muted)]">
      {provider}: {model}
    </span>
  );
}
