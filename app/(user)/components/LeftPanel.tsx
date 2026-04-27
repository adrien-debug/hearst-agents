"use client";

import { useNavigationStore } from "@/stores/navigation";
import { useSession, signOut } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { ServiceWithConnectionStatus } from "@/lib/integrations/types";

interface LeftPanelProps {
  connectedServices?: ServiceWithConnectionStatus[];
  onAddApp?: () => void;
}

const LIBRARY_ITEMS = [
  { id: "missions", path: "/missions", glyph: "M", label: "Missions" },
  { id: "assets", path: "/assets", glyph: "A", label: "Assets" },
  { id: "runs", path: "/runs", glyph: "R", label: "Runs" },
];

export function LeftPanel({ connectedServices = [], onAddApp }: LeftPanelProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const { threads, activeThreadId, setActiveThread, addThread, removeThread } = useNavigationStore();
  const [showAllThreads, setShowAllThreads] = useState(false);

  const firstName = session?.user?.name?.split(" ")[0] || "Utilisateur";
  const recentThreads = threads.slice(0, 3);
  const hasMoreThreads = threads.length > 3;

  const handleLogout = () => {
    signOut({ callbackUrl: "/login" });
  };

  return (
    <aside
      className="w-[72px] flex flex-col h-full relative z-20 border-r border-[var(--surface-2)] transition-all duration-500"
      style={{ background: "linear-gradient(180deg, var(--mat-050) 0%, var(--bg-soft) 100%)" }}
    >
      {/* Logo H — halo signature */}
      <button
        onClick={() => {
          router.push("/");
          setShowAllThreads(false);
        }}
        className="p-4 flex justify-center hover:opacity-80 transition-opacity shrink-0 group"
        title="Hearst — Home"
      >
        <span className="relative inline-flex items-center justify-center w-9 h-9 rounded-sm halo-ring">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/patterns/hcyan.svg"
            alt="Hearst"
            className="w-7 h-7 object-contain"
          />
        </span>
      </button>

      <div className="h-px mx-3 shrink-0 halo-rule" />

      {/* Apps Rail — top-3 connected services + overflow → /apps.
          Showing every connected service was decorative noise that scaled
          poorly past 5 apps. The rail now keeps the visual identity (3
          live logos) but stays actionable: clicking an app or the overflow
          chip both deep-link to /apps for management. */}
      {(() => {
        const RAIL_LIMIT = 3;
        const visibleServices = connectedServices.slice(0, RAIL_LIMIT);
        const overflowCount = Math.max(0, connectedServices.length - RAIL_LIMIT);
        const goToApps = () => router.push("/apps");
        return (
          <div className={`flex flex-col items-center py-4 gap-4 overflow-hidden transition-all duration-500 ${showAllThreads ? 'h-0 opacity-0 py-0' : 'shrink-0'}`}>
            {visibleServices.map((service) => {
              const status = service.connectionStatus;
              const showPip = status === "pending" || status === "error";
              const pipColor =
                status === "error" ? "bg-[var(--danger)]" :
                status === "pending" ? "bg-[var(--warn)]" : "";
              return (
                <button
                  key={service.id}
                  onClick={goToApps}
                  className="w-8 h-8 flex items-center justify-center transition-transform hover:scale-110 group relative shrink-0"
                  title={`${service.name} — gérer dans /apps`}
                  aria-label={`${service.name} — gérer dans /apps`}
                >
                  {service.icon ? (
                    <img
                      src={service.icon}
                      alt={service.name}
                      className="w-7 h-7 object-contain opacity-50 grayscale transition-all duration-300 group-hover:opacity-100 group-hover:grayscale-0"
                    />
                  ) : (
                    <span className="text-lg font-bold text-[var(--text-faint)] group-hover:text-[var(--text)] transition-colors">{service.name.charAt(0).toUpperCase()}</span>
                  )}

                  {showPip && (
                    <span className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ${pipColor} ${status === "error" ? "animate-pulse" : ""}`} />
                  )}

                  <span className="absolute left-full ml-3 px-2 py-1 bg-[var(--bg)] border border-[var(--surface-2)] t-10 font-mono tracking-[0.2em] text-[var(--text-soft)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 uppercase">
                    {service.name}
                  </span>
                </button>
              );
            })}

            {overflowCount > 0 && (
              <button
                onClick={goToApps}
                className="w-8 h-8 flex items-center justify-center t-9 font-mono tracking-[0.05em] text-[var(--text-faint)] hover:text-[var(--cykan)] transition-colors shrink-0 group relative"
                title={`Voir ${overflowCount} autre${overflowCount > 1 ? "s" : ""} service${overflowCount > 1 ? "s" : ""} connecté${overflowCount > 1 ? "s" : ""}`}
                aria-label={`Voir ${overflowCount} autres services connectés`}
              >
                +{overflowCount}
                <span className="absolute left-full ml-3 px-2 py-1 bg-[var(--bg)] border border-[var(--surface-2)] t-10 font-mono tracking-[0.2em] text-[var(--text-soft)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 uppercase">
                  +{overflowCount} more
                </span>
              </button>
            )}

            {/* Add App */}
            <button
              onClick={onAddApp ?? goToApps}
              className="w-8 h-8 flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--cykan)] transition-colors shrink-0"
              title="Connect new app"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>
        );
      })()}

      <div className="h-px bg-[var(--surface-2)] mx-3 shrink-0" />

      {/* Library — Missions / Assets / Runs entry points */}
      <div className="flex flex-col items-center py-3 gap-3 shrink-0">
        {LIBRARY_ITEMS.map((item) => {
          const isActive = pathname === item.path || pathname?.startsWith(`${item.path}/`);
          return (
            <button
              key={item.id}
              onClick={() => router.push(item.path)}
              className={`w-8 h-8 flex items-center justify-center t-13 font-mono tracking-tight font-bold transition-all shrink-0 group relative ${
                isActive
                  ? "text-[var(--cykan)] halo-cyan-sm"
                  : "text-[var(--text-faint)] hover:text-[var(--text)]"
              }`}
              title={item.label}
            >
              {item.glyph}
              <span className="absolute left-full ml-3 px-2 py-1 bg-[var(--bg)] border border-[var(--surface-2)] t-10 font-mono tracking-[0.2em] text-[var(--text-soft)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 uppercase">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      <div className="h-px bg-[var(--surface-2)] mx-3 shrink-0" />

      {/* Sessions */}
      <div className={`flex flex-col items-center py-3 gap-3 overflow-y-auto scrollbar-hide transition-all duration-500 ${showAllThreads ? 'flex-1' : ''}`}>
        {(showAllThreads ? threads : recentThreads).map((thread) => (
          <div key={thread.id} className="relative group/item flex items-center">
            <button
              onClick={() => setActiveThread(thread.id)}
              className={`w-8 h-8 flex items-center justify-center t-13 font-bold transition-all shrink-0 ${
                activeThreadId === thread.id
                  ? "text-[var(--cykan)] halo-cyan-sm"
                  : "text-[var(--text-faint)] hover:text-[var(--text)]"
              }`}
              title={thread.name}
            >
              {thread.name.charAt(0).toUpperCase()}
            </button>

            {/* Delete button - appears on hover */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeThread(thread.id);
              }}
              className="absolute -right-6 w-5 h-5 flex items-center justify-center text-[var(--text-ghost)] hover:text-[var(--danger)] opacity-0 group-hover/item:opacity-100 transition-all"
              title="Delete conversation"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}

        {/* Voir tout */}
        {hasMoreThreads && (
          <button
            onClick={() => setShowAllThreads(!showAllThreads)}
            className="w-8 h-8 flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--text)] transition-colors shrink-0"
            title={showAllThreads ? "Show less" : "View all"}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`transition-transform duration-300 ${showAllThreads ? 'rotate-180' : ''}`}
            >
              {showAllThreads ? (
                <path d="M18 15l-6-6-6 6" />
              ) : (
                <path d="M6 9l6 6 6-6" />
              )}
            </svg>
          </button>
        )}

        {/* New Session */}
        <button
          onClick={() => addThread("New", "home")}
          className="w-8 h-8 flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--cykan)] transition-colors shrink-0"
          title="New session"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      <div className="h-px bg-[var(--surface-2)] mx-3 shrink-0" />

      {/* Logout */}
      <div className="p-3 flex flex-col items-center shrink-0">
        <button
          onClick={handleLogout}
          className="w-8 h-8 flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--danger)] transition-colors"
          title={`Logout ${firstName}`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
