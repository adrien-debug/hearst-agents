"use client";

import { useNavigationStore } from "@/stores/navigation";
import { useSession, signOut } from "next-auth/react";
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

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="t-11 font-mono tracking-[0.2em] text-[var(--text-ghost)] uppercase">
      {children}
    </p>
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
    leftCollapsed,
    toggleLeftCollapsed,
  } = useNavigationStore();
  const firstName = session?.user?.name?.split(" ")[0] || "Utilisateur";
  const userInitial = firstName.charAt(0).toUpperCase();

  // Padding rule: x=24px (px-6) du bord gauche dans les deux états
  // pour que les icônes restent sur le même axe vertical au toggle.
  const sectionPadX = leftCollapsed ? "pl-6 pr-2" : "px-6";

  return (
    <aside
      className="h-full flex flex-col z-20 relative border-r border-[var(--border-shell)] transition-[width] duration-300 ease-out"
      style={{
        width: leftCollapsed ? "var(--width-threads-collapsed)" : "var(--width-threads)",
        background: "var(--bg-rail)",
      }}
    >
      {/* Logo */}
      <div className="shrink-0 border-b border-[var(--border-shell)] flex items-center justify-center pt-5 pb-4 px-2">
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
        ) : (
          <div className={`overflow-y-auto scrollbar-hide flex-1 ${leftCollapsed ? "space-y-2" : "space-y-px"}`}>
            {threads.map((thread) => {
              const isActive = thread.id === activeThreadId;
              const initial = thread.name.trim().charAt(0).toUpperCase() || "·";

              if (leftCollapsed) {
                return (
                  <button
                    key={thread.id}
                    onClick={() => setActiveThread(thread.id)}
                    title={thread.name}
                    className={`w-8 h-8 flex items-center justify-center rounded-sm t-13 font-medium transition-all shrink-0 ${
                      isActive
                        ? "bg-[var(--cykan)] text-[var(--bg)] halo-cyan-sm"
                        : "bg-[var(--surface-1)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                    }`}
                  >
                    {initial}
                  </button>
                );
              }

              return (
                <div
                  key={thread.id}
                  onClick={() => setActiveThread(thread.id)}
                  className={`group cursor-pointer py-2 -mx-2 px-2 transition-colors flex items-center gap-3 ${
                    isActive
                      ? "bg-[var(--cykan-bg-active)]"
                      : "hover:bg-[var(--surface-2)]"
                  }`}
                  style={isActive ? { boxShadow: "inset 2px 0 0 var(--cykan)" } : undefined}
                  title={thread.name}
                >
                  <span
                    className={`w-1 h-1 rounded-full shrink-0 ${
                      isActive ? "bg-[var(--cykan)] halo-dot" : "bg-[var(--text-ghost)]"
                    }`}
                  />
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
                      removeThread(thread.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center text-[var(--text-ghost)] hover:text-[var(--danger)] transition-all shrink-0"
                    title="Supprimer"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Profil + toggle */}
      <div className={`shrink-0 border-t border-[var(--border-shell)] flex flex-col gap-1 pt-4 pb-5 ${sectionPadX}`}>
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
