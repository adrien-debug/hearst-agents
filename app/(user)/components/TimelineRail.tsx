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
import { useNavigationStore, type Thread } from "@/stores/navigation";
import { useStageStore } from "@/stores/stage";
import { HearstLogo } from "./HearstLogo";

// ── Icons ──────────────────────────────────────────────────

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
const BoltIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const WrenchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 1 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
);

const PhoneIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="2" width="14" height="20" rx="2.18" ry="2.18" />
    <line x1="12" y1="19" x2="12.01" y2="19" />
  </svg>
);

const ChartIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
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
    if (t.archived) {
      archive.push(t);
      continue;
    }
    const ts = t.lastActivity ?? 0;
    if (ts >= todayStart) today.push(t);
    else if (ts >= weekStart) thisWeek.push(t);
    else archive.push(t);
  }

  return { today, thisWeek, archive };
}

// ── Sub-components ─────────────────────────────────────────

function SectionHeader({
  label,
  action,
}: {
  label: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between first:mt-0 mt-6 mb-2 px-3">
      <span className="t-12 font-semibold text-[rgba(255,255,255,0.9)]">{label}</span>
      <span className="flex items-center gap-2">
        {action}
      </span>
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="t-12 text-[rgba(255,255,255,0.4)] pl-3 py-2 font-light">
      {children}
    </p>
  );
}

interface ThreadRowProps {
  thread: Thread;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onArchive: () => void;
}

