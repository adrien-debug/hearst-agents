"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewWorkflowPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    description: "",
    trigger_type: "manual",
  });

  const set = (key: string, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res = await fetch("/api/workflows", {
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
    router.push(`/workflows/${json.workflow.id}`);
  };

  return (
    <div className="px-8 py-10">
      <h1 className="mb-8 text-2xl font-semibold text-white">Nouveau workflow</h1>

      {error && (
        <div className="mb-4 rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={submit} className="max-w-xl space-y-5">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-400">Nom</span>
          <input
            required
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-400">Description</span>
          <input
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-400">Trigger</span>
          <select
            value={form.trigger_type}
            onChange={(e) => set("trigger_type", e.target.value)}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none"
          >
            {["manual", "schedule", "webhook"].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-zinc-200 disabled:opacity-50"
        >
          {saving ? "Création..." : "Créer le workflow"}
        </button>
      </form>
    </div>
  );
}
