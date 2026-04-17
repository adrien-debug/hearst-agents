const colorMap: Record<string, string> = {
  openai: "border-emerald-700 text-emerald-400",
  anthropic: "border-amber-700 text-amber-400",
};

interface ModelBadgeProps {
  provider: string;
  model: string;
}

export default function ModelBadge({ provider, model }: ModelBadgeProps) {
  const cls = colorMap[provider.toLowerCase()] ?? "border-zinc-700 text-zinc-400";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}
    >
      {model}
    </span>
  );
}
