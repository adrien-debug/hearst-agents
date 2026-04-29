"use client";

/**
 * TimelineRail — Rail gauche multi-objet, post-pivot 2026-04-29.
 *
 * Remplace LeftPanel (= "conversations only"). Affiche 4 sections
 * canoniques toujours rendues avec empty states internes :
 *
 *   Now              sessions actives (browser, meeting, voice) +
 *                    missions running (Phase B)
 *   Today            threads + briefings + missions du jour
 *   7 derniers jours threads + assets de la semaine
 *   Archive          lien vers /archive plein écran
 *
 * Click sur une entrée → setActiveThread + setStageMode approprié.
 * Mode collapsed conservé (toggle bottom rail).
 */

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useNavigationStore, type Thread, type Message } from "@/stores/navigation";
import { useStageStore } from "@/stores/stage";
import { HearstLogo } from "./HearstLogo";

// ── Icons ──────────────────────────────────────────────────

const ChatIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const LogoutIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const ChevronLeftIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M9 18l6-6-6-6" />
  </svg>
);

const AdminIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12h4l2-7 4 14 2-7h6" />
  </svg>
);

const ArchiveIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="3" y="4" width="18" height="4" rx="1" />
    <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
    <path d="M10 12h4" />
  </svg>
);

// ── Section helpers ────────────────────────────────────────

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

function groupThreadsByDate(threads: Thread[]): {
  today: Thread[];
  thisWeek: Thread[];
  archive: Thread[];
} {
  const now = Date.now();
  const todayStart = now - ONE_DAY_MS;
  const weekStart = now - SEVEN_DAYS_MS;

  const today: Thread[] = [];
  const thisWeek: Thread[] = [];
  const archive: Thread[] = [];

  for (const t of threads) {
    const ts = t.lastActivity ?? 0;
    if (ts >= todayStart) today.push(t);
    else if (ts >= weekStart) thisWeek.push(t);
    else archive.push(t);
  }

  return { today, thisWeek, archive };
}

function snippetOf(msgs: Message[] | undefined): string | null {
  if (!msgs || msgs.length === 0) return null;
  const text = msgs[msgs.length - 1].content.replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : null;
}

// ── Sub-components ─────────────────────────────────────────

function SectionHeader({ label, count, accent }: { label: string; count: number; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between mt-3 mb-1.5 first:mt-0">
      <span className={`t-9 font-mono tracking-marquee uppercase ${accent ? "text-[var(--cykan)]" : "text-[var(--text-ghost)]"}`}>
        {label}
      </span>
      <span className="t-9 font-mono tracking-display text-[var(--text-ghost)]">
        {count.toString().padStart(2, "0")}
      </span>
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="t-11 font-mono tracking-display text-[var(--text-ghost)] uppercase py-1">
      {children}
    </p>
  );
}

interface ThreadRowProps {
  thread: Thread;
  isActive: boolean;
  snippet: string | null;
  onSelect: () => void;
}

function ThreadRow({ thread, isActive, snippet, onSelect }: ThreadRowProps) {
  return (
    <div
      onClick={onSelect}
      className={`group cursor-pointer py-2 -mx-2 px-2 transition-colors flex flex-col gap-1 ${
        isActive ? "bg-[var(--cykan-bg-active)]" : "hover:bg-[var(--surface-2)]"
      }`}
      style={isActive ? { boxShadow: "var(--shadow-thread-active)" } : undefined}
      title={thread.name}
    >
      <div className="flex items-center gap-3">
        <span
          className={`rounded-pill shrink-0 ${
            isActive ? "bg-[var(--cykan)] halo-cyan-sm" : "bg-[var(--text-ghost)]"
          }`}
          style={{ width: "var(--space-1)", height: "var(--space-1)" }}
        />
        <p
          className={`flex-1 t-13 font-light truncate min-w-0 transition-colors ${
            isActive ? "text-[var(--text)]" : "text-[var(--text-inactive)] group-hover:text-[var(--text)]"
          }`}
          style={{ lineHeight: "var(--leading-base)" }}
        >
          {thread.name}
        </p>
      </div>
      {snippet && (
        <p
          className={`t-11 font-light truncate min-w-0 ${
            isActive ? "text-[var(--text-muted)]" : "text-[var(--text-faint)]"
          }`}
          style={{ paddingLeft: "var(--space-4)", lineHeight: "var(--leading-base)" }}
        >
          {snippet}
        </p>
      )}
    </div>
  );
}

