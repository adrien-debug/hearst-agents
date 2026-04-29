"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useStageStore } from "@/stores/stage";

interface BrowserStageProps {
  sessionId: string;
}

interface SessionStartResponse {
  sessionId: string;
  connectUrl?: string;
  debugViewerUrl?: string;
}

interface SessionStatusResponse {
  status: string;
  createdAt?: string;
  stoppedAt?: string;
  debugViewerUrl?: string;
  connectUrl?: string;
}

const STATUS_POLL_INTERVAL_MS = 2_000;
const STATUS_POLL_MAX_ATTEMPTS = 30;

/**
 * BrowserStage — Session browser live co-pilotable.
 *
 * Signature 3 — Co-Browsing : empty state offre un input pour décrire la
 * tâche, puis POST /api/v2/browser/start crée la session Browserbase et
 * affiche le debug viewer en iframe plein écran. Le bouton Stop coupe la
 * session ; le pilotage manuel (« Take Over ») arrive en Phase B.8 avec
 * Stagehand.
 *
 * Phase B.8 stub : Stagehand pas encore branché — l'iframe montre la
 * session vide, l'ACTION_LOG reste à venir.
 */
export function BrowserStage({ sessionId }: BrowserStageProps) {
  const back = useStageStore((s) => s.back);
  const setMode = useStageStore((s) => s.setMode);

  const [taskInput, setTaskInput] = useState("");
  const [debugViewerByid, setDebugViewerByid] = useState<Record<string, string>>({});
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollAttemptsRef = useRef(0);

  const debugViewerUrl = sessionId ? debugViewerByid[sessionId] : undefined;

  // Lance la session Browserbase à partir de l'empty state.
  const startSession = useCallback(async () => {
    const task = taskInput.trim();
    if (!task) {
      setError("Décris la tâche à confier au browser agent.");
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/v2/browser/start", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task }),
      });
      const data = (await res.json()) as SessionStartResponse & { error?: string; message?: string };
      if (!res.ok) {
        setError(data.message || data.error || "Échec de la création de session");
        return;
      }
      if (data.debugViewerUrl) {
        setDebugViewerByid((prev) => ({ ...prev, [data.sessionId]: data.debugViewerUrl as string }));
      }
      setMode({ mode: "browser", sessionId: data.sessionId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setStarting(false);
    }
  }, [taskInput, setMode]);

  // Lookup le debugViewerUrl si on arrive sur la stage avec un sessionId
  // déjà set (cas où la session a été démarrée par un tool ou un autre flow).
  useEffect(() => {
    if (!sessionId || debugViewerUrl) return;

    let cancelled = false;
    pollAttemptsRef.current = 0;

    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/v2/browser/${encodeURIComponent(sessionId)}`, {
          credentials: "include",
        });
        if (!res.ok) return false;
        const data = (await res.json()) as SessionStatusResponse;
        if (cancelled) return true;
        if (data.debugViewerUrl) {
          setDebugViewerByid((prev) => ({ ...prev, [sessionId]: data.debugViewerUrl as string }));
          return true;
        }
      } catch (_err) {
        // Non-fatal — retry au prochain tick.
      }
      return false;
    };

    void (async () => {
      const got = await fetchStatus();
      if (got || cancelled) return;
      const timer = setInterval(async () => {
        pollAttemptsRef.current += 1;
        if (pollAttemptsRef.current >= STATUS_POLL_MAX_ATTEMPTS) {
          clearInterval(timer);
          return;
        }
        const ok = await fetchStatus();
        if (ok) clearInterval(timer);
      }, STATUS_POLL_INTERVAL_MS);
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId, debugViewerUrl]);

  const stopCurrentSession = useCallback(async () => {
    if (!sessionId) return;
    setStopping(true);
    setError(null);
    try {
      const res = await fetch(`/api/v2/browser/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        setError(data.message || data.error || "Échec de l'arrêt de session");
        return;
      }
      setDebugViewerByid((prev) => {
        if (!(sessionId in prev)) return prev;
        const next = { ...prev };
        delete next[sessionId];
        return next;
      });
      setMode({ mode: "browser", sessionId: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setStopping(false);
    }
  }, [sessionId, setMode]);

  // ── Empty state ──────────────────────────────────────────────
  if (!sessionId) {
    return (
      <div
        className="flex-1 flex flex-col min-h-0 relative"
        style={{ background: "var(--bg-center)" }}
      >
        <header className="flex items-center justify-between px-12 py-6 flex-shrink-0 border-b border-[var(--border-default)]">
          <div className="flex items-center gap-4">
            <span
              className="rounded-pill bg-[var(--cykan)] animate-pulse halo-dot"
              style={{ width: "var(--space-2)", height: "var(--space-2)" }}
            />
            <span className="t-9 font-mono uppercase tracking-marquee text-[var(--cykan)]">
              BROWSER_SESSION
            </span>
            <span
              className="rounded-pill bg-[var(--text-ghost)]"
              style={{ width: "var(--space-1)", height: "var(--space-1)" }}
            />
            <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-muted)]">
              AWAITING
            </span>
          </div>
          <button
            onClick={back}
            className="halo-on-hover inline-flex items-center gap-2 px-3 py-1.5 t-9 font-mono uppercase tracking-section border border-[var(--border-shell)] text-[var(--text-faint)] hover:text-[var(--cykan)] hover:border-[var(--cykan-border-hover)] transition-all shrink-0"
          >
            <span>Retour</span>
            <span className="opacity-60">⌘⌫</span>
          </button>
        </header>
        <div className="flex-1 flex items-center justify-center px-8">
          <div className="text-center max-w-md flex flex-col gap-6 w-full">
            <span
              className="block text-[var(--cykan)] opacity-30 halo-cyan-md mx-auto t-34"
              style={{ height: "var(--height-stage-empty-icon)" }}
              aria-hidden
            >
              ◐
            </span>
            <p
              className="t-15 font-medium tracking-tight text-[var(--text)]"
              style={{ lineHeight: "var(--leading-snug)" }}
            >
              Aucune session browser active
            </p>
            <p
              className="t-13 text-[var(--text-muted)]"
              style={{ lineHeight: "var(--leading-base)" }}
            >
              Décris la tâche à confier au browser agent — la session live
              s{"'"}affichera ici. Le pilotage manuel arrive en Phase B.8.
            </p>
            <div className="flex flex-col gap-4 w-full mt-2">
              <input
                type="text"
                value={taskInput}
                onChange={(e) => setTaskInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !starting) void startSession();
                }}
                placeholder="ex: compare les prix de livraison sur ces 5 sites"
                className="ghost-input-line w-full text-left"
                disabled={starting}
              />
              <button
                type="button"
                onClick={() => void startSession()}
                disabled={starting || !taskInput.trim()}
                className="halo-on-hover px-6 py-3 t-9 font-mono uppercase tracking-marquee bg-[var(--cykan)] text-[var(--bg)] hover:tracking-[0.4em] transition-all duration-slow disabled:opacity-60"
              >
                {starting ? "Création de la session…" : "Lancer la session"}
              </button>
              {error && (
                <p className="t-11 font-mono uppercase tracking-display text-[var(--danger)]">
                  {error}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Live session ─────────────────────────────────────────────
  return (
    <div
      className="flex-1 flex flex-col min-h-0 relative"
      style={{ background: "var(--bg-center)" }}
    >
      <header className="flex items-center justify-between px-12 py-6 flex-shrink-0 border-b border-[var(--border-default)]">
        <div className="flex items-center gap-4">
          <span
            className="rounded-pill bg-[var(--cykan)] animate-pulse halo-dot"
            style={{ width: "var(--space-2)", height: "var(--space-2)" }}
          />
          <span className="t-9 font-mono uppercase tracking-marquee text-[var(--cykan)]">
            BROWSER_SESSION
          </span>
          <span
            className="rounded-pill bg-[var(--text-ghost)]"
            style={{ width: "var(--space-1)", height: "var(--space-1)" }}
          />
          <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-muted)]">
            {sessionId.slice(0, 8)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void stopCurrentSession()}
            disabled={stopping}
            className="halo-on-hover inline-flex items-center gap-2 px-3 py-1.5 t-9 font-mono uppercase tracking-section border border-[var(--border-shell)] text-[var(--danger)] hover:border-[var(--danger)] transition-all shrink-0 disabled:opacity-60"
          >
            {stopping ? "Arrêt…" : "Stop"}
          </button>
          <button
            onClick={back}
            className="halo-on-hover inline-flex items-center gap-2 px-3 py-1.5 t-9 font-mono uppercase tracking-section border border-[var(--border-shell)] text-[var(--text-faint)] hover:text-[var(--cykan)] hover:border-[var(--cykan-border-hover)] transition-all shrink-0"
          >
            <span>Retour</span>
            <span className="opacity-60">⌘⌫</span>
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col min-h-0">
        {debugViewerUrl ? (
          <iframe
            src={debugViewerUrl}
            title={`Browserbase live viewer ${sessionId}`}
            className="flex-1 w-full border-0"
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex items-center gap-3">
              <span
                className="rounded-pill bg-[var(--warn)] animate-pulse"
                style={{ width: "var(--space-2)", height: "var(--space-2)" }}
                aria-hidden
              />
              <span className="t-11 font-mono uppercase tracking-marquee text-[var(--text-muted)]">
                Connexion à la session…
              </span>
            </div>
          </div>
        )}

        <footer
          className="flex-shrink-0 border-t border-[var(--border-default)] px-12 py-4 flex flex-col gap-2"
          style={{ height: "var(--height-action-log)" }}
        >
          <div className="flex items-center justify-between">
            <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
              ACTION_LOG
            </span>
            <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
              PILOTAGE MANUEL — PHASE B.8 STAGEHAND
            </span>
            {error && (
              <span className="t-9 font-mono uppercase tracking-marquee text-[var(--danger)]">
                {error}
              </span>
            )}
          </div>
          <p className="t-11 font-mono text-[var(--text-muted)]">
            Aucune action enregistrée — Phase B.8 Stagehand requise.
          </p>
        </footer>
      </div>
    </div>
  );
}
