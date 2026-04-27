"use client";

import { useNavigationStore } from "@/stores/navigation";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

export function LeftPanel() {
  const { data: session } = useSession();
  const router = useRouter();
  const { threads, activeThreadId, setActiveThread, addThread, removeThread } = useNavigationStore();

  const firstName = session?.user?.name?.split(" ")[0] || "Utilisateur";

  return (
    <aside
      className="w-[200px] flex flex-col h-full relative z-20 border-r border-[var(--surface-2)]"
      style={{ background: "linear-gradient(180deg, var(--mat-050) 0%, var(--bg-soft) 100%)" }}
    >
      {/* Logo */}
      <button
        onClick={() => router.push("/")}
        className="px-4 py-4 flex items-center gap-3 hover:opacity-80 transition-opacity shrink-0"
        title="Hearst — Accueil"
      >
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-sm halo-ring shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/patterns/hcyan.svg" alt="Hearst" className="w-5 h-5 object-contain" />
        </span>
        <span className="t-15 font-light tracking-tight text-[var(--text-soft)]">Hearst</span>
      </button>

      <div className="h-px mx-3 shrink-0 halo-rule" />

      {/* Conversations header */}
      <div className="flex items-center justify-between px-4 pt-5 pb-2 shrink-0">
        <span className="t-9 font-mono tracking-[0.3em] uppercase text-[var(--text-faint)]">Conversations</span>
        <button
          onClick={() => addThread("New", "home")}
          className="w-5 h-5 flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--cykan)] transition-colors"
          title="Nouvelle conversation"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      {/* Thread list — scrollable */}
      <div className="flex-1 overflow-y-auto scrollbar-hide py-1">
        {threads.length === 0 && (
          <p className="px-4 py-3 t-11 text-[var(--text-ghost)]">Aucune conversation</p>
        )}
        {threads.map((thread) => {
          const isActive = thread.id === activeThreadId;
          return (
            <div
              key={thread.id}
              className={`group relative flex items-center gap-3 mx-2 px-2 py-2 rounded-sm cursor-pointer transition-colors ${
                isActive
                  ? "bg-[var(--surface-1)] text-[var(--text)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--surface-1)] hover:text-[var(--text)]"
              }`}
              onClick={() => setActiveThread(thread.id)}
              title={thread.name}
            >
              <span className={`w-6 h-6 rounded-sm flex items-center justify-center t-11 font-bold shrink-0 ${
                isActive ? "bg-[var(--cykan)] text-[var(--bg)]" : "bg-[var(--surface-2)] text-[var(--text-faint)]"
              }`}>
                {thread.name.charAt(0).toUpperCase()}
              </span>

              <span className="flex-1 t-13 font-light truncate min-w-0">{thread.name}</span>

              <button
                onClick={(e) => { e.stopPropagation(); removeThread(thread.id); }}
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

      <div className="h-px bg-[var(--surface-2)] mx-3 shrink-0" />

      {/* Bottom — Apps + Logout */}
      <div className="p-3 flex flex-col gap-1 shrink-0">
        <button
          onClick={() => router.push("/apps")}
          className="flex items-center gap-3 px-2 py-2 rounded-sm t-13 font-light text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-1)] transition-colors"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="2" width="9" height="9" rx="1"/>
            <rect x="13" y="2" width="9" height="9" rx="1"/>
            <rect x="2" y="13" width="9" height="9" rx="1"/>
            <rect x="13" y="13" width="9" height="9" rx="1"/>
          </svg>
          <span>Applications</span>
        </button>

        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-3 px-2 py-2 rounded-sm t-13 font-light text-[var(--text-faint)] hover:text-[var(--danger)] hover:bg-[var(--surface-1)] transition-colors"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span>{firstName}</span>
        </button>
      </div>
    </aside>
  );
}
