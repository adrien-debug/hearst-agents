"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { signIn, useSession } from "next-auth/react";
import { executeReplyMission } from "../../lib/missions";
import { useChatContext } from "../../lib/chat-context";
import MessageDetail from "./MessageDetail";
import InboxSummary from "./InboxSummary";
import type { UnifiedMessage } from "@/lib/connectors/unified-types";
import { gmailToUnifiedMessage, slackToUnifiedMessage } from "@/lib/connectors/unified-types";
import { applyPriorities, sortByPriority } from "@/lib/connectors/priority";

type Tab = "all" | "unread" | "urgent";

function formatDate(ts: number): string {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

const SOURCE_ICON: Record<string, string> = {
  gmail: "✉",
  slack: "💬",
};

function SourceBadge({ provider }: { provider: string }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded bg-zinc-800/50 px-1.5 py-0.5 text-[9px] text-zinc-600">
      {SOURCE_ICON[provider] ?? "●"}
    </span>
  );
}

export default function InboxPage() {
  const { data: session } = useSession();
  const { setSelectedItem } = useChatContext();
  const [messages, setMessages] = useState<UnifiedMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<UnifiedMessage | null>(null);
  const [tab, setTab] = useState<Tab>("all");

  const selectMessage = useCallback((msg: UnifiedMessage | null) => {
    setSelected(msg);
    if (msg) {
      setSelectedItem({
        type: "message",
        id: msg.id,
        title: msg.subject,
        from: msg.from,
        preview: msg.preview,
        provider: msg.source.provider,
      });
    } else {
      setSelectedItem(null);
    }
  }, [setSelectedItem]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoading(true);
      setError(null);

      const fetchGmail = fetch("/api/gmail/messages")
        .then((r) => (r.ok ? r.json() : { emails: [] }))
        .then((data) =>
          Array.isArray(data.emails) ? data.emails.map(gmailToUnifiedMessage) : [],
        )
        .catch(() => [] as UnifiedMessage[]);

      const fetchSlack = fetch("/api/slack/messages")
        .then((r) => (r.ok ? r.json() : { messages: [] }))
        .then((data) =>
          Array.isArray(data.messages) ? data.messages.map(slackToUnifiedMessage) : [],
        )
        .catch(() => [] as UnifiedMessage[]);

      try {
        const [gmail, slack] = await Promise.all([fetchGmail, fetchSlack]);
        if (cancelled) return;
        const combined = applyPriorities([...gmail, ...slack]);
        setMessages(sortByPriority(combined));
      } catch {
        if (!cancelled) {
          setError("Impossible de charger vos messages. Réessayez plus tard.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const unreadCount = messages.filter((m) => !m.read).length;
  const urgentCount = messages.filter((m) => m.priority === "urgent").length;

  const sources = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of messages) {
      const p = m.source.provider;
      map.set(p, (map.get(p) ?? 0) + 1);
    }
    return map;
  }, [messages]);

  const filtered = messages.filter((m) => {
    if (tab === "unread") return !m.read;
    if (tab === "urgent") return m.priority === "urgent";
    return true;
  });

  const handleReplyWithAI = (msg: UnifiedMessage) => {
    executeReplyMission(`reply-ai-${msg.id}-${Date.now()}`, msg.from, msg.subject);
  };

  if (selected) {
    return (
      <MessageDetail
        message={selected}
        onBack={() => selectMessage(null)}
        onReplyWithAI={selected.canReply ? () => handleReplyWithAI(selected) : undefined}
      />
    );
  }

  if (!session) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="border-b border-zinc-800/60 px-6 py-5">
          <h1 className="text-xl font-semibold text-white">Boîte de réception</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Connectez vos comptes pour accéder à vos messages
          </p>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center px-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800/40">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-8 w-8 text-zinc-500">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
          </div>
          <p className="mt-5 text-sm text-zinc-400">Aucun compte connecté</p>
          <p className="mt-1 text-xs text-zinc-600">
            Connectez vos services depuis les Applications
          </p>
          <button
            onClick={() => signIn("google")}
            className="mt-6 flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-white transition-colors hover:bg-zinc-800"
          >
            Connecter un service
          </button>
          <p className="mt-2 text-[10px] text-zinc-600">Lecture seule · Vos messages restent privés</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-zinc-800/60 px-6 py-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-white">Messages</h1>
          <span className="rounded-full bg-emerald-950/40 px-2 py-0.5 text-[9px] font-medium text-emerald-400">
            {sources.size} source{sources.size > 1 ? "s" : ""}
          </span>
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          {loading
            ? "Chargement..."
            : error
              ? "Erreur de chargement"
              : messages.length === 0
                ? "Aucun message"
                : urgentCount > 0
                  ? `${urgentCount} urgent${urgentCount > 1 ? "s" : ""} · ${unreadCount} non lu${unreadCount > 1 ? "s" : ""}`
                  : unreadCount > 0
                    ? `${unreadCount} message${unreadCount > 1 ? "s" : ""} non lu${unreadCount > 1 ? "s" : ""}`
                    : "Tout est à jour"}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Loading */}
        {loading && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-400" />
              <span className="text-sm text-zinc-400">Récupération de vos messages...</span>
            </div>
            <div className="w-full max-w-md space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse rounded-lg border border-zinc-800/60 p-4">
                  <div className="h-3 w-2/3 rounded bg-zinc-800" />
                  <div className="mt-2 h-2 w-1/3 rounded bg-zinc-800/60" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-950/30">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6 text-red-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <p className="text-sm text-zinc-400">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-xs text-zinc-400 transition-colors hover:border-zinc-500 hover:text-white"
            >
              Réessayer
            </button>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800/40">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-8 w-8 text-zinc-500">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
            <p className="text-sm text-zinc-400">Aucun message</p>
            <p className="text-xs text-zinc-600">Vos messages apparaîtront ici</p>
          </div>
        )}

        {/* Message list */}
        {!loading && !error && messages.length > 0 && (
          <>
            {/* Summary */}
            <InboxSummary
              messages={messages}
              onSelectMessage={selectMessage}
              onFilterUrgent={() => setTab("urgent")}
            />

            {/* Tabs */}
            <div className="flex gap-1 border-b border-zinc-800/40 px-6 pt-3">
              {([
                { key: "all" as const, label: "Tous", count: messages.length },
                { key: "urgent" as const, label: "Urgents", count: urgentCount },
                { key: "unread" as const, label: "Non lus", count: unreadCount },
              ]).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-1.5 rounded-t-lg px-4 py-2 text-xs font-medium transition-colors ${
                    tab === t.key
                      ? "bg-zinc-800/60 text-white"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {t.label}
                  {(t.key === "unread" || t.key === "urgent") && t.count > 0 && (
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${
                      tab === t.key ? "bg-zinc-700 text-zinc-300" : "bg-zinc-800/60 text-zinc-600"
                    }`}>
                      {t.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="divide-y divide-zinc-800/30">
              {filtered.map((msg) => (
                <button
                  key={msg.id}
                  onClick={() => selectMessage(msg)}
                  className={`flex w-full items-start gap-3 px-6 py-3.5 text-left transition-colors hover:bg-zinc-900/40 ${
                    msg.priority === "urgent" ? "border-l-2 border-red-500/40" : ""
                  } ${msg.priority === "low" ? "opacity-50" : ""}`}
                >
                  {!msg.read && (
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      msg.priority === "urgent" ? "bg-red-500" : "bg-blue-500"
                    }`} />
                  )}
                  {msg.read && <span className="mt-1.5 h-2 w-2 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className={`truncate text-sm ${msg.read ? "text-zinc-400" : "font-medium text-white"}`}>
                          {msg.from}
                        </p>
                        <SourceBadge provider={msg.source.provider} />
                      </div>
                      <span className="shrink-0 text-[10px] text-zinc-600">
                        {formatDate(msg.timestamp)}
                      </span>
                    </div>
                    <p className={`truncate text-xs ${msg.read ? "text-zinc-500" : "text-zinc-300"}`}>
                      {msg.context ?? msg.subject}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] text-zinc-600">{msg.preview}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Sources footer */}
            <div className="border-t border-zinc-800/40 px-6 py-4">
              <div className="flex items-center gap-2">
                {Array.from(sources.entries()).map(([provider, count]) => (
                  <div key={provider} className="flex items-center gap-2 rounded-lg border border-zinc-800 px-3 py-2">
                    <span className="text-xs">{SOURCE_ICON[provider] ?? "●"}</span>
                    <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[9px] text-zinc-500">
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
