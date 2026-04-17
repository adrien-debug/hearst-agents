"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

interface Entry {
  id: string;
  input: string;
  expected_output: string;
  tags: string[];
  created_at: string;
}

interface DatasetInfo {
  id: string;
  name: string;
  description: string | null;
}

export default function DatasetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [dataset, setDataset] = useState<DatasetInfo | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [newInput, setNewInput] = useState("");
  const [newExpected, setNewExpected] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      const [dsRes, entriesRes] = await Promise.all([
        fetch(`/api/datasets`).then((r) => r.json()),
        fetch(`/api/datasets/${id}/entries`).then((r) => r.json()),
      ]);

      if (cancelled) return;

      const ds = (dsRes.datasets ?? []).find((d: DatasetInfo) => d.id === id);
      setDataset(ds ?? null);
      setEntries(entriesRes.entries ?? []);
      setLoading(false);
    }

    fetchData();
    return () => { cancelled = true; };
  }, [id]);

  const addEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInput.trim() || !newExpected.trim()) return;
    setSaving(true);

    const res = await fetch(`/api/datasets/${id}/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: newInput, expected_output: newExpected }),
    });
    const json = await res.json();
    if (json.ok) {
      setEntries((prev) => [...prev, json.entry]);
      setNewInput("");
      setNewExpected("");
    }
    setSaving(false);
  };

  if (loading) return <div className="px-8 py-10 text-sm text-zinc-500">Chargement...</div>;

  return (
    <div className="px-8 py-10">
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-[0.35em] text-zinc-500">Dataset</p>
        <h1 className="text-2xl font-semibold text-white">{dataset?.name ?? "—"}</h1>
        {dataset?.description && (
          <p className="mt-1 text-sm text-zinc-500">{dataset.description}</p>
        )}
        <p className="mt-2 text-xs text-zinc-600">{entries.length} entrées</p>
      </div>

      <div className="mb-8 rounded-xl border border-zinc-800 bg-zinc-950/80 p-5">
        <h3 className="mb-3 text-xs font-semibold uppercase text-zinc-500">Ajouter une entrée</h3>
        <form onSubmit={addEntry} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[10px] font-medium text-zinc-500">Input</span>
              <textarea
                rows={3}
                value={newInput}
                onChange={(e) => setNewInput(e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
                placeholder="Question ou instruction de test..."
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-medium text-zinc-500">Expected output</span>
              <textarea
                rows={3}
                value={newExpected}
                onChange={(e) => setNewExpected(e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
                placeholder="Résultat attendu..."
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={saving || !newInput.trim() || !newExpected.trim()}
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-zinc-200 disabled:opacity-40"
          >
            {saving ? "..." : "Ajouter"}
          </button>
        </form>
      </div>

      <h2 className="mb-4 text-lg font-semibold text-white">Entrées</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-zinc-500">Aucune entrée.</p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry, i) => (
            <div key={entry.id} className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono text-zinc-600">#{i + 1}</span>
                {entry.tags.length > 0 && entry.tags.map((t) => (
                  <span key={t} className="rounded-full border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500">{t}</span>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div>
                  <p className="text-[10px] font-medium uppercase text-zinc-600">Input</p>
                  <p className="mt-1 text-xs text-zinc-300 whitespace-pre-wrap">{entry.input}</p>
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase text-zinc-600">Expected</p>
                  <p className="mt-1 text-xs text-zinc-300 whitespace-pre-wrap">{entry.expected_output}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