function ThreadRow({ thread, isActive, onSelect, onDelete, onArchive }: ThreadRowProps) {
  const isArchived = thread.archived === true;
  return (
    <div
      onClick={onSelect}
      className={`group cursor-pointer py-2 px-3 transition-all duration-300 flex items-center gap-3 rounded-md ${
        isActive ? "bg-[rgba(255,255,255,0.08)]" : "hover:bg-[rgba(255,255,255,0.04)]"
      }`}
      title={thread.name}
    >
      <p
        className={`flex-1 t-14 truncate min-w-0 transition-colors duration-300 ${
          isActive
            ? "text-[rgba(255,255,255,1)] font-medium"
            : "text-[rgba(255,255,255,0.7)] font-light group-hover:text-[rgba(255,255,255,0.9)]"
        }`}
        style={{ lineHeight: "var(--leading-base)" }}
      >
        {thread.name}
      </p>
      <div
        className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 shrink-0 flex items-center gap-1"
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onArchive();
          }}
          className="text-[rgba(255,255,255,0.4)] hover:text-[rgba(255,255,255,0.9)] p-1 transition-colors"
          title={isArchived ? "Désarchiver" : "Archiver"}
          aria-label={isArchived ? "Désarchiver le thread" : "Archiver le thread"}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="4" rx="1" />
            <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
            <path d="M10 12h4" />
          </svg>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`Supprimer "${thread.name}" ?`)) onDelete();
          }}
          className="text-[rgba(255,255,255,0.4)] hover:text-[var(--danger)] p-1 transition-colors"
          title="Supprimer"
          aria-label="Supprimer le thread"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
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
      className={`relative w-8 h-8 flex items-center justify-center rounded-md t-13 font-light transition-all duration-300 shrink-0 ${
        isActive
          ? "bg-[rgba(45,212,191,0.1)] text-[var(--cykan)] border border-[rgba(45,212,191,0.3)] shadow-[0_0_15px_rgba(45,212,191,0.15)]"
          : "bg-[rgba(255,255,255,0.02)] text-[rgba(255,255,255,0.4)] border border-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[rgba(255,255,255,0.9)] hover:border-[rgba(255,255,255,0.1)]"
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
    removeThread,
    toggleArchived,
    leftCollapsed,
    toggleLeftCollapsed,
  } = useNavigationStore();
  const setStageMode = useStageStore((s) => s.setMode);
  const firstName = session?.user?.name?.split(" ")[0] || "Utilisateur";
  const userInitial = firstName.charAt(0).toUpperCase();

  const sectionPadX = leftCollapsed ? "pl-6 pr-2" : "px-8";

  const groups = useMemo(() => groupThreadsByDate(threads), [threads]);

  const handleThreadSelect = (threadId: string) => {
    setActiveThread(threadId);
    setStageMode({ mode: "chat", threadId });
  };

  const handleThreadDelete = (threadId: string) => {
    if (threadId === activeThreadId) setActiveThread(null);
    removeThread(threadId);
  };

  const handleNewThread = () => {
    const id = addThread("New", "home");
    setStageMode({ mode: "chat", threadId: id });
  };

  return (
    <aside
      className="h-full flex flex-col z-20 relative transition-[width] duration-slow ease-out-soft rounded-2xl overflow-hidden"
      style={{
        width: leftCollapsed ? "var(--width-threads-collapsed)" : "var(--width-threads)",
        background: "rgba(255,255,255,0.02)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04)",
      }}
    >
      {/* Logo */}
      <div
        className="shrink-0 flex items-center justify-center pt-8 pb-8 px-8"
        style={{
          boxShadow: "inset 0 -1px 0 0 rgba(255,255,255,0.02)",
        }}
      >
        <button
          onClick={() => {
            router.push("/");
            setStageMode({ mode: "chat" });
          }}
          className="flex items-center justify-center hover:opacity-80 transition-opacity"
          title="Hearst — Chat"
        >
          {leftCollapsed ? (
            <span className="t-15 font-medium tracking-tight text-[var(--cykan)] halo-cyan-sm leading-none">H</span>
          ) : (
            <HearstLogo className="h-10 w-auto transition-all duration-slow" />
          )}
        </button>
      </div>

      {/* Timeline — 4 sections always rendered */}
      <div className={`flex-1 flex flex-col min-h-0 pt-8 pb-8 ${sectionPadX}`}>
        {leftCollapsed && (
          <button
            onClick={handleNewThread}
            className="mb-6 w-8 h-8 flex items-center justify-center rounded-md border border-[rgba(255,255,255,0.1)] text-[rgba(255,255,255,0.4)] hover:text-[var(--cykan)] hover:border-[rgba(45,212,191,0.3)] hover:bg-[rgba(45,212,191,0.05)] transition-all duration-300 shrink-0 shadow-sm"
            title="Nouvelle conversation"
          >
            <PlusIcon />
          </button>
        )}

        {leftCollapsed ? (
          <div className="overflow-y-auto scrollbar-hide flex-1 flex flex-col items-center gap-3">
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
          <div className="overflow-y-auto scrollbar-hide flex-1 flex flex-col" style={{ gap: "var(--space-2)" }}>
            
            {/* Top Menu */}
            <div className="flex flex-col gap-1 mb-4">
              <button onClick={handleNewThread} className="group flex items-center justify-between px-3 py-2.5 rounded-md text-left transition-all duration-300 hover:bg-[rgba(255,255,255,0.04)]">
                <div className="flex items-center gap-3">
                  <span className="text-[rgba(255,255,255,0.6)] group-hover:text-[rgba(255,255,255,0.9)] transition-colors">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </span>
                  <span className="t-14 font-medium text-[rgba(255,255,255,0.9)] transition-colors">Nouvelle conversation</span>
                </div>
                <span className="t-9 tracking-[0.2em] uppercase text-[rgba(255,255,255,0.3)] opacity-0 group-hover:opacity-100 transition-opacity">⌘N</span>
              </button>
              <button className="group flex items-center justify-between px-3 py-2.5 rounded-md text-left transition-all duration-300 hover:bg-[rgba(255,255,255,0.04)]">
                <div className="flex items-center gap-3">
                  <span className="text-[rgba(255,255,255,0.6)] group-hover:text-[rgba(255,255,255,0.9)] transition-colors">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
                      <path d="M12 12L2.1 7.1" />
                      <path d="M12 12l9.9 4.9" />
                    </svg>
                  </span>
                  <span className="t-14 font-medium text-[rgba(255,255,255,0.9)] transition-colors">Hearst</span>
                </div>
                <span className="t-9 tracking-[0.2em] uppercase text-[rgba(255,255,255,0.3)] opacity-0 group-hover:opacity-100 transition-opacity">⌘1</span>
              </button>
              <button onClick={() => router.push("/apps")} className="group flex items-center justify-between px-3 py-2.5 rounded-md text-left transition-all duration-300 hover:bg-[rgba(255,255,255,0.04)]">
                <div className="flex items-center gap-3">
                  <span className="text-[rgba(255,255,255,0.6)] group-hover:text-[rgba(255,255,255,0.9)] transition-colors">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <path d="M9 3v18" />
                      <path d="M15 3v18" />
                      <path d="M3 9h18" />
                      <path d="M3 15h18" />
                    </svg>
                  </span>
                  <span className="t-14 font-medium text-[rgba(255,255,255,0.9)] transition-colors">App</span>
                </div>
                <span className="t-9 tracking-[0.2em] uppercase text-[rgba(255,255,255,0.3)] opacity-0 group-hover:opacity-100 transition-opacity">⌘2</span>
              </button>
              <button onClick={() => router.push("/reports")} className="group flex items-center justify-between px-3 py-2.5 rounded-md text-left transition-all duration-300 hover:bg-[rgba(255,255,255,0.04)]">
                <div className="flex items-center gap-3">
                  <span className="text-[rgba(255,255,255,0.6)] group-hover:text-[rgba(255,255,255,0.9)] transition-colors">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="20" x2="18" y2="10" />
                      <line x1="12" y1="20" x2="12" y2="4" />
                      <line x1="6" y1="20" x2="6" y2="14" />
                    </svg>
                  </span>
                  <span className="t-14 font-medium text-[rgba(255,255,255,0.9)] transition-colors">Rapports</span>
                </div>
                <span className="t-9 tracking-[0.2em] uppercase text-[rgba(255,255,255,0.3)] opacity-0 group-hover:opacity-100 transition-opacity">⌘3</span>
              </button>
            </div>

            {/* Récents */}
            <section>
              <SectionHeader label="Récents" />
              {groups.today.length === 0 && groups.thisWeek.length === 0 ? (
                <EmptyHint>Aucune activité récente</EmptyHint>
              ) : (
                <div className="space-y-px">
                  {groups.today.map((t) => (
                    <ThreadRow
                      key={t.id}
                      thread={t}
                      isActive={t.id === activeThreadId}
                      onSelect={() => handleThreadSelect(t.id)}
                      onDelete={() => handleThreadDelete(t.id)}
                      onArchive={() => toggleArchived(t.id)}
                    />
                  ))}
                  {groups.thisWeek.map((t) => (
                    <ThreadRow
                      key={t.id}
                      thread={t}
                      isActive={t.id === activeThreadId}
                      onSelect={() => handleThreadSelect(t.id)}
                      onDelete={() => handleThreadDelete(t.id)}
                      onArchive={() => toggleArchived(t.id)}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Archive */}
            {groups.archive.length > 0 && (
              <section className="mt-4">
                <SectionHeader label="Archive" />
                <div className="space-y-px">
                  {groups.archive.map((t) => (
                    <ThreadRow
                      key={t.id}
                      thread={t}
                      isActive={t.id === activeThreadId}
                      onSelect={() => handleThreadSelect(t.id)}
                      onDelete={() => handleThreadDelete(t.id)}
                      onArchive={() => toggleArchived(t.id)}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* Footer — identité discrète + actions secondaires */}
      <div
        className={`shrink-0 flex flex-col items-center ${sectionPadX}`}
        style={{
          paddingTop: "var(--space-4)",
          paddingBottom: "var(--space-4)",
          gap: "var(--space-3)",
          background: "rgba(255,255,255,0.01)",
          boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.02)",
        }}
      >
        {leftCollapsed ? (
          <>
            <span
              className="rounded-full flex items-center justify-center bg-[rgba(255,255,255,0.03)] text-[rgba(255,255,255,0.6)] t-11 font-light border border-[rgba(255,255,255,0.06)]"
              style={{ width: "var(--space-6)", height: "var(--space-6)" }}
              title={firstName}
              aria-label={firstName}
            >
              {userInitial}
            </span>
            <Link
              href="/admin"
              title="Console admin"
              className="w-6 h-6 flex items-center justify-center text-[rgba(255,255,255,0.3)] hover:text-[var(--cykan)] transition-colors"
            >
              <AdminIcon />
            </Link>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              title="Se déconnecter"
              aria-label="Se déconnecter"
              className="w-6 h-6 flex items-center justify-center text-[rgba(255,255,255,0.3)] hover:text-[var(--danger)] transition-colors"
            >
              <LogoutIcon />
            </button>
            <button
              onClick={toggleLeftCollapsed}
              title="Étendre"
              aria-label="Étendre"
              className="w-6 h-5 flex items-center justify-center text-[rgba(255,255,255,0.3)] hover:text-[var(--cykan)] transition-colors"
            >
              <ChevronRightIcon />
            </button>
          </>
        ) : (
          <>
            <span
              className="rounded-full flex items-center justify-center bg-[rgba(255,255,255,0.03)] text-[rgba(255,255,255,0.6)] t-11 font-light border border-[rgba(255,255,255,0.06)]"
              style={{ width: "var(--space-6)", height: "var(--space-6)" }}
              aria-hidden
            >
              {userInitial}
            </span>
            <span className="t-13 font-light text-[rgba(255,255,255,0.9)] truncate max-w-full">
              {firstName}
            </span>
            <div
              className="flex items-center justify-center"
              style={{ gap: "var(--space-3)" }}
            >
              <Link
                href="/admin"
                title="Console admin"
                className="t-9 tracking-[0.2em] uppercase text-[rgba(255,255,255,0.3)] hover:text-[var(--cykan)] transition-colors"
              >
                Admin
              </Link>
              <span className="t-9 text-[rgba(255,255,255,0.2)]" aria-hidden>
                ·
              </span>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/login" })}
                title="Se déconnecter"
                className="t-9 tracking-[0.2em] uppercase text-[rgba(255,255,255,0.3)] hover:text-[var(--danger)] transition-colors"
              >
                Exit
              </button>
            </div>
            <button
              onClick={toggleLeftCollapsed}
              title="Réduire"
              aria-label="Réduire le rail"
              className="w-5 h-5 flex items-center justify-center text-[rgba(255,255,255,0.3)] hover:text-[var(--cykan)] transition-colors mt-2"
            >
              <ChevronLeftIcon />
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
