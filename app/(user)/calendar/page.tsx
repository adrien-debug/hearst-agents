"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import type { UnifiedEvent } from "@/lib/connectors/unified-types";
import { calendarToUnifiedEvent } from "@/lib/connectors/unified-types";

function formatTime(iso: string, allDay: boolean): string {
  if (allDay) return "Journée entière";
  try {
    return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
    if (d.toDateString() === tomorrow.toDateString()) return "Demain";
    return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  } catch {
    return iso;
  }
}

export default function CalendarPage() {
  const { data: session } = useSession();
  const [events, setEvents] = useState<UnifiedEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoading(true);
      setError(null);
      try {
        const r = await fetch("/api/calendar/events");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (cancelled) return;
        if (data.events && Array.isArray(data.events)) {
          setEvents(data.events.map(calendarToUnifiedEvent));
        }
      } catch (err) {
        if (cancelled) return;
        console.error("[Calendar] Fetch failed:", err);
        setError("Impossible de charger votre agenda. Réessayez plus tard.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  if (!session) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="border-b border-zinc-800/60 px-6 py-5">
          <h1 className="text-xl font-semibold text-white">Agenda</h1>
          <p className="mt-1 text-sm text-white/50">Connectez votre compte pour voir vos événements</p>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center px-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800/40">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-8 w-8 text-white/50">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
          </div>
          <p className="mt-5 text-sm text-white/70">Aucun calendrier connecté</p>
          <p className="mt-1 text-xs text-white/50">Connectez un service depuis les Applications.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="border-b border-zinc-800/60 px-6 py-5">
          <h1 className="text-xl font-semibold text-white">Agenda</h1>
          <p className="mt-1 text-sm text-white/50">Chargement...</p>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-400" />
            <span className="text-sm text-white/70">Récupération de vos événements...</span>
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
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="border-b border-zinc-800/60 px-6 py-5">
          <h1 className="text-xl font-semibold text-white">Agenda</h1>
          <p className="mt-1 text-sm text-white/50">Erreur de chargement</p>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-950/30">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6 text-red-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <p className="text-sm text-white/70">{error}</p>
          <button onClick={() => window.location.reload()} className="rounded-lg border border-zinc-700 px-4 py-2 text-xs text-white/70 transition-colors hover:border-zinc-500 hover:text-white">
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="border-b border-zinc-800/60 px-6 py-5">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-white">Agenda</h1>
            <span className="rounded-full bg-emerald-950/40 px-2 py-0.5 text-[9px] font-medium text-emerald-400">Connecté</span>
          </div>
          <p className="mt-1 text-sm text-white/50">Aucun événement à venir</p>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center px-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800/40">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-8 w-8 text-white/50">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
          </div>
          <p className="mt-5 text-sm text-white/70">Votre agenda est libre cette semaine</p>
        </div>
      </div>
    );
  }

  const grouped = events.reduce<Record<string, UnifiedEvent[]>>((acc, ev) => {
    const key = formatDate(ev.start);
    (acc[key] ??= []).push(ev);
    return acc;
  }, {});

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-zinc-800/60 px-6 py-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-white">Agenda</h1>
          <span className="rounded-full bg-emerald-950/40 px-2 py-0.5 text-[9px] font-medium text-emerald-400">Connecté</span>
        </div>
        <p className="mt-1 text-sm text-white/50">
          {events.length} événement{events.length > 1 ? "s" : ""} à venir
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {Object.entries(grouped).map(([date, evts]) => (
          <div key={date} className="border-b border-zinc-800/40 px-6 py-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/50">{date}</h2>
            <div className="space-y-2">
              {evts.map((ev) => (
                <div key={ev.id} className="flex items-center gap-3 rounded-lg border border-zinc-800/50 bg-zinc-900/40 px-4 py-3 transition-colors duration-200 hover:bg-zinc-800/50">
                  <div className="flex flex-col items-center">
                    <span className="text-sm font-medium text-white">{formatTime(ev.start, ev.allDay)}</span>
                  </div>
                  <div className="h-8 w-px bg-zinc-800" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white">{ev.title}</p>
                    {ev.location && <p className="mt-0.5 truncate text-[10px] text-white/50">{ev.location}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
