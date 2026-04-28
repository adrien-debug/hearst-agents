"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const providers = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
];

const defaultModels: Record<string, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o3-mini"],
  anthropic: ["claude-sonnet-4-6", "claude-3-5-haiku-20241022", "claude-opus-4-20250514"],
};

export default function NewAgentPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    description: "",
    model_provider: "openai",
    model_name: "gpt-4o",
    system_prompt: "",
    temperature: 0.7,
    max_tokens: 4096,
  });

  const set = (key: string, value: string | number) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const json = await res.json();

    if (!json.ok) {
      setError(json.error ?? "Erreur inconnue");
      setSaving(false);
      return;
    }
    router.push(`/admin/agents/${json.agent.id}`);
  };

  return (
    <div className="px-8 py-10">
      <h1 className="mb-8 t-24 font-semibold text-[var(--text)]">Nouvel agent</h1>

      {error && (
        <div className="mb-4 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 t-13 text-[var(--danger)]">
          {error}
        </div>
      )}

      <form onSubmit={submit} className="max-w-xl space-y-5">
        {/* Name */}
        <label className="block">
          <span className="mb-1 block t-9 font-medium text-[var(--text-muted)]">
            Nom
          </span>
          <input
            required
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--bg-soft)] px-3 py-2 t-13 text-[var(--text)] outline-none focus:border-[var(--cykan)]"
          />
        </label>

        {/* Description */}
        <label className="block">
          <span className="mb-1 block t-9 font-medium text-[var(--text-muted)]">
            Description
          </span>
          <input
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--bg-soft)] px-3 py-2 t-13 text-[var(--text)] outline-none focus:border-[var(--cykan)]"
          />
        </label>

        {/* Provider + Model */}
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="mb-1 block t-9 font-medium text-[var(--text-muted)]">
              Provider
            </span>
            <select
              value={form.model_provider}
              onChange={(e) => {
                const prov = e.target.value;
                set("model_provider", prov);
                set("model_name", defaultModels[prov]?.[0] ?? "");
              }}
              className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--bg-soft)] px-3 py-2 t-13 text-[var(--text)] outline-none"
            >
              {providers.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block t-9 font-medium text-[var(--text-muted)]">
              Modèle
            </span>
            <select
              value={form.model_name}
              onChange={(e) => set("model_name", e.target.value)}
              className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--bg-soft)] px-3 py-2 t-13 text-[var(--text)] outline-none"
            >
              {(defaultModels[form.model_provider] ?? []).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* System Prompt */}
        <label className="block">
          <span className="mb-1 block t-9 font-medium text-[var(--text-muted)]">
            System Prompt
          </span>
          <textarea
            rows={6}
            value={form.system_prompt}
            onChange={(e) => set("system_prompt", e.target.value)}
            className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--bg-soft)] px-3 py-2 font-mono t-13 text-[var(--text)] outline-none focus:border-[var(--cykan)]"
            placeholder="Tu es un assistant expert en..."
          />
        </label>

        {/* Temperature + Max tokens */}
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="mb-1 block t-9 font-medium text-[var(--text-muted)]">
              Temperature ({form.temperature})
            </span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={form.temperature}
              onChange={(e) => set("temperature", parseFloat(e.target.value))}
              className="w-full accent-white"
            />
          </label>

          <label className="block">
            <span className="mb-1 block t-9 font-medium text-[var(--text-muted)]">
              Max tokens
            </span>
            <input
              type="number"
              min={256}
              max={128000}
              value={form.max_tokens}
              onChange={(e) => set("max_tokens", parseInt(e.target.value, 10))}
              className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--bg-soft)] px-3 py-2 t-13 text-[var(--text)] outline-none"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="ghost-btn-solid ghost-btn-cykan rounded-sm px-6 py-2.5 t-13 disabled:opacity-50"
        >
          {saving ? "Création..." : "Créer l'agent"}
        </button>
      </form>
    </div>
  );
}