interface CollapsedTileProps {
  thread: Thread;
  isActive: boolean;
  onSelect: () => void;
}

function CollapsedTile({ thread, isActive, onSelect }: CollapsedTileProps) {
  const initial = thread.name.trim().charAt(0).toUpperCase() || "·";
  return (
    <button
      onClick={onSelect}
      title={thread.name}
      className={`relative w-8 h-8 flex items-center justify-center rounded-sm t-13 font-medium transition-all shrink-0 ${
        isActive
          ? "bg-[var(--cykan)] text-[var(--bg)] halo-cyan-sm"
          : "bg-[var(--surface-1)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
      }`}
    >
      {initial}
    </button>
  );
}

// ── Main component ────────────────────────────────────────

export function TimelineRail() {
  const { data: session } = useSession();
  const router = useRouter();
  const {
    threads,
    activeThreadId,
    setActiveThread,
    addThread,
    leftCollapsed,
    toggleLeftCollapsed,
    messages,
  } = useNavigationStore();
  const setStageMode = useStageStore((s) => s.setMode);
  const firstName = session?.user?.name?.split(" ")[0] || "Utilisateur";
  const userInitial = firstName.charAt(0).toUpperCase();

  const sectionPadX = leftCollapsed ? "pl-6 pr-2" : "px-6";

  const groups = useMemo(() => groupThreadsByDate(threads), [threads]);

  const handleThreadSelect = (threadId: string) => {
    setActiveThread(threadId);
    setStageMode({ mode: "chat", threadId });
  };

  const handleNewThread = () => {
    const id = addThread("New", "home");
    setStageMode({ mode: "chat", threadId: id });
  };

  return (
    <aside
      className="h-full flex flex-col z-20 relative border-r border-[var(--border-shell)] transition-[width] duration-slow ease-out-soft"
      style={{
        width: leftCollapsed ? "var(--width-threads-collapsed)" : "var(--width-threads)",
        background: "var(--bg-rail)",
      }}
    >
      {/* Logo */}
      <div className="shrink-0 border-b border-[var(--border-shell)] flex items-center justify-center pb-1 px-2">
        <button
          onClick={() => {
            router.push("/");
            setStageMode({ mode: "cockpit" });
          }}
          className="flex items-center justify-center hover:opacity-80 transition-opacity"
          title="Hearst — Cockpit"
        >
          {leftCollapsed ? (
            <span className="t-28 font-medium tracking-tight text-[var(--cykan)] halo-cyan-sm leading-none">H</span>
          ) : (
            <HearstLogo className="w-32 h-32 object-contain transition-all duration-slow" />
          )}
        </button>
      </div>

      {/* Timeline — 4 sections always rendered */}
      <div className={`flex-1 flex flex-col min-h-0 pt-7 pb-6 ${sectionPadX}`}>
        {leftCollapsed ? (
          <button
            onClick={handleNewThread}
            className="halo-on-hover mb-4 w-8 h-8 flex items-center justify-center rounded-sm border border-dashed border-[var(--surface-2)] text-[var(--text-faint)] hover:text-[var(--cykan)] hover:border-[var(--line-active)] transition-all shrink-0"
            title="Nouvelle conversation"
          >
            <PlusIcon />
          </button>
        ) : (
          <button
            onClick={handleNewThread}
            className="halo-on-hover w-full flex items-center justify-between mb-4 group/header text-[var(--text-faint)] hover:text-[var(--cykan)] transition-colors"
            title="Nouvelle conversation"
          >
            <span className="flex items-center gap-2">
              <ChatIcon />
              <span className="t-9 font-mono tracking-marquee uppercase">Timeline</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="t-9 font-mono tracking-display">{threads.length}</span>
              <span className="t-9 font-mono opacity-0 group-hover/header:opacity-100 -translate-x-1 group-hover/header:translate-x-0 transition-all">
                +
              </span>
            </span>
          </button>
        )}

        {leftCollapsed ? (
          <div className="overflow-y-auto scrollbar-hide flex-1 flex flex-col items-center gap-2">
            {threads.slice(0, 12).map((t) => (
              <CollapsedTile
                key={t.id}
                thread={t}
                isActive={t.id === activeThreadId}
                onSelect={() => handleThreadSelect(t.id)}
              />
            ))}
          </div>
        ) : (
          <div className="overflow-y-auto scrollbar-hide flex-1">
            {/* Now — sessions actives (Phase B) */}
            <SectionHeader label="Now" count={0} accent />
            <EmptyHint>Aucune session active</EmptyHint>

            {/* Today */}
            <SectionHeader label="Today" count={groups.today.length} />
            {groups.today.length === 0 ? (
              <EmptyHint>{"Aucune activité aujourd'hui"}</EmptyHint>
            ) : (
              <div className="space-y-px">
                {groups.today.map((t) => (
                  <ThreadRow
                    key={t.id}
                    thread={t}
                    isActive={t.id === activeThreadId}
                    snippet={snippetOf(messages[t.id])}
                    onSelect={() => handleThreadSelect(t.id)}
                  />
                ))}
              </div>
            )}

            {/* This week (J-1 → J-7) */}
            <SectionHeader label="7 derniers jours" count={groups.thisWeek.length} />
            {groups.thisWeek.length === 0 ? (
              <EmptyHint>Aucune activité cette semaine</EmptyHint>
            ) : (
              <div className="space-y-px">
                {groups.thisWeek.map((t) => (
                  <ThreadRow
                    key={t.id}
                    thread={t}
                    isActive={t.id === activeThreadId}
                    snippet={snippetOf(messages[t.id])}
                    onSelect={() => handleThreadSelect(t.id)}
                  />
                ))}
              </div>
            )}

            {/* Archive — link vers /archive */}
            <SectionHeader label="Archive" count={groups.archive.length} />
            <Link
              href="/archive"
              className="halo-on-hover group flex items-center gap-2 py-2 -mx-2 px-2 text-[var(--text-faint)] hover:text-[var(--cykan)] transition-colors"
            >
              <ArchiveIcon />
              <span className="t-13 font-light flex-1">
                {groups.archive.length > 0 ? "Voir l'historique" : "Vide pour l'instant"}
              </span>
              <span className="t-9 font-mono opacity-0 group-hover:opacity-100 transition-opacity">→</span>
            </Link>
          </div>
        )}
      </div>

      {/* Footer profil + admin + toggle */}
      <div className={`shrink-0 border-t border-[var(--border-shell)] flex flex-col gap-1 pt-4 pb-5 ${sectionPadX}`}>
        {leftCollapsed ? (
          <Link
            href="/admin"
            title="Console admin"
            className="w-8 h-8 flex items-center justify-center rounded-sm bg-[var(--surface-1)] text-[var(--text-faint)] hover:text-[var(--cykan)] hover:bg-[var(--cykan-bg-active)] transition-colors shrink-0"
          >
            <AdminIcon />
          </Link>
        ) : (
          <Link
            href="/admin"
            title="Console admin"
            className="group cursor-pointer w-full flex items-center gap-3 py-2 -mx-2 px-2 hover:bg-[var(--surface-1)] transition-colors"
          >
            <span className="text-[var(--text-faint)] group-hover:text-[var(--cykan)] transition-colors shrink-0">
              <AdminIcon />
            </span>
            <span className="flex-1 t-13 font-light truncate text-[var(--text-muted)] group-hover:text-[var(--text)] transition-colors">
              Console admin
            </span>
          </Link>
        )}

        {leftCollapsed ? (
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            title={`${firstName} — Se déconnecter`}
            className="w-8 h-8 flex items-center justify-center rounded-sm bg-[var(--surface-1)] t-13 font-medium text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--danger)] transition-colors shrink-0"
          >
            {userInitial}
          </button>
        ) : (
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            title="Se déconnecter"
            className="group cursor-pointer w-full flex items-center gap-3 py-2 -mx-2 px-2 hover:bg-[var(--surface-1)] transition-colors"
          >
            <span className="text-[var(--text-faint)] group-hover:text-[var(--danger)] transition-colors shrink-0">
              <LogoutIcon />
            </span>
            <span className="flex-1 t-13 font-light truncate text-[var(--text-muted)] group-hover:text-[var(--danger)] transition-colors">
              {firstName}
            </span>
          </button>
        )}

        <button
          onClick={toggleLeftCollapsed}
          title={leftCollapsed ? "Étendre" : "Réduire"}
          className={`flex items-center text-[var(--text-ghost)] hover:text-[var(--cykan)] transition-colors ${
            leftCollapsed ? "w-8 h-6 justify-center" : "w-full py-2 justify-center"
          }`}
        >
          {leftCollapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
        </button>
      </div>
    </aside>
  );
}
