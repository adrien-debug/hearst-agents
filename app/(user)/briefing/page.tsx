"use client";

import { useEffect, useState, useRef } from "react";
import { PageHeader } from "../components/PageHeader";
import { PdfViewer } from "../components/PdfViewer";
import { toast } from "@/app/hooks/use-toast";

interface BriefingData {
  text: string | null;
  audio: { status: string; url?: string } | null;
  generatedAt: number;
  pdfUrl?: string | null;
}

interface BriefHistoryItem {
  id: string;
  title: string;
  summary: string;
  createdAt: string;
  targetDate: string | null;
  pdfUrl: string | null;
}

const AUDIO_POLL_MAX_ATTEMPTS = 60; // 5 min @ 5s
const AUDIO_POLL_INTERVAL_MS = 5000;

export default function BriefingPage() {
  const [data, setData] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [history, setHistory] = useState<BriefHistoryItem[] | null>(null);
  const audioPollRef = useRef<{ attempts: number; timerId: ReturnType<typeof setTimeout> | null }>(
    { attempts: 0, timerId: null },
  );

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

  const loadHistory = async () => {
    try {
      const res = await fetch("/api/v2/daily-brief/history?limit=7", {
        credentials: "include",
      });
      if (!res.ok) {
        setHistory([]);
        return;
      }
      const payload = (await res.json()) as { briefs?: BriefHistoryItem[] };
      setHistory(payload.briefs ?? []);
    } catch {
      setHistory([]);
    }
  };

  useEffect(() => {
    void load();
    void loadHistory();
  }, []);

  // Auto-poll audio quand status === "generating"
  useEffect(() => {
    const status = data?.audio?.status;
    if (status !== "generating" && status !== "pending") {
      // Reset le polling si l'audio est ready/failed/absent
      if (audioPollRef.current.timerId) {
        clearTimeout(audioPollRef.current.timerId);
        audioPollRef.current.timerId = null;
      }
      audioPollRef.current.attempts = 0;
      return;
    }

    // Évite double-init
    if (audioPollRef.current.timerId) return;

    const tick = async () => {
      audioPollRef.current.attempts += 1;
      if (audioPollRef.current.attempts > AUDIO_POLL_MAX_ATTEMPTS) {
        toast.info("Audio en attente", "La génération audio prend plus de 5 min. Recharge la page si besoin.");
        return;
      }
      await load();
      audioPollRef.current.timerId = setTimeout(tick, AUDIO_POLL_INTERVAL_MS);
    };
    audioPollRef.current.timerId = setTimeout(tick, AUDIO_POLL_INTERVAL_MS);

    return () => {
      if (audioPollRef.current.timerId) {
        clearTimeout(audioPollRef.current.timerId);
        audioPollRef.current.timerId = null;
      }
    };
  }, [data?.audio?.status]);

  const handleGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/briefing", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("Brief généré", "Ton brief du jour est prêt.");
      await load();
      await loadHistory();
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
      className="flex"
      style={{
        gap: "var(--space-6)",
        padding: "var(--space-8) var(--space-6)",
        maxWidth: 1100,
        marginInline: "auto",
      }}
    >
      {/* Main content */}
      <div style={{ flex: "1 1 auto", maxWidth: "var(--width-prose, 680px)", minWidth: 0 }}>
        <PageHeader title="Brief du jour" back={{ label: "Cockpit", href: "/" }} />

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
              {/* PDF viewer si disponible */}
              {data?.pdfUrl && (
                <PdfViewer signedUrl={data.pdfUrl} fallbackHref={data.pdfUrl} height={500} />
              )}

              {/* Audio player */}
              {data?.audio?.status === "ready" && data.audio.url && (
                <div
                  style={{
                    padding: "var(--space-3) var(--space-4)",
                    background: "var(--surface-2)",
                    borderRadius: "var(--radius-sm)",
                    borderLeft: "2px solid var(--cykan)",
                  }}
                >
                  <p
                    className="t-9"
                    style={{ color: "var(--text-muted)", marginBottom: "var(--space-2)" }}
                  >
                    Version audio
                  </p>
                  <audio controls src={data.audio.url} style={{ width: "100%", height: 32 }} />
                </div>
              )}

              {(data?.audio?.status === "generating" || data?.audio?.status === "pending") && (
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
                <p
                  className="t-9"
                  style={{ color: "var(--text-faint)", marginTop: "var(--space-4)" }}
                >
                  Généré{" "}
                  {new Date(data.generatedAt).toLocaleDateString("fr-FR", {
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
              style={{
                gap: "var(--space-4)",
                paddingTop: "var(--space-12)",
                textAlign: "center",
              }}
            >
              <p className="t-13" style={{ color: "var(--text-muted)" }}>
                Aucun brief disponible pour aujourd&apos;hui.
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

      {/* History sidebar */}
      <aside
        className="hidden md:block"
        style={{
          flex: "0 0 240px",
          borderLeft: "1px solid var(--border-subtle)",
          paddingLeft: "var(--space-5)",
        }}
      >
        <h2
          className="t-9 font-medium"
          style={{
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            marginBottom: "var(--space-3)",
          }}
        >
          7 derniers briefs
        </h2>
        {history === null && (
          <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="skeleton-line"
                style={{ width: "100%", height: 32, borderRadius: "var(--radius-xs)" }}
              />
            ))}
          </div>
        )}
        {history && history.length === 0 && (
          <p className="t-9" style={{ color: "var(--text-faint)" }}>
            Aucun historique.
          </p>
        )}
        {history && history.length > 0 && (
          <ul className="flex flex-col" style={{ gap: "var(--space-2)" }}>
            {history.map((b) => (
              <li key={b.id}>
                <a
                  href={b.targetDate ? `/briefing?date=${b.targetDate}` : "#"}
                  className="t-11 block"
                  style={{
                    padding: "var(--space-2) var(--space-3)",
                    borderRadius: "var(--radius-xs)",
                    color: "var(--text-muted)",
                    transition: "background-color 150ms",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--surface-2)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <div className="font-medium" style={{ color: "var(--text)" }}>
                    {b.targetDate
                      ? new Date(b.targetDate).toLocaleDateString("fr-FR", {
                          weekday: "long",
                          day: "numeric",
                          month: "short",
                        })
                      : new Date(b.createdAt).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "short",
                        })}
                  </div>
                  {b.summary && (
                    <div
                      className="t-9"
                      style={{
                        color: "var(--text-faint)",
                        marginTop: 2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {b.summary}
                    </div>
                  )}
                </a>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
