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
 *   Last 7 days threads + assets de la semaine
 *   Archive          lien vers /archive plein écran
 *
 * Click sur une entrée → setActiveThread + setStageMode approprié.
 * Mode collapsed conservé (toggle bottom rail).
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
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
  action,
}: {
  label: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between first:mt-0 mt-12 mb-6 px-3">
      <span
        className="t-11 font-medium"
        style={{
          color: "var(--text-faint)",
          letterSpacing: "var(--tracking-tight)",
        }}
      >
        {label}
      </span>
      <span className="flex items-center gap-2">
        {action}
      </span>
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="t-11 font-light pl-3 py-2"
      style={{ color: "var(--text-faint)" }}
    >
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
      className="group cursor-pointer py-2 px-3 transition-all duration-300 flex items-center gap-3 rounded-md"
      style={{
        background: isActive ? "var(--layer-1)" : "transparent",
      }}
      onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "var(--layer-1)"; }}
      onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      title={thread.name}
    >
      <p
        className="flex-1 t-14 truncate min-w-0 transition-all duration-300"
        style={{
          lineHeight: "var(--leading-base)",
          color: isActive ? "var(--cykan)" : "var(--text-l1)",
          fontWeight: isActive ? 500 : 300,
          textShadow: isActive ? "var(--shadow-neon-cykan)" : "none",
        }}
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
          className="text-[var(--text-faint)] hover:text-[var(--text-soft)] p-1 transition-colors"
          title={isArchived ? "Unarchive" : "Archive"}
          aria-label={isArchived ? "Unarchive thread" : "Archive thread"}
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
            if (window.confirm(`Delete "${thread.name}" ?`)) onDelete();
          }}
          className="text-[var(--text-faint)] hover:text-[var(--danger)] p-1 transition-colors"
          title="Delete"
          aria-label="Delete thread"
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

function TopMenuItem({
  label,
  hotkey,
  isActive = false,
  onClick,
}: {
  label: string;
  hotkey?: string;
  isActive?: boolean;
  onClick?: () => void;
}) {
  const [hover, setHover] = useState(false);
  const highlight = isActive || hover;
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-current={isActive ? "page" : undefined}
      className="flex items-center justify-between text-left"
      style={{ padding: "var(--space-2) 0" }}
    >
      <span
        className="t-13 transition-all duration-emphasis ease-out-soft"
        style={{
          color: highlight ? "var(--cykan)" : "var(--text-l2)",
          fontWeight: isActive ? 500 : 300,
          textShadow: highlight ? "var(--neon-cykan)" : "none",
        }}
      >
        {label}
      </span>
      {hotkey ? (
        <span
          className="t-9 font-mono"
          style={{ color: "var(--text-faint)" }}
        >
          {hotkey}
        </span>
      ) : null}
    </button>
  );
}

