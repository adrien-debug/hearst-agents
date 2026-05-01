"use client";

import { useMemo, useState } from "react";
import { useRuntimeStore, type StreamEvent } from "@/stores/runtime";
import { toast } from "@/app/hooks/use-toast";

interface ConnectRequest {
  app: string;
  reason: string;
}

/**
 * Inline app-connect card surfaced from a chat turn.
 *
 * Triggered when the planner picks `request_connection` (the user asked
 * something about an app they haven't connected). The card stays visible
 * after the run completes — using `lastRunId` so it survives the idle
 * transition the same way `ChatActionReceipts` does.
 */
function selectLatestConnectRequest(
  events: StreamEvent[],
  runId: string | null,
): ConnectRequest | null {
  if (!runId) return null;
  // Events are stored newest-first; first match for this run is the latest.
  for (const ev of events) {
    if (ev.run_id !== runId) continue;
    if (ev.type === "app_connect_required") {
      const app = String(ev.app ?? "").trim().toLowerCase();
      const reason = String(ev.reason ?? "").trim();
      if (!app) return null;
      return { app, reason };
    }
  }
  return null;
}

export function ChatConnectInline() {
  const events = useRuntimeStore((s) => s.events);
  const lastRunId = useRuntimeStore((s) => s.lastRunId);
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState<{ message: string; code?: string } | null>(null);

  const request = useMemo(
    () => selectLatestConnectRequest(events, lastRunId),
    [events, lastRunId],
  );

  if (!request) return null;

  const handleConnect = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/composio/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          appName: request.app,
          redirectUri: `${window.location.origin}${window.location.pathname}?connected=${encodeURIComponent(request.app)}`,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        redirectUrl?: string;
        error?: string;
        errorCode?: string;
        details?: unknown;
      };
      if (!res.ok || !data.ok) {
        const message = data.error ?? "Erreur Composio";
        console.error(
          `[Composio] Inline connect failed for ${request.app}: code=${data.errorCode} message=${message}`,
          data.details,
        );
        setLastError({ message, code: data.errorCode });
        toast.error(`Connexion ${request.app} impossible`, message);
        if (data.errorCode === "NO_INTEGRATION" || data.errorCode === "AUTH_CONFIG_REQUIRED") {
          window.open(
            `https://app.composio.dev/app/${encodeURIComponent(request.app)}`,
            "_blank",
            "noopener,noreferrer",
          );
        }
        return;
      }
      setLastError(null);
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }
      toast.success(`${request.app} connecté`, "Re-pose ta question pour continuer");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur réseau";
      setLastError({ message });
      toast.error("Connexion impossible", message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="mt-3 border border-[var(--warn)]/40 bg-[var(--warn)]/[0.04] px-4 py-3"
      role="region"
      aria-label="Connexion d'un service requise"
    >
      <div className="flex items-center gap-2 mb-2 t-9 font-medium text-[var(--warn)]">
        <span aria-hidden>🔗</span>
        <span>Connexion requise</span>
        <span className="text-[var(--text-ghost)]">·</span>
        <span className="text-[var(--text-faint)]">{request.app}</span>
      </div>
      <p className="t-13 text-[var(--text-soft)] leading-[1.5] mb-3">{request.reason}</p>

      {lastError && (
        <div className="mb-3 border border-[var(--danger)]/40 bg-[var(--danger)]/[0.06] px-3 py-2 t-11 text-[var(--danger)]">
          <div className="font-medium mb-1">
            {lastError.code === "NO_INTEGRATION"
              ? "Aucune intégration configurée"
              : lastError.code === "AUTH_CONFIG_REQUIRED"
                ? "Auth config manquante"
                : "Échec"}
          </div>
          <div className="text-[var(--text-soft)] leading-[1.45]">{lastError.message}</div>
          <a
            href={`https://app.composio.dev/app/${encodeURIComponent(request.app)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-2 t-9 font-light text-[var(--cykan)] hover:underline"
          >
            Configurer sur app.composio.dev →
          </a>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={handleConnect}
          disabled={busy}
          className="inline-flex items-center gap-2 px-3 py-1.5 t-11 font-medium border border-[var(--warn)] text-[var(--warn)] bg-[var(--warn)]/[0.06] hover:bg-[var(--warn)]/[0.12] transition-colors disabled:opacity-50"
        >
          {busy ? (
            <>
              <span className="w-1 h-1 rounded-pill bg-[var(--warn)] animate-pulse" />
              <span>Redirection…</span>
            </>
          ) : lastError ? (
            <>
              <span>Réessayer</span>
            </>
          ) : (
            <>
              <span>Connecter {request.app}</span>
              <span>→</span>
            </>
          )}
        </button>
        <a
          href={`/api/composio/diagnose?app=${encodeURIComponent(request.app)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="t-9 font-light text-[var(--text-faint)] hover:text-[var(--cykan)]"
          title="Voir le diagnostic Composio (JSON)"
        >
          Diagnostic
        </a>
      </div>
    </div>
  );
}
