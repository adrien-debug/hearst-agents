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
  { label: "Planner", icon: "◉", path: "/planner" },
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
      className={`${isExpanded ? "w-[260px]" : "w-[68px]"} flex flex-col transition-all duration-300 h-full bg-transparent`}
    >
      {/* Brand Header */}
      <div className="p-6">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 flex items-center justify-center text-[10px] font-bold border border-[var(--cykan)] text-[var(--cykan)] rounded-[4px]">
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
      <nav className="p-3 space-y-1">
        {SURFACES.map((s) => {
          const isActive = pathname === s.path || (s.path !== "/" && pathname?.startsWith(s.path));
          return (
            <button
              key={s.id}
              onClick={() => {
                setSurface(s.id);
                router.push(s.path);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-all duration-150 rounded-[4px] ${
                isActive
                  ? "text-[var(--cykan)]"
                  : "text-[var(--text-soft)] hover:text-[var(--text)]"
              }`}
            >
              <span className="w-6 text-center text-lg">{s.icon}</span>
              {isExpanded && <span className="truncate font-medium tracking-wide">{s.label}</span>}
            </button>
          );
        })}

        {/* Divider */}
        <div className="py-4 px-3">
          <div className="h-px bg-transparent" />
        </div>

        {/* Secondary Links */}
        {SECONDARY_LINKS.map((link) => {
          const isActive = pathname === link.path || pathname?.startsWith(link.path);
          return (
            <button
              key={link.path}
              onClick={() => router.push(link.path)}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-all duration-150 rounded-[4px] ${
                isActive
                  ? "text-[var(--cykan)]"
                  : "text-[var(--text-soft)] hover:text-[var(--text)]"
              }`}
            >
              <span className="w-6 text-center text-lg">{link.icon}</span>
              {isExpanded && <span className="truncate font-medium tracking-wide">{link.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Conversations Section */}
      {isExpanded && (
        <div className="flex-1 flex flex-col min-h-0 mt-4">
          <div className="px-6 py-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">Conversations</p>
              <button
                onClick={() => addThread("Nouveau", surface)}
                className="w-4 h-4 flex items-center justify-center text-[12px] text-[var(--cykan)] hover:text-[var(--text)] transition-colors"
              >
                +
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-6 space-y-1 scrollbar-hide">
            {activeThreads.map((thread) => (
              <button
                key={thread.id}
                onClick={() => setActiveThread(thread.id)}
                className={`w-full text-left px-3 py-2 text-[13px] transition-all duration-150 rounded-[4px] ${
                  activeThreadId === thread.id
                    ? "text-[var(--cykan)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-soft)]"
                }`}
              >
                <p className={`truncate ${activeThreadId === thread.id ? 'font-bold' : 'font-medium'}`}>{thread.name}</p>
                <p className={`truncate text-[10px] mt-0.5 transition-colors ${activeThreadId === thread.id ? 'text-[var(--cykan)]' : 'text-[var(--text-faint)]'}`}>
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
        className="p-4 text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
      >
        <div className="flex items-center justify-center">
          {isExpanded ? "◀" : "▶"}
        </div>
      </button>
    </aside>
  );
}