function GhostFooterLink({
  href,
  onClick,
  title,
  children,
}: {
  href?: string;
  onClick?: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  const linkStyle = {
    color: hover ? "var(--cykan)" : "var(--text-faint)",
  };
  const linkClass = "t-11 font-light transition-colors duration-emphasis ease-out-soft";

  if (href) {
    return (
      <Link
        href={href}
        title={title}
        className={linkClass}
        style={linkStyle}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={linkClass}
      style={linkStyle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {children}
    </button>
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
          ? "bg-[var(--cykan-bg-active)] text-[var(--cykan)] border border-[var(--cykan-border)] shadow-[var(--shadow-neon-cykan)]"
          : "bg-[var(--surface-1)] text-[var(--text-faint)] border border-[var(--border-soft)] hover:bg-[var(--layer-1)] hover:text-[var(--text-soft)] hover:border-[var(--border-subtle)]"
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
  const pathname = usePathname();
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
  const isHearstActive = pathname === "/";
  const isAppsActive = pathname === "/apps" || pathname?.startsWith("/apps/") === true;

  const sectionPadX = leftCollapsed ? "pl-6 pr-2" : "px-8";

  const groups = useMemo(() => groupThreadsByDate(threads), [threads]);

  const handleThreadSelect = (threadId: string) => {
    setActiveThread(threadId);
    setStageMode({ mode: "chat", threadId });
    if (pathname !== "/") router.push("/");
  };

  const handleThreadDelete = (threadId: string) => {
    if (threadId === activeThreadId) setActiveThread(null);
    removeThread(threadId);
  };

  const handleNewThread = () => {
    const id = addThread("New", "home");
    setStageMode({ mode: "chat", threadId: id });
    if (pathname !== "/") router.push("/");
  };

  const handleHearstHome = () => {
    setActiveThread(null);
    setStageMode({ mode: "cockpit" });
    if (pathname !== "/") router.push("/");
  };

  return (
    <aside
      className="h-full flex flex-col z-20 relative transition-[width] duration-slow ease-out-soft overflow-hidden"
      style={{
        width: leftCollapsed ? "var(--width-threads-collapsed)" : "var(--width-threads)",
        background: "var(--bg)",
      }}
    >
      {/* Logo */}
      <div
        className="shrink-0 flex items-center justify-center pt-8 pb-8 px-8"
        style={{
          boxShadow: "var(--shadow-divider-bottom-subtle)",
        }}
      >
        <button
          onClick={() => {
            router.push("/");
            setStageMode({ mode: "chat" });
          }}
          className="flex items-center justify-center hover:opacity-80 transition-opacity"
          title="Hearst"
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
            className="mb-6 w-8 h-8 flex items-center justify-center rounded-md border border-[var(--border-subtle)] text-[var(--text-faint)] hover:text-[var(--cykan)] hover:border-[var(--cykan-border)] hover:bg-[var(--cykan-bg-hover)] transition-all duration-300 shrink-0"
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

            {/* Top Menu — deux groupes, séparés par l'air uniquement */}
            <div
              className="flex flex-col mb-2"
              style={{
                borderBottom: "1px solid var(--sep)",
                paddingBottom: "var(--space-1)",
              }}
            >
              <div className="flex flex-col">
                <TopMenuItem
                  label="Hearst"
                  hotkey="⌘1"
                  isActive={isHearstActive}
                  onClick={handleHearstHome}
                />
                <TopMenuItem
                  label="App"
                  isActive={isAppsActive}
                  onClick={() => router.push("/apps")}
                />
              </div>
              <div className="flex flex-col" style={{ marginTop: "var(--space-6)" }}>
                <TopMenuItem label="Nouvelle conversation" hotkey="⌘N" onClick={handleNewThread} />
              </div>
            </div>

            {/* Recent */}
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
              <section>
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

      {/* Footer — stack vertical aligné gauche : badge connexion + actions */}
      <div
        className={`shrink-0 flex flex-col ${leftCollapsed ? "items-center" : "items-start"} ${sectionPadX}`}
        style={{
          paddingTop: "var(--space-4)",
          paddingBottom: "var(--space-6)",
          gap: "var(--space-3)",
        }}
      >
        {leftCollapsed ? (
          <>
            <span
              className="rounded-pill"
              style={{
                width: "var(--space-2)",
                height: "var(--space-2)",
                background: "var(--color-success)",
                boxShadow: "var(--shadow-status-online)",
              }}
              title={firstName}
              aria-label={`${firstName} en ligne`}
            />
            <Link
              href="/admin"
              title="Admin console"
              className="w-6 h-6 flex items-center justify-center text-[var(--text-ghost)] hover:text-[var(--cykan)] transition-colors"
            >
              <AdminIcon />
            </Link>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              title="Sign out"
              aria-label="Sign out"
              className="w-6 h-6 flex items-center justify-center text-[var(--text-ghost)] hover:text-[var(--danger)] transition-colors"
            >
              <LogoutIcon />
            </button>
            <button
              onClick={toggleLeftCollapsed}
              title="Expand"
              aria-label="Expand"
              className="w-6 h-5 flex items-center justify-center text-[var(--text-ghost)] hover:text-[var(--cykan)] transition-colors"
            >
              <ChevronRightIcon />
            </button>
          </>
        ) : (
          <>
            <div
              className="flex items-center"
              style={{ gap: "var(--space-2)" }}
            >
              <span
                className="rounded-pill shrink-0"
                style={{
                  width: "var(--space-2)",
                  height: "var(--space-2)",
                  background: "var(--color-success)",
                  boxShadow: "var(--shadow-status-online)",
                }}
                aria-hidden
              />
              <span className="t-13 font-light text-[var(--text-soft)] truncate max-w-full">
                {firstName}
              </span>
            </div>
            <div
              className="flex items-center"
              style={{ gap: "var(--space-3)" }}
            >
              <GhostFooterLink href="/admin" title="Admin console">
                Admin
              </GhostFooterLink>
              <GhostFooterLink
                onClick={() => signOut({ callbackUrl: "/login" })}
                title="Sign out"
              >
                Exit
              </GhostFooterLink>
            </div>
            <button
              onClick={toggleLeftCollapsed}
              title="Collapse"
              aria-label="Collapse"
              className="w-5 h-5 flex items-center justify-center text-[var(--text-ghost)] hover:text-[var(--cykan)] transition-colors mt-2"
            >
              <ChevronLeftIcon />
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
