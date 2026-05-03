"use client";

/**
 * MissionConversation — section "Reprendre la conversation" (vague 9).
 *
 * Affiche, sous les "Derniers runs" du MissionStage :
 *  - Le résumé éditorial 4 sections (contextSummary)
 *  - Les N derniers messages user/assistant attachés à la mission
 *  - Un textarea pour écrire un message → persiste + relance la mission
 *
 * On garde l'UX volontairement simple : pas de SSE temps-réel ici (le run
 * complet se déroule côté MissionStage actionBar). Cette section sert au
 * fil long-terme — le user pose une question, lance, voit le résultat
 * apparaître au refresh suivant.
 *
 * Tokens design system uniquement (cf. CLAUDE.md §1).
 */

import { useCallback, useEffect, useState } from "react";
import type { MissionMessage } from "@/lib/memory/mission-context";

interface MissionContextDto {
  summary: string | null;
  summaryUpdatedAt: number | null;
  recentMessages: MissionMessage[];
  retrievedMemory: string;
  kgSnippet: string | null;
  generatedAt: number;
}

interface MissionConversationProps {
  missionId: string;
  /** Callback appelé après qu'un nouveau run a été déclenché (refresh runs). */
  onRunTriggered?: () => void;
}

const MSG_TIME_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

export function MissionConversation({
  missionId,
  onRunTriggered,
}: MissionConversationProps) {
  const [context, setContext] = useState<MissionContextDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/v2/missions/${missionId}/context`, {
        credentials: "include",
      });
      if (!res.ok) {
        setContext(null);
        return;
      }
      const data = (await res.json()) as { context: MissionContextDto };
      setContext(data.context);
    } catch {
      setContext(null);
    } finally {
      setLoading(false);
    }
  }, [missionId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/v2/missions/${missionId}/context`, {
        credentials: "include",
      }).catch(() => null);
      if (cancelled) return;
      if (res && res.ok) {
        const data = (await res.json()) as { context: MissionContextDto };
        if (!cancelled) setContext(data.context);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [missionId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = draft.trim();
    if (!content || submitting) return;

    setSubmitting(true);

    // Optimistic UI : append local le user message
    const optimistic: MissionMessage = {
      id: `pending-${Date.now()}`,
      missionId,
      userId: "self",
      tenantId: null,
      role: "user",
      content,
      runId: null,
      createdAt: Date.now(),
      metadata: { pending: true },
    };
    setContext((prev) =>
      prev
        ? { ...prev, recentMessages: [...prev.recentMessages, optimistic] }
        : prev,
    );
    setDraft("");

    try {
      // 1. Persiste le message
      await fetch(`/api/v2/missions/${missionId}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      // 2. Déclenche un run (le run charge le contexte + génère une réponse)
      await fetch(`/api/v2/missions/${missionId}/run`, {
        method: "POST",
        credentials: "include",
      });

      onRunTriggered?.();

      // 3. Recharge le contexte (récupère la réponse assistant + summary actualisé)
      await refetch();
    } catch (err) {
      console.warn("[MissionConversation] submit failed:", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      className="border-t border-[var(--border-default)]"
      style={{ marginTop: "var(--space-12)", paddingTop: "var(--space-8)" }}
    >
      <header
        className="flex items-baseline justify-between"
        style={{ marginBottom: "var(--space-6)" }}
      >
        <p className="t-11 font-light" style={{ color: "var(--text-l2)" }}>
          Conversation
        </p>
        {context?.summaryUpdatedAt && (
          <span className="t-9 font-light text-[var(--text-faint)]">
            Mis à jour {MSG_TIME_FMT.format(new Date(context.summaryUpdatedAt))}
          </span>
        )}
      </header>

      {/* Résumé contextuel (4 sections markdown du contextSummary) */}
      {context?.summary && context.summary.trim().length > 0 && (
        <div
          style={{
            marginBottom: "var(--space-8)",
            padding: "var(--space-5) var(--space-6)",
            background: "var(--bg-soft)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-shell)",
          }}
        >
          <SummaryRendered text={context.summary} />
        </div>
      )}

      {/* Liste messages */}
      {loading ? (
        <p className="t-11 font-light text-[var(--text-faint)]">Chargement…</p>
      ) : context && context.recentMessages.length > 0 ? (
        <ul
          className="flex flex-col"
          style={{ gap: "var(--space-4)", marginBottom: "var(--space-8)" }}
        >
          {context.recentMessages.map((m) => (
            <MessageRow key={m.id} message={m} />
          ))}
        </ul>
      ) : (
        <p
          className="t-11 font-light text-[var(--text-faint)]"
          style={{ marginBottom: "var(--space-6)" }}
        >
          Aucun échange enregistré. Pose une question pour démarrer le fil.
        </p>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex flex-col" style={{ gap: "var(--space-3)" }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Continuer la conversation… (la mission se relancera avec ce contexte)"
          rows={3}
          disabled={submitting}
          className="t-13 font-light w-full resize-none"
          style={{
            padding: "var(--space-4) var(--space-5)",
            background: "var(--bg-elev)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-md)",
            color: "var(--text-l1)",
            outline: "none",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              void handleSubmit(e as unknown as React.FormEvent);
            }
          }}
        />
        <div className="flex items-center justify-between">
          <span className="t-9 font-light text-[var(--text-faint)]">
            ⌘ + Entrée pour envoyer
          </span>
          <button
            type="submit"
            disabled={submitting || draft.trim().length === 0}
            className="t-11 font-medium transition-opacity"
            style={{
              padding: "var(--space-2) var(--space-5)",
              borderRadius: "var(--radius-pill)",
              background:
                submitting || draft.trim().length === 0
                  ? "var(--bg-soft)"
                  : "var(--cykan)",
              color:
                submitting || draft.trim().length === 0
                  ? "var(--text-faint)"
                  : "var(--bg)",
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? "En cours…" : "Envoyer & relancer"}
          </button>
        </div>
      </form>
    </section>
  );
}

function MessageRow({ message }: { message: MissionMessage }) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const label = isUser ? "Toi" : isAssistant ? "Hearst" : "Système";
  const labelColor = isUser
    ? "var(--text-l2)"
    : isAssistant
      ? "var(--cykan)"
      : "var(--text-faint)";

  return (
    <li
      className="flex flex-col"
      style={{
        gap: "var(--space-1)",
        paddingBottom: "var(--space-3)",
        borderBottom: "1px solid var(--border-shell)",
        opacity: message.metadata?.pending ? 0.6 : 1,
      }}
    >
      <div
        className="flex items-baseline"
        style={{ gap: "var(--space-3)" }}
      >
        <span
          className="t-11 font-medium"
          style={{ color: labelColor }}
        >
          {label}
        </span>
        <span className="t-9 font-light text-[var(--text-faint)]">
          {MSG_TIME_FMT.format(new Date(message.createdAt))}
        </span>
      </div>
      <p
        className="t-13 font-light"
        style={{
          color: "var(--text-l1)",
          whiteSpace: "pre-wrap",
          lineHeight: 1.55,
        }}
      >
        {message.content}
      </p>
    </li>
  );
}

/**
 * Rend le contextSummary en respectant la structure markdown 4 sections
 * (Objectif / État actuel / Décisions actées / Prochaine étape).
 * On garde un rendu simple : on coupe en blocs sur les `**Title.**` et on
 * affiche chaque bloc en stack vertical. Pas de markdown parser pour MVP.
 */
function SummaryRendered({ text }: { text: string }) {
  // Sépare en blocs `**Title.** body…` via regex
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  return (
    <div className="flex flex-col" style={{ gap: "var(--space-3)" }}>
      {blocks.map((block, i) => {
        const match = block.match(/^\*\*([^*]+?)\.\*\*\s*([\s\S]*)$/);
        if (match) {
          const [, title, body] = match;
          return (
            <div key={i} className="flex flex-col" style={{ gap: "var(--space-1)" }}>
              <span
                className="t-9 font-medium"
                style={{ color: "var(--text-l2)" }}
              >
                {title}
              </span>
              <p
                className="t-13 font-light"
                style={{
                  color: "var(--text-l1)",
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.5,
                }}
              >
                {body}
              </p>
            </div>
          );
        }
        return (
          <p
            key={i}
            className="t-13 font-light"
            style={{
              color: "var(--text-l1)",
              whiteSpace: "pre-wrap",
              lineHeight: 1.5,
            }}
          >
            {block}
          </p>
        );
      })}
    </div>
  );
}
