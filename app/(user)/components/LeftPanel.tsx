"use client";

import { useNavigationStore, type Surface } from "@/stores/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";

// Chat-first navigation: primary surface is Home only
// Secondary routes (missions, assets, apps) accessible via dedicated links
// Legacy routes (/inbox, /calendar, /files) remain accessible but are not exposed in primary nav
const SURFACES: { id: Surface; label: string; icon: string; path: string }[] = [
  { id: "home", label: "Accueil", icon: "◉", path: "/" },
];

const SECONDARY_LINKS: { label: string; icon: string; path: string }[] = [
  { label: "Missions", icon: "◈", path: "/missions" },
  { label: "Assets", icon: "📄", path: "/assets" },
  { label: "Apps", icon: "⚡", path: "/apps" },
];

/**
 * LeftPanel — Thread navigation and primary surface switcher
 *
 * Desktop: Collapsible sidebar (240px expanded / 60px collapsed)
 * Mobile: Hidden (see layout.tsx), navigation moved to mobile drawer if needed
 */

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
      className={`${isExpanded ? "w-[240px]" : "w-[60px]"} border-r border-[var(--line)] flex flex-col transition-all duration-200 h-full`}
      style={{ background: "rgba(255,255,255,0.008)" }}
    >
      {/* Brand Header */}
      <div className="p-3 border-b border-[var(--line)]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 flex items-center justify-center text-sm font-bold bg-[var(--cykan)] text-black">
            H
          </div>
          {isExpanded && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate tracking-tight">Hearst OS</p>
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-[var(--text-muted)] truncate">{firstName}</p>
                <button
                  onClick={handleLogout}
                  className="text-[10px] text-[var(--text-faint)] hover:text-[var(--danger)] transition-colors ml-2"
                  title="Déconnexion"
                >
                  →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Toggle expand/collapse — always visible */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-2 w-full py-1 flex items-center justify-center gap-1 text-[10px] text-[var(--text-faint)] hover:text-[var(--text-muted)] hover:bg-white/[0.02] rounded transition-colors"
          title={isExpanded ? "Réduire" : "Développer"}
        >
          <span>{isExpanded ? "←" : "→"}</span>
          {isExpanded && <span>Réduire</span>}
        </button>

        {!isExpanded && (
          <button
            onClick={handleLogout}
            className="mt-2 w-full text-center text-[10px] text-[var(--text-faint)] hover:text-[var(--danger)] transition-colors"
            title="Déconnexion"
          >
            →
          </button>
        )}
      </div>

      {/* Primary Navigation */}
      <nav className="p-2 space-y-0.5">
        {SURFACES.map((s) => {
          const isActive = pathname === s.path || (s.path !== "/" && pathname?.startsWith(s.path));
          return (
            <button
              key={s.id}
              onClick={() => {
                setSurface(s.id);
                router.push(s.path);
              }}
              className={`w-full flex items-center gap-3 px-2 py-1.5 text-sm transition-colors ${
                isActive
                  ? "bg-[var(--cykan)]/[0.04] text-[var(--cykan)] border-l-2 border-[var(--cykan)]"
                  : "text-[var(--text-soft)] hover:text-[var(--text)] hover:bg-white/[0.02] border-l-2 border-transparent"
              }`}
            >
              <span className="w-5 text-center">{s.icon}</span>
              {isExpanded && <span className="truncate font-medium">{s.label}</span>}
            </button>
          );
        })}

        {/* Divider */}
        <div className="py-1">
          <div className="h-px bg-[var(--line)]" />
        </div>

        {/* Secondary Links */}
        {SECONDARY_LINKS.map((link) => {
          const isActive = pathname === link.path || pathname?.startsWith(link.path);
          return (
            <button
              key={link.path}
              onClick={() => router.push(link.path)}
              className={`w-full flex items-center gap-3 px-2 py-1.5 text-sm transition-colors ${
                isActive
                  ? "bg-[var(--cykan)]/[0.04] text-[var(--cykan)] border-l-2 border-[var(--cykan)]"
                  : "text-[var(--text-soft)] hover:text-[var(--text)] hover:bg-white/[0.02] border-l-2 border-transparent"
              }`}
            >
              <span className="w-5 text-center">{link.icon}</span>
              {isExpanded && <span className="truncate font-medium">{link.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Conversations Section */}
      {isExpanded && (
        <>
          <div className="mt-4 px-3 py-2 border-t border-[var(--line)]">
            <div className="flex items-center justify-between">
              <p className="halo-mono-label">Conversations</p>
              <button
                onClick={() => addThread("Nouveau", surface)}
                className="text-xs text-[var(--cykan)] hover:text-[var(--cykan)]/80 transition-colors"
              >
                +
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
            {activeThreads.map((thread) => (
              <button
                key={thread.id}
                onClick={() => setActiveThread(thread.id)}
                className={`w-full text-left px-2 py-2 text-xs transition-colors ${
                  activeThreadId === thread.id
                    ? "bg-[var(--cykan)]/[0.04] text-[var(--cykan)] border-l-2 border-[var(--cykan)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-soft)] hover:bg-white/[0.02] border-l-2 border-transparent"
                }`}
              >
                <p className="truncate font-medium">{thread.name}</p>
                <p className="truncate text-[10px] text-[var(--text-faint)] mt-0.5">
                  {SURFACES.find(s => s.id === thread.surface)?.label}
                </p>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Toggle Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="p-3 border-t border-[var(--line)] text-[var(--text-muted)] hover:text-[var(--text-soft)] transition-colors"
      >
        {isExpanded ? "◀" : "▶"}
      </button>
    </aside>
  );
}
