"use client";

import { useEffect, useState } from "react";
import type { AssetVariant } from "@/lib/assets/variants";

interface CodeRunnerProps {
  variant: AssetVariant;
}

interface CodeOutput {
  code?: string;
  stdout?: string;
  stderr?: string;
  outputs?: Array<{ type: "text" | "image"; data: string }>;
  error?: string;
}

function CodeResults({ storageUrl }: { storageUrl: string }) {
  const [result, setResult] = useState<CodeOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(storageUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<CodeOutput>;
      })
      .then((data) => {
        if (!cancelled) { setResult(data); setLoading(false); }
      })
      .catch((err) => {
        if (!cancelled) { setFetchError(err instanceof Error ? err.message : String(err)); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, [storageUrl]);

  if (loading) {
    return <p className="t-13 font-light text-[var(--text-muted)]">Chargement des résultats…</p>;
  }
  if (fetchError || !result) {
    return <p className="t-13 text-[var(--danger)]">{fetchError ?? "Impossible de charger les résultats"}</p>;
  }

  return (
    <div className="flex flex-col" style={{ gap: "var(--space-4)" }}>
      {result.stdout && (
        <pre
          className="t-11 font-mono text-[var(--text-muted)] bg-[var(--surface-1)] rounded-sm overflow-x-auto"
          style={{ padding: "var(--space-4)" }}
        >
          {result.stdout}
        </pre>
      )}
      {(result.error || result.stderr) && (
        <pre
          className="t-11 font-mono text-[var(--danger)] bg-[var(--surface-1)] rounded-sm overflow-x-auto"
          style={{ padding: "var(--space-4)" }}
        >
          {result.error ?? result.stderr}
        </pre>
      )}
      {result.outputs?.map((out, i) =>
        out.type === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={out.data} alt={`output-${i}`} className="w-full rounded-sm border border-[var(--border-shell)]" />
        ) : (
          <pre
            key={i}
            className="t-11 font-mono text-[var(--text-muted)] bg-[var(--surface-1)] rounded-sm overflow-x-auto"
            style={{ padding: "var(--space-4)" }}
          >
            {out.data}
          </pre>
        )
      )}
    </div>
  );
}

export function CodeRunner({ variant }: CodeRunnerProps) {
  const isReady = variant.status === "ready" && !!variant.storageUrl;
  const isFailed = variant.status === "failed";

  return (
    <div className="border border-[var(--surface-2)] rounded-md bg-[var(--surface-1)] p-6">
      <header className="flex items-center mb-4">
        <div className="flex items-center gap-3">
          <span
            className={`rounded-pill ${
              isReady ? "bg-[var(--cykan)]" : isFailed ? "bg-[var(--danger)]" : "bg-[var(--warn)] animate-pulse"
            }`}
            style={{ width: "var(--space-2)", height: "var(--space-2)" }}
            aria-hidden
          />
          <span
            className={`t-13 font-medium ${
              isReady ? "text-[var(--cykan)]" : isFailed ? "text-[var(--danger)]" : "text-[var(--warn)]"
            }`}
          >
            {isReady ? "Code prêt" : isFailed ? "Échec" : "Exécution…"}
          </span>
        </div>
      </header>

      {isReady && variant.storageUrl ? (
        <CodeResults storageUrl={variant.storageUrl} />
      ) : isFailed ? (
        <p className="t-13 text-[var(--danger)]">{variant.error ?? "Génération échouée"}</p>
      ) : (
        <p className="t-13 font-light text-[var(--text-muted)]">
          Exécution sandbox E2B…
        </p>
      )}
    </div>
  );
}
