"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useConnectedServices } from "../hooks/use-connected-services";

interface DashboardData {
  messages: { total: number; urgent: number; unread: number } | null;
  events: { total: number; next?: string } | null;
  files: { total: number; shared: number } | null;
}

function greetingText(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

function todayDate(): string {
  return new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function ServiceDot({ connected, pulse }: { connected: boolean; pulse?: boolean }) {
  if (!connected) {
    return <span className="h-1.5 w-1.5 rounded-full bg-zinc-800" />;
  }
  if (pulse) {
    return (
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
      </span>
    );
  }
  return <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />;
}

const SERVICES = [
  { id: "google", label: "Messages" },
  { id: "google", label: "Agenda" },
  { id: "google", label: "Documents" },
  { id: "slack", label: "Slack" },
];

export default function HomePage() {
  const { data: session } = useSession();
  const { isConnected, loading: servicesLoading } = useConnectedServices();
  const router = useRouter();
  const [data, setData] = useState<DashboardData>({ messages: null, events: null, files: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      if (!session) {
        setLoading(false);
        return;
      }

      setLoading(true);

      const fetchMessages = fetch("/api/gmail/messages")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d?.emails) return null;
          const emails = d.emails as Array<{ labelIds?: string[] }>;
          return {
            total: emails.length,
            urgent: 0,
            unread: emails.filter((e) => e.labelIds?.includes("UNREAD")).length,
          };
        })
        .catch(() => null);

      const fetchEvents = fetch("/api/calendar/events")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d?.events) return null;
          const evts = d.events as Array<{ summary?: string; start?: { dateTime?: string } }>;
          const today = new Date().toDateString();
          const todayEvents = evts.filter((e) => {
            const start = e.start?.dateTime;
            return start && new Date(start).toDateString() === today;
          });
          const nextEvent = todayEvents[0];
          return {
            total: todayEvents.length,
            next: nextEvent?.start?.dateTime
              ? `${new Date(nextEvent.start.dateTime).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} ${nextEvent.summary ?? ""}`
              : undefined,
          };
        })
        .catch(() => null);

      const fetchFiles = fetch("/api/files/list")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d?.files) return null;
          const files = d.files as Array<{ shared?: boolean }>;
          return {
            total: files.length,
            shared: files.filter((f) => f.shared).length,
          };
        })
        .catch(() => null);

      try {
        const [messages, events, files] = await Promise.all([fetchMessages, fetchEvents, fetchFiles]);
        if (!cancelled) setData({ messages, events, files });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const hasAnyService = isConnected("google") || isConnected("slack");
  const urgentTotal = data.messages?.urgent ?? 0;
  const unreadTotal = data.messages?.unread ?? 0;
  const eventsToday = data.events?.total ?? 0;

  let insight: string | null = null;
  if (urgentTotal > 0) insight = `${urgentTotal} élément${urgentTotal > 1 ? "s" : ""} urgent${urgentTotal > 1 ? "s" : ""} nécessite${urgentTotal > 1 ? "nt" : ""} votre attention`;
  else if (unreadTotal > 5) insight = `${unreadTotal} messages non lus à traiter`;
  else if (eventsToday >= 3) insight = "Votre journée est chargée — préparez-vous";
  else if (hasAnyService && !loading) insight = "Tout est sous contrôle";

  return (
    <div className="flex h-full flex-col bg-zinc-950 px-8 pt-12">
      {/* Top Container - Max width for perfect centering */}
      <div className="mx-auto w-full max-w-5xl">
        
        {/* HERO BLOCK : Greeting + Insight/Action */}
        <div className="mb-10 flex flex-col items-start justify-between gap-6 md:flex-row md:items-end animate-in fade-in slide-in-from-top-4 duration-1000">
          <div>
            <div className="mb-4 flex items-center gap-3">
              {!servicesLoading && SERVICES.map((s, i) => (
                <div key={i} className="flex items-center gap-1.5" title={s.label}>
                  <ServiceDot connected={isConnected(s.id)} pulse={isConnected(s.id)} />
                  <span className="text-[9px] font-medium uppercase tracking-widest text-zinc-500">
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
            <h1 className="text-4xl font-light tracking-tight text-white sm:text-5xl">
              {greetingText()}
            </h1>
            <p className="mt-3 text-sm text-zinc-400">{todayDate()}</p>
          </div>

          {/* Insight Pill */}
          {!loading && insight && (
            <div className="flex items-center gap-5 rounded-full border border-zinc-800/60 bg-zinc-900/40 py-2 pl-5 pr-2 shadow-sm backdrop-blur-md">
              <div className="flex items-center gap-3">
                {urgentTotal > 0 ? (
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
                  </span>
                ) : (
                  <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                )}
                <span className="text-sm font-medium text-zinc-300">{insight}</span>
              </div>
              <button
                onClick={() => triggerChat("Que dois-je traiter en priorité ?")}
                className="rounded-full bg-white px-5 py-2 text-xs font-semibold text-zinc-950 transition-all duration-300 hover:scale-105 hover:shadow-[0_0_20px_rgba(255,255,255,0.15)] active:scale-95"
              >
                Agir
              </button>
            </div>
          )}
        </div>

        {/* SUMMARY CARDS ROW (4 columns) */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 animate-in fade-in slide-in-from-bottom-6 duration-1000 delay-200 fill-mode-both">
          {/* Messages */}
          <SummaryCard
            title="Messages"
            loading={loading}
            empty={!data.messages}
            stats={
              data.messages
                ? [
                    { value: data.messages.total, label: "messages" },
                    ...(data.messages.urgent > 0
                      ? [{ value: data.messages.urgent, label: "urgents", accent: true as const }]
                      : []),
                    ...(data.messages.unread > 0
                      ? [{ value: data.messages.unread, label: "non lus" }]
                      : []),
                  ]
                : []
            }
            actions={[
              { label: "Voir", onClick: () => router.push("/inbox"), primary: true },
              { label: "Résumer", onClick: () => triggerChat("Résume mes messages") },
            ]}
          />

          {/* Agenda */}
          <SummaryCard
            title="Agenda"
            loading={loading}
            empty={!data.events}
            stats={
              data.events
                ? [
                    {
                      value: data.events.total,
                      label: `événement${data.events.total > 1 ? "s" : ""}`,
                    },
                  ]
                : []
            }
            detail={data.events?.next ? `Prochain : ${data.events.next}` : undefined}
            actions={[
              { label: "Voir", onClick: () => router.push("/calendar"), primary: true },
              { label: "Préparer", onClick: () => triggerChat("Prépare ma journée") },
            ]}
          />

          {/* Documents */}
          <SummaryCard
            title="Documents"
            loading={loading}
            empty={!data.files}
            stats={
              data.files
                ? [
                    { value: data.files.total, label: "fichiers" },
                    ...(data.files.shared > 0
                      ? [{ value: data.files.shared, label: "partagés" }]
                      : []),
                  ]
                : []
            }
            actions={[
              { label: "Voir", onClick: () => router.push("/files"), primary: true },
              { label: "Analyser", onClick: () => triggerChat("Analyse mes fichiers récents") },
            ]}
          />

          {/* Tâches */}
          <SummaryCard
            title="Tâches"
            loading={loading}
            empty
            stats={[]}
            emptyLabel="Bientôt disponible"
            actions={[]}
          />
        </div>
      </div>
    </div>
  );
}

function triggerChat(message: string) {
  const input = document.querySelector<HTMLTextAreaElement>("textarea[placeholder]");
  if (input) {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    )?.set;
    nativeSetter?.call(input, message);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const form = input.closest("form");
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }
}

interface StatItem {
  value: number;
  label: string;
  accent?: true;
}

function SummaryCard({
  title,
  loading,
  empty,
  stats,
  detail,
  actions,
  emptyLabel,
}: {
  title: string;
  loading: boolean;
  empty: boolean;
  stats: StatItem[];
  detail?: string;
  actions: Array<{ label: string; onClick: () => void; primary?: boolean }>;
  emptyLabel?: string;
}) {
  return (
    <div className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-zinc-800/40 bg-gradient-to-b from-zinc-900/40 to-zinc-900/10 p-5 shadow-sm transition-all duration-500 hover:-translate-y-1 hover:border-zinc-700/50 hover:shadow-xl hover:shadow-black/40">
      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          {title}
        </h3>

        {loading ? (
          <div className="mt-4 space-y-3">
            <div className="h-8 w-1/2 animate-pulse rounded bg-zinc-800/60" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-zinc-800/40" />
          </div>
        ) : empty ? (
          <p className="mt-4 text-xs text-zinc-600">{emptyLabel ?? "Non connecté"}</p>
        ) : (
          <div className="mt-4">
            <div className="flex items-baseline gap-2">
              <span
                className={`text-4xl font-light tracking-tight ${
                  stats[0]?.accent ? "text-red-400" : "text-white"
                }`}
              >
                {stats[0]?.value ?? 0}
              </span>
              <span className="text-xs font-medium text-zinc-500">{stats[0]?.label}</span>
            </div>
            {stats.length > 1 && (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                {stats.slice(1).map((s, i) => (
                  <span key={i} className={s.accent ? "text-red-400" : "text-zinc-400"}>
                    {s.value} {s.label}
                  </span>
                ))}
              </div>
            )}
            {detail && <p className="mt-2 truncate text-[11px] text-zinc-500">{detail}</p>}
          </div>
        )}
      </div>

      {actions.length > 0 && !loading && !empty && (
        <div className="mt-6 flex gap-2.5">
          {actions.map((a) => (
            <button
              key={a.label}
              onClick={a.onClick}
              className={`flex-1 rounded-lg px-3 py-2 text-[11px] font-medium transition-all duration-300 ${
                a.primary
                  ? "bg-zinc-100 text-zinc-900 hover:bg-white hover:shadow-md"
                  : "bg-zinc-800/50 text-zinc-300 hover:bg-zinc-700 hover:text-white"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
