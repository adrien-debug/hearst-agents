"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewDatasetPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });

  const set = (key: string, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res = await fetch("/api/datasets", {
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
    router.push(`/datasets/${json.dataset.id}`);
  };

  return (
    <div className="px-8 py-10">
      <h1 className="mb-8 text-2xl font-semibold text-[var(--text)]">Nouveau dataset</h1>

      {error && (
        <div className="mb-4 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      <form onSubmit={submit} className="max-w-xl space-y-5">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Nom</span>
          <input
            required
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--bg-soft)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--cykan)]"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Description</span>
          <input
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--bg-soft)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--cykan)]"
          />
        </label>

        <button
          type="submit"
          disabled={saving}
          className="ghost-btn-solid ghost-btn-cykan rounded-sm px-6 py-2.5 text-sm disabled:opacity-50"
        >
          {saving ? "Création..." : "Créer le dataset"}
        </button>
      </form>
    </div>
  );
}
