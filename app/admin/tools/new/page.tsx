"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewToolPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    description: "",
    endpoint_url: "",
    http_method: "POST",
    auth_type: "none",
    timeout_ms: 30000,
  });

  const set = (key: string, value: string | number) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      ...form,
      endpoint_url: form.endpoint_url || undefined,
    };

    const res = await fetch("/api/tools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();

    if (!json.ok) {
      setError(json.error ?? "Erreur inconnue");
      setSaving(false);
      return;
    }
    router.push("/admin/tools");
  };

  return (
    <div className="px-(--space-8) py-(--space-10)">
      <h1 className="mb-8 t-24 font-semibold text-[var(--text)]">Nouveau tool</h1>

      {error && (
        <div className="mb-4 rounded-(--radius-lg) border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 t-13 text-[var(--danger)]">
          {error}
        </div>
      )}

      <form onSubmit={submit} className="max-w-xl space-y-5">
        <label className="block">
          <span className="mb-1 block t-9 font-medium text-[var(--text-muted)]">Nom</span>
          <input
            required
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            className="w-full rounded-(--radius-lg) border border-[var(--line-strong)] bg-[var(--bg-soft)] px-3 py-2 t-13 text-[var(--text)] outline-none focus:border-[var(--cykan)]"
          />
        </label>

        <label className="block">
          <span className="mb-1 block t-9 font-medium text-[var(--text-muted)]">Description</span>
          <input
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            className="w-full rounded-(--radius-lg) border border-[var(--line-strong)] bg-[var(--bg-soft)] px-3 py-2 t-13 text-[var(--text)] outline-none focus:border-[var(--cykan)]"
          />
        </label>

        <label className="block">
          <span className="mb-1 block t-9 font-medium text-[var(--text-muted)]">Endpoint URL</span>
          <input
            type="url"
            value={form.endpoint_url}
            onChange={(e) => set("endpoint_url", e.target.value)}
            placeholder="https://api.example.com/action"
            className="w-full rounded-(--radius-lg) border border-[var(--line-strong)] bg-[var(--bg-soft)] px-3 py-2 font-mono t-13 text-[var(--text)] outline-none focus:border-[var(--cykan)]"
          />
        </label>

        <div className="grid grid-cols-3 gap-4">
          <label className="block">
            <span className="mb-1 block t-9 font-medium text-[var(--text-muted)]">Méthode</span>
            <select
              value={form.http_method}
              onChange={(e) => set("http_method", e.target.value)}
              className="w-full rounded-(--radius-lg) border border-[var(--line-strong)] bg-[var(--bg-soft)] px-3 py-2 t-13 text-[var(--text)] outline-none"
            >
              {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block t-9 font-medium text-[var(--text-muted)]">Auth</span>
            <select
              value={form.auth_type}
              onChange={(e) => set("auth_type", e.target.value)}
              className="w-full rounded-(--radius-lg) border border-[var(--line-strong)] bg-[var(--bg-soft)] px-3 py-2 t-13 text-[var(--text)] outline-none"
            >
              {["none", "api_key", "oauth"].map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block t-9 font-medium text-[var(--text-muted)]">Timeout (ms)</span>
            <input
              type="number"
              min={100}
              max={300000}
              value={form.timeout_ms}
              onChange={(e) => set("timeout_ms", parseInt(e.target.value, 10))}
              className="w-full rounded-(--radius-lg) border border-[var(--line-strong)] bg-[var(--bg-soft)] px-3 py-2 t-13 text-[var(--text)] outline-none"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="ghost-btn-solid ghost-btn-cykan rounded-(--radius-sm) px-6 py-2.5 t-13 disabled:opacity-50"
        >
          {saving ? "Création..." : "Créer le tool"}
        </button>
      </form>
    </div>
  );
}
