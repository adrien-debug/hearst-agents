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
  count,
  action,
}: {
  label: string;
  count: number;
  accent?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between first:mt-0 mt-6 mb-3">
      <span className="rail-section-label">{label}</span>
      <span className="flex items-center gap-2">
        {action}
        <span className="t-9 font-mono tracking-display text-[var(--text-faint)]">
          {count.toString().padStart(2, "0")}
        </span>
      </span>
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="t-11 font-mono tracking-display text-[var(--text-faint)] uppercase pl-3 py-1">
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
      className="group cursor-pointer py-2 -mx-2 px-2 transition-colors flex items-center gap-3"
      title={thread.name}
    >
      <span
        className={`rounded-pill shrink-0 transition-all ${
          isActive ? "bg-[var(--cykan)] halo-cyan-sm" : "border border-[var(--text-muted)]"
        }`}
        style={{ width: "var(--space-1)", height: "var(--space-1)" }}
      />
      <p
        className={`flex-1 t-13 font-light truncate min-w-0 transition-colors ${
          isActive
            ? "text-[var(--cykan)] halo-cyan-sm"
            : "text-[var(--text-muted)] group-hover:text-[var(--text)] group-hover:halo-cyan-sm"
        }`}
        style={{ lineHeight: "var(--leading-base)" }}
      >
        {thread.name}
      </p>
      <div
        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 flex items-center"
        style={{ gap: "var(--space-1)" }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onArchive();
          }}
          className="text-[var(--text-ghost)] hover:text-[var(--cykan)] p-1"
          title={isArchived ? "Désarchiver" : "Archiver"}
          aria-label={isArchived ? "Désarchiver le thread" : "Archiver le thread"}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
          className="text-[var(--text-ghost)] hover:text-[var(--danger)] p-1"
          title="Supprimer"
          aria-label="Supprimer le thread"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
      className="h-full flex flex-col z-20 relative border-r border-[var(--border-shell)] transition-[width] duration-slow ease-out-soft"
      style={{
        width: leftCollapsed ? "var(--width-threads-collapsed)" : "var(--width-threads)",
        background: "var(--bg-rail)",
      }}
    >
      {/* Logo */}
      <div
        className="shrink-0 border-b border-[var(--border-shell)] flex items-center justify-center pt-8 pb-8 px-8"
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
            className="halo-on-hover mb-4 w-8 h-8 flex items-center justify-center rounded-sm border border-dashed border-[var(--surface-2)] text-[var(--text-faint)] hover:text-[var(--cykan)] hover:border-[var(--line-active)] transition-all shrink-0"
            title="Nouvelle conversation"
          >
            <PlusIcon />
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
          <div className="overflow-y-auto scrollbar-hide flex-1 flex flex-col" style={{ gap: "var(--space-3)" }}>
            {/* Today */}
            <section>
              <SectionHeader
                label="Today"
                count={groups.today.length}
                action={
                  <button
                    type="button"
                    onClick={handleNewThread}
                    title="Nouvelle conversation"
                    aria-label="Nouvelle conversation"
                    className="halo-on-hover w-4 h-4 flex items-center justify-center rounded-pill border border-[var(--border-default)] text-[var(--text-faint)] hover:text-[var(--cykan)] hover:border-[var(--cykan-border-hover)] transition-colors"
                  >
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </button>
                }
              />
              {groups.today.length === 0 ? (
                <EmptyHint>{"Aucune activité aujourd'hui"}</EmptyHint>
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
                </div>
              )}
            </section>

            {groups.thisWeek.length > 0 && (
              <section>
                <SectionHeader label="7 derniers jours" count={groups.thisWeek.length} />
                <div className="space-y-px">
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
              </section>
            )}

            {groups.archive.length > 0 && (
              <section>
                <SectionHeader label="Archive" count={groups.archive.length} />
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

      {/* Tools & Apps Menu — ChatGPT style */}
      {!leftCollapsed && (
        <div className={`shrink-0 flex flex-col gap-4 border-t border-[var(--border-shell)] py-6 ${sectionPadX}`}>
          {/* Tools */}
          <div className="flex flex-col gap-2">
            <span className="rail-section-label t-10 uppercase">Tools</span>
            <button className="group flex items-center gap-3 px-3 py-2 rounded-sm text-left border-b border-[var(--border-soft)] bg-transparent transition-colors hover:text-[var(--cykan)]">
              <span className="text-[var(--text-faint)] group-hover:text-[var(--cykan)]">⚡</span>
              <span className="t-13 text-[var(--text-soft)] group-hover:text-[var(--cykan)] flex-1">Hearst Tool</span>
            </button>
            <button className="group flex items-center gap-3 px-3 py-2 rounded-sm text-left border-b border-[var(--border-soft)] bg-transparent transition-colors hover:text-[var(--cykan)]">
              <span className="text-[var(--text-faint)] group-hover:text-[var(--cykan)]">🔧</span>
              <span className="t-13 text-[var(--text-soft)] group-hover:text-[var(--cykan)] flex-1">Custom Tool</span>
            </button>
          </div>

          {/* Apps */}
          <div className="flex flex-col gap-2">
            <span className="rail-section-label t-10 uppercase">Apps</span>
            <button className="group flex items-center gap-3 px-3 py-2 rounded-sm text-left border-b border-[var(--border-soft)] bg-transparent transition-colors hover:text-[var(--cykan)]">
              <span className="text-[var(--text-faint)] group-hover:text-[var(--cykan)]">📱</span>
              <span className="t-13 text-[var(--text-soft)] group-hover:text-[var(--cykan)] flex-1">Hearst App</span>
            </button>
            <button className="group flex items-center gap-3 px-3 py-2 rounded-sm text-left border-b border-[var(--border-soft)] bg-transparent transition-colors hover:text-[var(--cykan)]">
              <span className="text-[var(--text-faint)] group-hover:text-[var(--cykan)]">🎯</span>
              <span className="t-13 text-[var(--text-soft)] group-hover:text-[var(--cykan)] flex-1">Analytics</span>
            </button>
          </div>
        </div>
      )}

      {/* Footer — identité discrète + actions secondaires */}
      <div
        className={`shrink-0 border-t border-[var(--border-shell)] flex flex-col items-center ${sectionPadX}`}
        style={{ paddingTop: "var(--space-3)", paddingBottom: "var(--space-3)", gap: "var(--space-2)" }}
      >
        {leftCollapsed ? (
          <>
            <span
              className="rounded-pill flex items-center justify-center bg-[var(--surface-1)] text-[var(--text-muted)] t-11 font-medium"
              style={{ width: "var(--space-6)", height: "var(--space-6)" }}
              title={firstName}
              aria-label={firstName}
            >
              {userInitial}
            </span>
            <Link
              href="/admin"
              title="Console admin"
              className="w-6 h-6 flex items-center justify-center text-[var(--text-ghost)] hover:text-[var(--cykan)] transition-colors"
            >
              <AdminIcon />
            </Link>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              title="Se déconnecter"
              aria-label="Se déconnecter"
              className="w-6 h-6 flex items-center justify-center text-[var(--text-ghost)] hover:text-[var(--danger)] transition-colors"
            >
              <LogoutIcon />
            </button>
            <button
              onClick={toggleLeftCollapsed}
              title="Étendre"
              aria-label="Étendre"
              className="w-6 h-5 flex items-center justify-center text-[var(--text-ghost)] hover:text-[var(--cykan)] transition-colors"
            >
              <ChevronRightIcon />
            </button>
          </>
        ) : (
          <>
            <span
              className="rounded-pill flex items-center justify-center bg-[var(--surface-1)] text-[var(--text-muted)] t-11 font-medium"
              style={{ width: "var(--space-6)", height: "var(--space-6)" }}
              aria-hidden
            >
              {userInitial}
            </span>
            <span className="t-13 font-light text-[var(--text-muted)] truncate max-w-full">
              {firstName}
            </span>
            <div
              className="flex items-center justify-center"
              style={{ gap: "var(--space-3)" }}
            >
              <Link
                href="/admin"
                title="Console admin"
                className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)] hover:text-[var(--cykan)] transition-colors"
              >
                Admin
              </Link>
              <span className="t-9 font-mono text-[var(--text-ghost)]" aria-hidden>
                ·
              </span>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/login" })}
                title="Se déconnecter"
                className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)] hover:text-[var(--danger)] transition-colors"
              >
                Exit
              </button>
            </div>
            <button
              onClick={toggleLeftCollapsed}
              title="Réduire"
              aria-label="Réduire le rail"
              className="w-5 h-5 flex items-center justify-center text-[var(--text-ghost)] hover:text-[var(--cykan)] transition-colors"
            >
              <ChevronLeftIcon />
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
