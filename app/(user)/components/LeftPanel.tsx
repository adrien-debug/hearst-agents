"use client";

import { useNavigationStore, type Thread, type Message } from "@/stores/navigation";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HearstLogo } from "./HearstLogo";

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

const StarIcon = ({ filled }: { filled: boolean }) => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill={filled ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth={filled ? 0 : 1.5}
  >
    <path d="M12 2.5l2.95 6.46 7.05.7-5.3 4.85 1.55 6.99L12 17.96 5.75 21.5l1.55-6.99L2 9.66l7.05-.7L12 2.5z" />
  </svg>
);

const CloseIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

const AdminIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12h4l2-7 4 14 2-7h6" />
  </svg>
);

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="t-11 font-mono tracking-[0.2em] text-[var(--text-ghost)] uppercase">
      {children}
    </p>
  );
}

function GroupLabel({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between mt-3 mb-1.5 first:mt-0">
      <span className="t-9 font-mono tracking-[0.3em] text-[var(--text-ghost)] uppercase">
        {label}
      </span>
      <span className="t-9 font-mono tracking-[0.2em] text-[var(--text-ghost)]">
        {count}
      </span>
    </div>
  );
}

function snippetOf(msgs: Message[] | undefined): string | null {
  if (!msgs || msgs.length === 0) return null;
  const text = msgs[msgs.length - 1].content.replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : null;
}

interface ThreadRowProps {
  thread: Thread;
  isActive: boolean;
  snippet: string | null;
  onSelect: () => void;
  onTogglePin: () => void;
  onRemove: () => void;
}

function ThreadRow({ thread, isActive, snippet, onSelect, onTogglePin, onRemove }: ThreadRowProps) {
  const isPinned = !!thread.pinned;

  return (
    <div
      onClick={onSelect}
      className={`group cursor-pointer py-2 -mx-2 px-2 transition-colors flex flex-col gap-1 ${
        isActive ? "bg-[var(--cykan-bg-active)]" : "hover:bg-[var(--surface-2)]"
      }`}
      style={isActive ? { boxShadow: "inset 2px 0 0 var(--cykan)" } : undefined}
      title={thread.name}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin();
          }}
          className={`w-3 h-3 flex items-center justify-center shrink-0 transition-colors ${
            isPinned
              ? "text-[var(--cykan)]"
              : "text-[var(--text-ghost)] hover:text-[var(--cykan)]"
          }`}
          title={isPinned ? "Désépingler" : "Épingler"}
        >
          <StarIcon filled={isPinned} />
        </button>
        <p
          className={`flex-1 t-13 font-light truncate min-w-0 transition-colors ${
            isActive
              ? "text-[var(--text)]"
              : "text-[var(--text-inactive)] group-hover:text-[var(--text)]"
          }`}
          style={{ lineHeight: "20px" }}
        >
          {thread.name}
        </p>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center text-[var(--text-ghost)] hover:text-[var(--danger)] transition-all shrink-0"
          title="Supprimer"
        >
          <CloseIcon />
        </button>
      </div>
      {snippet && (
        <p
          className={`t-11 font-light truncate min-w-0 ${
            isActive ? "text-[var(--text-muted)]" : "text-[var(--text-faint)]"
          }`}
          style={{ paddingLeft: "var(--space-6)", lineHeight: "14px" }}
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
  const isPinned = !!thread.pinned;

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
      {isPinned && !isActive && (
        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[var(--cykan)] halo-cyan-sm" />
      )}
    </button>
  );
}

