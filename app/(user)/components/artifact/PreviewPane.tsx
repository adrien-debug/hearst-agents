"use client";

/**
 * PreviewPane — Pane droite d'ArtifactStage (B8).
 *
 * Rend l'output d'une exécution E2B selon son type :
 *   - stdout text  → <pre> mono
 *   - stderr       → block warn
 *   - HTML         → iframe sandboxed (allow-scripts uniquement, jamais
 *                    allow-same-origin pour des HTML user-générés)
 *   - image base64 → <img>
 *   - JSON         → <pre> mono (chart spec rendering = phase 2)
 *
 * Empty/loading/error états gérés inline. Pas de dépendance externe.
 */

import { useMemo } from "react";

export type ExecResultItem = {
  type: string;
  data: unknown;
};

export interface ExecResult {
  stdout: string;
  stderr: string;
  results: ExecResultItem[];
  error?: string | null;
}

interface PreviewPaneProps {
  state: "idle" | "running" | "ready" | "failed";
  result?: ExecResult | null;
  errorMessage?: string | null;
  /** Progress (0-100) lors d'un run. */
  progress?: number;
}

export function PreviewPane({ state, result, errorMessage, progress }: PreviewPaneProps) {
  const htmlResult = useMemo(() => {
    if (!result) return null;
    return result.results.find(
      (r) => r.type === "text" && typeof r.data === "string" && /^<!?\w/i.test((r.data as string).trim()),
    ) as ExecResultItem | undefined;
  }, [result]);

  const imageResult = useMemo(() => {
    if (!result) return null;
    return result.results.find(
      (r) => r.type === "image/png" || r.type === "image/jpeg",
    ) as ExecResultItem | undefined;
  }, [result]);

  const jsonResult = useMemo(() => {
    if (!result) return null;
    return result.results.find((r) => r.type === "json") as ExecResultItem | undefined;
  }, [result]);

  if (state === "idle") {
    return (
      <div
        className="flex h-full flex-1 flex-col items-center justify-center text-center"
        style={{ padding: "var(--space-8)" }}
      >
        <p className="t-13 font-light text-[var(--text-faint)]">
          La sortie d&apos;exécution apparaîtra ici.
        </p>
        <p className="t-9 mt-2 font-mono uppercase tracking-marquee text-[var(--text-ghost)]">
          ⌘Enter pour lancer
        </p>
      </div>
    );
  }

  if (state === "running") {
    return (
      <div
        className="flex h-full flex-1 flex-col items-center justify-center gap-4"
        style={{ padding: "var(--space-8)" }}
      >
        <span
          className="rounded-pill bg-[var(--cykan)] halo-cyan-sm"
          style={{
            width: "var(--space-3)",
            height: "var(--space-3)",
            animation: "pulse 1.2s ease-in-out infinite",
          }}
          aria-hidden
        />
        <p className="t-9 font-mono uppercase tracking-marquee text-[var(--cykan)]">
          E2B · EXÉCUTION{progress != null ? ` · ${Math.round(progress)}%` : ""}
        </p>
      </div>
    );
  }

  if (state === "failed") {
    return (
      <div
        className="flex h-full flex-1 flex-col gap-3"
        style={{ padding: "var(--space-6)" }}
      >
        <span className="t-9 font-mono uppercase tracking-marquee text-[var(--danger)]">
          ÉCHEC
        </span>
        <pre
          className="t-11 font-mono whitespace-pre-wrap text-[var(--danger)]"
          style={{
            padding: "var(--space-3)",
            background: "var(--surface-1)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-default)",
          }}
        >
          {errorMessage ?? "Erreur inconnue"}
        </pre>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div
      className="flex h-full flex-1 flex-col gap-4 overflow-y-auto"
      style={{ padding: "var(--space-6)" }}
    >
      {result.error && (
        <section className="flex flex-col gap-2">
          <span className="t-9 font-mono uppercase tracking-marquee text-[var(--danger)]">
            ERROR
          </span>
          <pre
            className="t-11 font-mono whitespace-pre-wrap text-[var(--danger)]"
            style={{
              padding: "var(--space-3)",
              background: "var(--surface-1)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            {result.error}
          </pre>
        </section>
      )}

      {imageResult && (
        <section className="flex flex-col gap-2">
          <span className="t-9 font-mono uppercase tracking-marquee text-[var(--cykan)]">
            IMAGE
          </span>
          <img
            src={`data:${imageResult.type};base64,${imageResult.data as string}`}
            alt="Sortie image E2B"
            className="max-w-full rounded-md border border-[var(--border-default)]"
          />
        </section>
      )}

      {htmlResult && (
        <section className="flex flex-col gap-2">
          <span className="t-9 font-mono uppercase tracking-marquee text-[var(--cykan)]">
            HTML
          </span>
          <iframe
            sandbox="allow-scripts"
            srcDoc={htmlResult.data as string}
            title="Sortie HTML E2B"
            className="rounded-md border border-[var(--border-default)] bg-[var(--surface-1)]"
            style={{ width: "100%", minHeight: "var(--space-32)" }}
          />
        </section>
      )}

      {jsonResult && (
        <section className="flex flex-col gap-2">
          <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-ghost)]">
            JSON
          </span>
          <pre
            className="t-11 font-mono whitespace-pre-wrap text-[var(--text-muted)]"
            style={{
              padding: "var(--space-3)",
              background: "var(--surface-1)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-default)",
            }}
          >
            {JSON.stringify(jsonResult.data, null, 2)}
          </pre>
        </section>
      )}

      {result.stdout && (
        <section className="flex flex-col gap-2">
          <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-ghost)]">
            STDOUT
          </span>
          <pre
            className="t-11 font-mono whitespace-pre-wrap text-[var(--text)]"
            style={{
              padding: "var(--space-3)",
              background: "var(--surface-1)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-default)",
            }}
          >
            {result.stdout}
          </pre>
        </section>
      )}

      {result.stderr && (
        <section className="flex flex-col gap-2">
          <span className="t-9 font-mono uppercase tracking-marquee text-[var(--warn)]">
            STDERR
          </span>
          <pre
            className="t-11 font-mono whitespace-pre-wrap text-[var(--warn)]"
            style={{
              padding: "var(--space-3)",
              background: "var(--surface-1)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-default)",
            }}
          >
            {result.stderr}
          </pre>
        </section>
      )}

      {!result.stdout && !result.stderr && !result.error && result.results.length === 0 && (
        <p className="t-13 font-light text-[var(--text-faint)]">
          Exécution terminée sans sortie.
        </p>
      )}
    </div>
  );
}
