"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useStageStore } from "@/stores/stage";
import { StageActionBar, type StageAction } from "./StageActionBar";
import { ActionLog } from "../ActionLog";
import { ExtractSchemaModal } from "../browser/ExtractSchemaModal";
import { Action } from "../ui";
import type { BrowserAction } from "@/lib/events/types";

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

interface StreamMessage {
  type: string;
  sessionId?: string;
  action?: BrowserAction;
  summary?: string;
  totalActions?: number;
  totalDurationMs?: number;
  assetIds?: string[];
  error?: string;
}

/**
 * BrowserStage — Session browser live co-pilotable (B5).
 *
 * Layout split : iframe Browserbase (~70%) | ActionLog colonne droite (~30%).
 * L'utilisateur décrit la tâche, l'agent navigue, chaque action s'affiche
 * en live dans l'ACTION_LOG. Take Over rend la session interactive,
 * Capture/Extract génèrent des assets.
 */
export function BrowserStage({ sessionId }: BrowserStageProps) {
  const back = useStageStore((s) => s.back);
  const setMode = useStageStore((s) => s.setMode);

  const [taskInput, setTaskInput] = useState("");
  const [debugViewerByid, setDebugViewerByid] = useState<Record<string, string>>({});
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actions, setActions] = useState<BrowserAction[]>([]);
  const [isControlled, setIsControlled] = useState(false);
  const [extractOpen, setExtractOpen] = useState(false);
  const [extractLoading, setExtractLoading] = useState(false);
  const pollAttemptsRef = useRef(0);

  const debugViewerUrl = sessionId ? debugViewerByid[sessionId] : undefined;

  const executeTaskOn = useCallback(async (sid: string, task: string) => {
    setExecuting(true);
    setError(null);
    setIsControlled(false);
    try {
      const res = await fetch(
        `/api/v2/browser/${encodeURIComponent(sid)}/execute`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        setError(data.message || data.error || "Échec de l'exécution");
        setExecuting(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau");
      setExecuting(false);
    }
  }, []);

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
      const data = (await res.json()) as SessionStartResponse & {
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        setError(data.message || data.error || "Échec de la création de session");
        return;
      }
      if (data.debugViewerUrl) {
        setDebugViewerByid((prev) => ({
          ...prev,
          [data.sessionId]: data.debugViewerUrl as string,
        }));
      }
      setMode({ mode: "browser", sessionId: data.sessionId });

      // Lance immédiatement la première tâche autonome.
      void executeTaskOn(data.sessionId, task);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setStarting(false);
    }
  }, [taskInput, setMode, executeTaskOn]);

  // Lookup le debugViewerUrl si on arrive sur la stage avec un sessionId
  // déjà set (cas où la session a été démarrée par un tool ou un autre flow).
  useEffect(() => {
    if (!sessionId || debugViewerUrl) return;

    let cancelled = false;
    pollAttemptsRef.current = 0;

    const fetchStatus = async () => {
      try {
        const res = await fetch(
          `/api/v2/browser/${encodeURIComponent(sessionId)}`,
          { credentials: "include" },
        );
        if (!res.ok) return false;
        const data = (await res.json()) as SessionStatusResponse;
        if (cancelled) return true;
        if (data.debugViewerUrl) {
          setDebugViewerByid((prev) => ({
            ...prev,
            [sessionId]: data.debugViewerUrl as string,
          }));
          return true;
        }
      } catch {
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

  // SSE — events bus global (browser_action / browser_task_completed / failed / take_over).
  useEffect(() => {
    if (!sessionId) return;
    const es = new EventSource("/api/admin/events-stream", { withCredentials: true });
    const onMsg = (ev: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(ev.data) as StreamMessage;
        if (msg.sessionId && msg.sessionId !== sessionId) return;
        switch (msg.type) {
          case "browser_action":
            if (msg.action) {
              setActions((prev) => [...prev, msg.action as BrowserAction]);
            }
            break;
          case "browser_task_completed":
            setExecuting(false);
            break;
          case "browser_task_failed":
            setExecuting(false);
            if (msg.error && msg.error !== "task_aborted") {
              setError(msg.error);
            }
            break;
          case "browser_take_over":
            setExecuting(false);
            setIsControlled(true);
            break;
        }
      } catch {
        // ignore non-JSON heartbeats
      }
    };
    es.addEventListener("message", onMsg);
    return () => {
      es.removeEventListener("message", onMsg);
      es.close();
    };
  }, [sessionId]);

  const stopCurrentSession = useCallback(async () => {
    if (!sessionId) return;
    setStopping(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v2/browser/${encodeURIComponent(sessionId)}`,
        { method: "DELETE", credentials: "include" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
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
      setActions([]);
      setIsControlled(false);
      setExecuting(false);
      setMode({ mode: "browser", sessionId: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setStopping(false);
    }
  }, [sessionId, setMode]);

  const takeOver = useCallback(async () => {
    if (!sessionId) return;
    try {
      await fetch(
        `/api/v2/browser/${encodeURIComponent(sessionId)}/take-over`,
        { method: "POST", credentials: "include" },
      );
      setIsControlled(true);
      setExecuting(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau");
    }
  }, [sessionId]);

  const capture = useCallback(async () => {
    if (!sessionId) return;
    setCapturing(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v2/browser/${encodeURIComponent(sessionId)}/capture`,
        { method: "POST", credentials: "include" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        assetId?: string;
        url?: string;
        error?: string;
        message?: string;
      };
      if (!res.ok || !data.assetId) {
        setError(data.message || data.error || "Échec de la capture");
        return;
      }
      // Ajoute manuellement une entrée ACTION_LOG pour traçabilité.
      setActions((prev) => [
        ...prev,
        {
          id: `cap-${Date.now()}`,
          type: "screenshot",
          target: data.url ?? "screenshot",
          screenshotUrl: data.url,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setCapturing(false);
    }
  }, [sessionId]);

  const submitExtract = useCallback(
    async (payload: { instruction: string; schema?: Record<string, unknown> }) => {
      if (!sessionId) return;
      setExtractLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/v2/browser/${encodeURIComponent(sessionId)}/extract`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        const data = (await res.json().catch(() => ({}))) as {
          assetId?: string;
          error?: string;
          message?: string;
        };
        if (!res.ok || !data.assetId) {
          setError(data.message || data.error || "Échec de l'extraction");
          return;
        }
        setExtractOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur réseau");
      } finally {
        setExtractLoading(false);
      }
    },
    [sessionId],
  );

  // ── Empty state ──────────────────────────────────────────────
  if (!sessionId) {
    return (
      <div
        className="flex-1 flex flex-col min-h-0 relative"
        style={{ background: "var(--bg-center)" }}
      >
        <StageActionBar
          context={
            <>
              <span
                className="rounded-pill bg-[var(--cykan)] animate-pulse halo-dot"
                style={{ width: "var(--space-2)", height: "var(--space-2)" }}
              />
              <span className="t-11 font-medium text-[var(--cykan)]">
                BROWSER
              </span>
              <span
                className="rounded-pill bg-[var(--text-ghost)]"
                style={{ width: "var(--space-1)", height: "var(--space-1)" }}
              />
              <span className="t-11 font-light text-[var(--text-muted)]">
                AWAITING
              </span>
            </>
          }
          onBack={back}
        />
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
              s{"'"}affichera ici avec l{"'"}ACTION_LOG en colonne droite.
            </p>
            <div className="flex flex-col gap-4 w-full mt-2">
              <input
                type="text"
                value={taskInput}
                onChange={(e) => setTaskInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !starting) void startSession();
                }}
                placeholder="ex: va sur example.com et capture la home page"
                className="ghost-input-line w-full text-left"
                disabled={starting}
              />
              <Action
                variant="primary"
                tone="brand"
                onClick={() => void startSession()}
                disabled={!taskInput.trim()}
                loading={starting}
              >
                Lancer la session
              </Action>
              {error && (
                <p className="t-11 font-medium text-[var(--danger)]">
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
  const secondaryActions: StageAction[] = [
    {
      id: "capture",
      label: capturing ? "Capture…" : "Capture",
      onClick: () => void capture(),
      disabled: capturing,
      loading: capturing,
    },
    {
      id: "extract",
      label: "Extract",
      onClick: () => setExtractOpen(true),
      disabled: extractLoading,
    },
    {
      id: "stop",
      label: stopping ? "Arrêt…" : "Stop",
      variant: "danger",
      onClick: () => void stopCurrentSession(),
      disabled: stopping,
      loading: stopping,
    },
  ];

  return (
    <div
      className="flex-1 flex flex-col min-h-0 relative"
      style={{ background: "var(--bg-center)" }}
    >
      <StageActionBar
        context={
          <>
            <span
              className="rounded-pill bg-[var(--cykan)] animate-pulse halo-dot"
              style={{ width: "var(--space-2)", height: "var(--space-2)" }}
            />
            <span className="t-11 font-medium text-[var(--cykan)]">
              BROWSER
            </span>
            <span
              className="rounded-pill bg-[var(--text-ghost)]"
              style={{ width: "var(--space-1)", height: "var(--space-1)" }}
            />
            <span className="t-11 font-light text-[var(--text-muted)]">
              {sessionId.slice(0, 8)}
            </span>
            {executing && (
              <span className="t-11 font-medium text-[var(--cykan)]">
                · RUNNING
              </span>
            )}
            {isControlled && (
              <span className="t-11 font-medium text-[var(--warn)]">
                · USER
              </span>
            )}
          </>
        }
        secondary={secondaryActions}
        onBack={back}
      />

      <div className="flex-1 flex min-h-0">
        <div
          className="flex-1 flex flex-col min-h-0"
          style={{ minWidth: 0 }}
        >
          {debugViewerUrl ? (
            <iframe
              src={debugViewerUrl}
              title={`Browserbase live viewer ${sessionId}`}
              className="flex-1 w-full border-0"
              style={{
                pointerEvents: isControlled ? "auto" : "auto",
              }}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex items-center gap-3">
                <span
                  className="rounded-pill bg-[var(--warn)] animate-pulse"
                  style={{ width: "var(--space-2)", height: "var(--space-2)" }}
                  aria-hidden
                />
                <span className="t-11 font-light text-[var(--text-muted)]">
                  Connexion à la session…
                </span>
              </div>
            </div>
          )}
        </div>

        <div
          className="flex-shrink-0"
          style={{ width: "var(--width-context)" }}
        >
          <ActionLog
            actions={actions}
            isControlled={isControlled}
            isRunning={executing}
            onTakeOver={takeOver}
          />
        </div>
      </div>

      {error && (
        <div
          className="flex-shrink-0 px-12 py-3 border-t border-[var(--border-default)]"
          style={{ background: "var(--bg-soft)" }}
        >
          <span className="t-11 font-medium text-[var(--danger)]">
            {error}
          </span>
        </div>
      )}

      <ExtractSchemaModal
        open={extractOpen}
        onClose={() => setExtractOpen(false)}
        onSubmit={submitExtract}
        loading={extractLoading}
      />
    </div>
  );
}
