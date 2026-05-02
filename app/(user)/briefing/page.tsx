"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { toast } from "@/app/hooks/use-toast";

interface BriefingData {
  text: string | null;
  audio: { status: string; url?: string } | null;
  generatedAt: number;
}

export default function BriefingPage() {
  const [data, setData] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    try {
      const res = await fetch("/api/briefing");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const handleGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/briefing", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("Brief généré", "Ton brief du jour est prêt.");
      await load();
    } catch (err) {
      toast.error("Impossible de générer le brief", err instanceof Error ? err.message : "Erreur");
    } finally {
      setGenerating(false);
    }
  };

  const paragraphs = data?.text
    ? data.text.trim().split(/\n{2,}/).filter((p) => p.trim().length > 0)
    : [];

  return (
    <div
      style={{
        maxWidth: "var(--width-prose, 680px)",
        marginInline: "auto",
        padding: "var(--space-8) var(--space-6)",
      }}
    >
      <PageHeader
        title="Brief du jour"
        back={{ label: "Cockpit", href: "/" }}
      />

      <div style={{ marginTop: "var(--space-8)" }}>
        {loading && (
          <div className="flex flex-col" style={{ gap: "var(--space-3)" }}>
            {[80, 95, 70, 88, 60].map((w, i) => (
              <div
                key={i}
                className="skeleton-line"
                style={{ width: `${w}%`, height: "1em", borderRadius: "var(--radius-xs)" }}
              />
            ))}
          </div>
        )}

        {!loading && paragraphs.length > 0 && (
          <article className="flex flex-col" style={{ gap: "var(--space-5)" }}>
            {data?.audio?.status === "ready" && data.audio.url && (
              <div
                style={{
                  padding: "var(--space-3) var(--space-4)",
                  background: "var(--surface-2)",
                  borderRadius: "var(--radius-sm)",
                  borderLeft: "2px solid var(--cykan)",
                }}
              >
                <p className="t-9" style={{ color: "var(--text-muted)", marginBottom: "var(--space-2)" }}>
                  Version audio
                </p>
                <audio controls src={data.audio.url} style={{ width: "100%", height: 32 }} />
              </div>
            )}

            {data?.audio?.status === "generating" && (
              <p
                className="t-9"
                style={{
                  color: "var(--text-muted)",
                  borderLeft: "2px solid var(--cykan)",
                  paddingLeft: "var(--space-3)",
                }}
              >
                Audio en cours de génération…
              </p>
            )}

            {paragraphs.map((p, i) => (
              <p
                key={i}
                className="t-13"
                style={{
                  color: i === 0 ? "var(--text)" : "var(--text-muted)",
                  fontWeight: i === 0 ? 500 : 400,
                  lineHeight: 1.65,
                }}
              >
                {p.trim()}
              </p>
            ))}

            {data?.generatedAt && (
              <p className="t-9" style={{ color: "var(--text-faint)", marginTop: "var(--space-4)" }}>
                Généré {new Date(data.generatedAt).toLocaleDateString("fr-FR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}
          </article>
        )}

        {!loading && paragraphs.length === 0 && (
          <div
            className="flex flex-col items-center"
            style={{ gap: "var(--space-4)", paddingTop: "var(--space-12)", textAlign: "center" }}
          >
            <p className="t-13" style={{ color: "var(--text-muted)" }}>
              Aucun brief disponible pour aujourd'hui.
            </p>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="read-more"
            >
              {generating ? "Génération en cours…" : "Générer le brief →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