export function LeftPanel() {
  const { data: session } = useSession();
  const router = useRouter();
  const {
    threads,
    activeThreadId,
    setActiveThread,
    addThread,
    removeThread,
    togglePinned,
    leftCollapsed,
    toggleLeftCollapsed,
    messages,
  } = useNavigationStore();
  const firstName = session?.user?.name?.split(" ")[0] || "Utilisateur";
  const userInitial = firstName.charAt(0).toUpperCase();

  // Padding rule: x=24px (px-6) du bord gauche dans les deux états
  // pour que les icônes restent sur le même axe vertical au toggle.
  const sectionPadX = leftCollapsed ? "pl-6 pr-2" : "px-6";

  const pinnedThreads = threads.filter((t) => t.pinned);
  const otherThreads = threads.filter((t) => !t.pinned);
  const hasPinned = pinnedThreads.length > 0;
  const hasOther = otherThreads.length > 0;

  return (
    <aside
      className="h-full flex flex-col z-20 relative border-r border-[var(--border-shell)] transition-[width] duration-300 ease-out"
      style={{
        width: leftCollapsed ? "var(--width-threads-collapsed)" : "var(--width-threads)",
        background: "var(--bg-rail)",
      }}
    >
      {/* Logo */}
      <div className="shrink-0 border-b border-[var(--border-shell)] flex items-center justify-center pb-1 px-2">
        <button
          onClick={() => router.push("/")}
          className="flex items-center justify-center hover:opacity-80 transition-opacity"
          title="Hearst — Accueil"
        >
          {leftCollapsed ? (
            <span className="t-28 font-medium tracking-tight text-[var(--cykan)] halo-cyan-sm leading-none">H</span>
          ) : (
            <HearstLogo className="w-32 h-32 object-contain transition-all duration-300" />
          )}
        </button>
      </div>

      {/* Conversations — header + scrollable list */}
      <div className={`flex-1 flex flex-col min-h-0 pt-7 pb-6 ${sectionPadX}`}>
        {leftCollapsed ? (
          <button
            onClick={() => addThread("New", "home")}
            className="halo-on-hover mb-4 w-8 h-8 flex items-center justify-center rounded-sm border border-dashed border-[var(--surface-2)] text-[var(--text-faint)] hover:text-[var(--cykan)] hover:border-[var(--line-active)] transition-all shrink-0"
            title="Nouvelle conversation"
          >
            <PlusIcon />
          </button>
        ) : (
          <button
            onClick={() => addThread("New", "home")}
            className="halo-on-hover w-full flex items-center justify-between mb-4 group/header text-[var(--text-faint)] hover:text-[var(--cykan)] transition-colors"
            title="Nouvelle conversation"
          >
            <span className="flex items-center gap-2">
              <ChatIcon />
              <span className="t-9 font-mono tracking-[0.3em] uppercase">Conversations</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="t-9 font-mono tracking-[0.2em]">{threads.length}</span>
              <span className="t-9 font-mono opacity-0 group-hover/header:opacity-100 -translate-x-1 group-hover/header:translate-x-0 transition-all">
                +
              </span>
            </span>
          </button>
        )}

        {threads.length === 0 ? (
          leftCollapsed ? null : <EmptyState>Aucune conversation</EmptyState>
        ) : leftCollapsed ? (
          <div className="overflow-y-auto scrollbar-hide flex-1 flex flex-col items-center gap-2">
            {pinnedThreads.map((t) => (
              <CollapsedTile
                key={t.id}
                thread={t}
                isActive={t.id === activeThreadId}
                onSelect={() => setActiveThread(t.id)}
              />
            ))}
            {hasPinned && hasOther && (
              <div className="w-3 h-px bg-[var(--border-shell)] my-1" />
            )}
            {otherThreads.map((t) => (
              <CollapsedTile
                key={t.id}
                thread={t}
                isActive={t.id === activeThreadId}
                onSelect={() => setActiveThread(t.id)}
              />
            ))}
          </div>
        ) : (
          <div className="overflow-y-auto scrollbar-hide flex-1 space-y-px">
            {hasPinned && (
              <>
                <GroupLabel label="Épinglées" count={pinnedThreads.length} />
                {pinnedThreads.map((t) => (
                  <ThreadRow
                    key={t.id}
                    thread={t}
                    isActive={t.id === activeThreadId}
                    snippet={snippetOf(messages[t.id])}
                    onSelect={() => setActiveThread(t.id)}
                    onTogglePin={() => togglePinned(t.id)}
                    onRemove={() => removeThread(t.id)}
                  />
                ))}
              </>
            )}
            {hasOther && (
              <>
                {hasPinned && <GroupLabel label="Récent" count={otherThreads.length} />}
                {otherThreads.map((t) => (
                  <ThreadRow
                    key={t.id}
                    thread={t}
                    isActive={t.id === activeThreadId}
                    snippet={snippetOf(messages[t.id])}
                    onSelect={() => setActiveThread(t.id)}
                    onTogglePin={() => togglePinned(t.id)}
                    onRemove={() => removeThread(t.id)}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Profil + toggle */}
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
