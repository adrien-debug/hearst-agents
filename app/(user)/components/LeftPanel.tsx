"use client";

import { useNavigationStore, type Surface } from "@/stores/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";

const SURFACES: { id: Surface; label: string; icon: JSX.Element; path: string }[] = [
  { id: "home", label: "Accueil", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>, path: "/" },
];

const SECONDARY_LINKS: { label: string; icon: JSX.Element; path: string }[] = [
  { label: "Missions", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>, path: "/missions" },
  { label: "Assets", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>, path: "/assets" },
  { label: "Planner", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>, path: "/planner" },
  { label: "Apps", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>, path: "/apps" },
];

export function LeftPanel() {
  const { data: session } = useSession();
  const { surface, setSurface, threads, activeThreadId, setActiveThread, addThread } = useNavigationStore();
  const [isExpanded, setIsExpanded] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const firstName = session?.user?.name?.split(" ")[0] || "Utilisateur";
  const [now] = useState(() => Date.now());
  const activeThreads = threads.filter(t => t.lastActivity > now - 7 * 24 * 60 * 60 * 1000);

  const handleLogout = () => {
    signOut({ callbackUrl: "/login" });
  };

  return (
    <aside
      className={`${isExpanded ? "w-[300px]" : "w-[90px]"} flex flex-col transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] h-full relative z-20 border-r border-white/[0.03] shadow-[30px_0_60px_rgba(0,0,0,0.4)]`}
      style={{ background: "linear-gradient(to right, var(--rail), #020202)" }}
    >
      {/* Brand Header */}
      <div className="p-10">
        <div className="flex items-center gap-6">
          <div className="w-14 h-14 flex items-center justify-center text-[16px] font-black bg-[var(--cykan)] text-black rounded-sm shadow-[0_0_40px_rgba(163,255,0,0.25)] hover:scale-105 transition-transform duration-500">
            H
          </div>
          {isExpanded && (
            <div className="flex-1 min-w-0">
              <p className="text-[16px] font-black uppercase tracking-tighter text-white">Hearst OS</p>
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-mono text-[var(--text-muted)] uppercase tracking-[0.3em]">{firstName}</p>
              </div>
            </div>
          )}
        </div>

        {/* Toggle expand/collapse — always visible */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-10 w-full py-2 flex items-center justify-center gap-2 text-[11px] font-mono uppercase tracking-[0.2em] text-[var(--text-faint)] hover:text-[var(--text-muted)] hover:bg-white/[0.02] rounded transition-colors border-t border-white/5 pt-6"
          title={isExpanded ? "Réduire" : "Développer"}
        >
          <span>{isExpanded ? "←" : "→"}</span>
          {isExpanded && <span>Collapse</span>}
        </button>

        {!isExpanded && (
          <button
            onClick={handleLogout}
            className="mt-4 w-full text-center text-[11px] text-[var(--text-faint)] hover:text-[var(--danger)] transition-colors"
            title="Déconnexion"
          >
            →
          </button>
        )}
      </div>

      {/* Primary Navigation */}
      <nav className="p-0 space-y-2">
        {SURFACES.map((s) => {
          const isActive = pathname === s.path || (s.path !== "/" && pathname?.startsWith(s.path));
          return (
            <button
              key={s.id}
              onClick={() => {
                setSurface(s.id);
                router.push(s.path);
              }}
              className={`w-full flex items-center gap-6 px-8 py-5 text-[14px] transition-all duration-700 border-l-[2px] ${
                isActive
                  ? "bg-white/[0.02] text-white border-[var(--cykan)] shadow-[0_10px_40px_rgba(0,0,0,0.4)]"
                  : "text-white/20 hover:text-white/60 hover:bg-white/[0.01] border-transparent"
              }`}
            >
              <span className={`w-6 flex justify-center text-xl transition-colors ${isActive ? 'text-[var(--cykan)]' : ''}`}>{s.icon}</span>
              {isExpanded && <span className="truncate font-black uppercase tracking-tighter">{s.label}</span>}
            </button>
          );
        })}

        {/* Divider */}
        <div className="py-6 px-10">
          <div className="h-px bg-white/10" />
        </div>

        {/* Secondary Links */}
        {SECONDARY_LINKS.map((link) => {
          const isActive = pathname === link.path || pathname?.startsWith(link.path);
          return (
            <button
              key={link.path}
              onClick={() => router.push(link.path)}
              className={`w-full flex items-center gap-6 px-8 py-5 text-[14px] transition-all duration-700 border-l-[2px] ${
                isActive
                  ? "bg-white/[0.02] text-white border-[var(--cykan)] shadow-[0_10px_40px_rgba(0,0,0,0.4)]"
                  : "text-white/20 hover:text-white/60 hover:bg-white/[0.01] border-transparent"
              }`}
            >
              <span className={`w-6 flex justify-center text-xl transition-colors ${isActive ? 'text-[var(--cykan)]' : ''}`}>{link.icon}</span>
              {isExpanded && <span className="truncate font-black uppercase tracking-tighter">{link.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Conversations Section */}
      {isExpanded && (
        <div className="flex-1 flex flex-col min-h-0 mt-12">
          <div className="px-10 py-6">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-mono font-black uppercase tracking-[0.6em] text-white/20">Sessions</p>
              <button
                onClick={() => addThread("Nouveau", surface)}
                className="w-8 h-8 flex items-center justify-center border border-white/10 text-white/30 hover:bg-[var(--cykan)] hover:text-black hover:border-[var(--cykan)] transition-all duration-300"
                aria-label="Nouvelle session"
              >
                +
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-0 pb-12 space-y-2 scrollbar-hide">
            {activeThreads.map((thread) => (
              <button
                key={thread.id}
                onClick={() => setActiveThread(thread.id)}
                className={`w-full text-left px-8 py-5 text-[13px] transition-all duration-700 border-l-[2px] group ${
                  activeThreadId === thread.id
                    ? "bg-white/[0.02] text-white border-[var(--cykan)] shadow-[0_10px_40px_rgba(0,0,0,0.4)]"
                    : "text-white/10 hover:text-white/40 hover:bg-white/[0.01] border-transparent"
                }`}
              >
                <p className={`truncate uppercase tracking-tighter ${activeThreadId === thread.id ? 'font-black' : 'font-medium'}`}>{thread.name}</p>
                <p className={`truncate font-mono text-[10px] mt-1.5 uppercase tracking-[0.3em] transition-colors ${activeThreadId === thread.id ? 'text-[var(--cykan)]' : 'text-white/10'}`}>
                  {SURFACES.find(s => s.id === thread.surface)?.label}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Toggle Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="p-10 bg-transparent hover:bg-white/[0.03] text-white/10 hover:text-white transition-colors border-t border-white/10"
      >
        <div className="flex items-center justify-center font-mono text-[11px] tracking-[0.3em] uppercase">
          {isExpanded ? "Collapse_HUD" : "HUD"}
        </div>
      </button>
    </aside>
  );
}
