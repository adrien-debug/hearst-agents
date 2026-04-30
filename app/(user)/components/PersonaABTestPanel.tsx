"use client";

/**
 * PersonaABTestPanel — UI pour comparer 2 réponses générées avec 2 personas.
 *
 * Tokens uniquement, pas de magic numbers.
 */

import { useState } from "react";
import type { Persona } from "@/lib/personas/types";

interface PersonaABTestPanelProps {
  personas: Persona[];
}

interface AbTestResponse {
  message: string;
  a: { persona: Persona; response: string; latencyMs: number };
  b: { persona: Persona; response: string; latencyMs: number };
}

export function PersonaABTestPanel({ personas }: PersonaABTestPanelProps) {
  const [message, setMessage] = useState("Présente-moi en 3 phrases la mission Hearst OS.");
  const [a, setA] = useState<string>(personas[0]?.id ?? "");
  const [b, setB] = useState<string>(personas[1]?.id ?? personas[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AbTestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState<"a" | "b" | null>(null);

  async function run() {
    if (!message.trim() || !a || !b || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setPick(null);
    try {
      const res = await fetch("/api/v2/personas/ab-test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: message.trim(), personaIdA: a, personaIdB: b }),
      });
      const data = (await res.json()) as AbTestResponse | { error?: string; message?: string };
      if (!res.ok || "error" in data) {
        const msg = ("message" in data && data.message) || ("error" in data && data.error) || "ab_test_failed";
        throw new Error(msg);
      }
      setResult(data as AbTestResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur A/B test");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      className="flex flex-col"
      style={{
        gap: "var(--space-4)",
        padding: "var(--space-5)",
        border: "1px solid var(--line-strong)",
        borderRadius: "var(--radius-md)",
        background: "var(--bg-elev)",
      }}
    >
      <header className="flex items-baseline justify-between" style={{ gap: "var(--space-3)" }}>
        <h2 className="t-15 font-medium text-[var(--text)]">A/B test inline</h2>
        <p className="t-11 font-light text-[var(--text-faint)]">
          2 personas · 1 message · 2 réponses
        </p>
      </header>

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={3}
        placeholder="Message à tester sur les deux personas…"
        className="block w-full bg-transparent t-13 font-light text-[var(--text)] placeholder:text-[var(--text-soft)] focus:ring-0 focus:outline-none resize-none"
        style={{
          padding: "var(--space-3)",
          border: "1px solid var(--line-strong)",
          borderRadius: "var(--radius-sm)",
          background: "var(--surface-1)",
        }}
      />

      <div
        className="grid grid-cols-1 sm:grid-cols-2"
        style={{ gap: "var(--space-3)" }}
      >
        <PersonaSelect label="Persona A" value={a} onChange={setA} personas={personas} />
        <PersonaSelect label="Persona B" value={b} onChange={setB} personas={personas} />
      </div>

      <div className="flex items-center justify-between" style={{ gap: "var(--space-3)" }}>
        <p className="t-11 font-light text-[var(--text-faint)]">
          {loading ? "Génération en parallèle…" : "Lance la comparaison"}
        </p>
        <button
          type="button"
          onClick={run}
          disabled={loading || !message.trim() || !a || !b || a === b}
          className="ghost-btn-solid ghost-btn-cykan rounded-(--radius-sm)"
          style={{
            padding: "var(--space-2) var(--space-4)",
            opacity: loading || !message.trim() || !a || !b || a === b ? 0.5 : 1,
          }}
        >
          <span className="t-11 font-medium">{loading ? "…" : "Lancer A/B"}</span>
        </button>
      </div>

      {error && (
        <p className="t-11 font-medium text-[var(--danger)]">
          {error}
        </p>
      )}

      {result && (
        <div
          className="grid grid-cols-1 lg:grid-cols-2"
          style={{ gap: "var(--space-3)" }}
        >
          <ResponseColumn
            label="A"
            persona={result.a.persona}
            response={result.a.response}
            latencyMs={result.a.latencyMs}
            preferred={pick === "a"}
            onPrefer={() => setPick("a")}
          />
          <ResponseColumn
            label="B"
            persona={result.b.persona}
            response={result.b.response}
            latencyMs={result.b.latencyMs}
            preferred={pick === "b"}
            onPrefer={() => setPick("b")}
          />
        </div>
      )}
    </section>
  );
}

function PersonaSelect({
  label,
  value,
  onChange,
  personas,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  personas: Persona[];
}) {
  return (
    <label className="flex flex-col" style={{ gap: "var(--space-2)" }}>
      <span className="t-11 font-light text-[var(--text-faint)]">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block w-full bg-transparent t-13 text-[var(--text)] focus:outline-none"
        style={{
          padding: "var(--space-2) var(--space-3)",
          border: "1px solid var(--line-strong)",
          borderRadius: "var(--radius-sm)",
          background: "var(--surface-1)",
        }}
      >
        {personas.length === 0 ? (
          <option value="">— aucune persona —</option>
        ) : null}
        {personas.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function ResponseColumn({
  label,
  persona,
  response,
  latencyMs,
  preferred,
  onPrefer,
}: {
  label: string;
  persona: Persona;
  response: string;
  latencyMs: number;
  preferred: boolean;
  onPrefer: () => void;
}) {
  return (
    <article
      className="flex flex-col"
      style={{
        gap: "var(--space-3)",
        padding: "var(--space-4)",
        border: preferred ? "1px solid var(--cykan)" : "1px solid var(--line-strong)",
        borderRadius: "var(--radius-sm)",
        background: preferred ? "var(--cykan-surface)" : "var(--surface-1)",
      }}
    >
      <header className="flex items-baseline justify-between" style={{ gap: "var(--space-3)" }}>
        <div className="flex items-baseline" style={{ gap: "var(--space-2)" }}>
          <span className="t-11 font-medium text-[var(--cykan)]">
            {label}
          </span>
          <span className="t-13 font-medium text-[var(--text)]">{persona.name}</span>
        </div>
        <span className="t-11 font-light text-[var(--text-faint)]">
          {latencyMs}ms
        </span>
      </header>
      <pre
        className="whitespace-pre-wrap t-13 font-light text-[var(--text-soft)]"
        style={{ margin: 0, fontFamily: "inherit" }}
      >
        {response}
      </pre>
      <button
        type="button"
        onClick={onPrefer}
        className="self-start ghost-btn-solid"
        style={{
          padding: "var(--space-1) var(--space-3)",
          borderRadius: "var(--radius-pill)",
          border: preferred ? "1px solid var(--cykan)" : "1px solid var(--line-strong)",
          background: preferred ? "var(--cykan-surface)" : "transparent",
        }}
      >
        <span className="t-11 font-medium text-[var(--text-soft)]">
          {preferred ? "préférée" : `préférer ${label}`}
        </span>
      </button>
    </article>
  );
}
