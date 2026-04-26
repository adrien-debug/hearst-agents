"use client";

import { useNavigationStore } from "@/stores/navigation";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ServiceWithConnectionStatus } from "@/lib/integrations/types";

interface LeftPanelProps {
  connectedServices?: ServiceWithConnectionStatus[];
  onAddApp?: () => void;
}

export function LeftPanel({ connectedServices = [], onAddApp }: LeftPanelProps) {
  const { data: session } = useSession();
  const router = useRouter();
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
      className="w-[72px] flex flex-col h-full relative z-20 border-r border-white/[0.05] transition-all duration-500"
      style={{ background: "linear-gradient(180deg, var(--mat-050) 0%, var(--bg-soft) 100%)" }}
    >
      {/* Logo H cyan */}
      <button 
        onClick={() => {
          router.push("/");
          setShowAllThreads(false);
        }}
        className="p-4 flex justify-center hover:opacity-80 transition-opacity shrink-0"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img 
          src="/patterns/hcyan.svg" 
          alt="Hearst" 
          className="w-8 h-8 object-contain"
        />
      </button>

      <div className="h-px bg-white/[0.06] mx-3 shrink-0" />

      {/* Apps Rail */}
      <div className={`flex flex-col items-center py-4 gap-4 overflow-hidden transition-all duration-500 ${showAllThreads ? 'h-0 opacity-0 py-0' : 'flex-1 min-h-0'}`}>
        {connectedServices.map((service) => (
          <button
            key={service.id}
            className="w-8 h-8 flex items-center justify-center hover:scale-110 transition-transform group relative shrink-0"
            title={service.name}
          >
            {service.icon ? (
              <img 
                src={service.icon} 
                alt={service.name}
                className="w-7 h-7 object-contain opacity-70 hover:opacity-100 transition-opacity"
              />
            ) : (
              <span className="text-lg font-bold text-white/50 hover:text-white transition-colors">{service.name.charAt(0).toUpperCase()}</span>
            )}
            <span className="absolute left-full ml-3 px-2 py-1 bg-black border border-white/10 t-10 font-mono tracking-wide text-white/80 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
              {service.name}
            </span>
          </button>
        ))}

        {/* Add App */}
        <button
          onClick={onAddApp}
          className="w-8 h-8 flex items-center justify-center text-white/40 hover:text-[var(--cykan)] transition-colors shrink-0"
          title="Connect new app"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      <div className="h-px bg-white/[0.06] mx-3 shrink-0" />

      {/* Sessions */}
      <div className={`flex flex-col items-center py-3 gap-3 overflow-y-auto scrollbar-hide transition-all duration-500 ${showAllThreads ? 'flex-1' : ''}`}>
        {(showAllThreads ? threads : recentThreads).map((thread) => (
          <div key={thread.id} className="relative group/item flex items-center">
            <button
              onClick={() => setActiveThread(thread.id)}
              className={`w-8 h-8 flex items-center justify-center t-13 font-bold transition-all shrink-0 ${
                activeThreadId === thread.id
                  ? "text-[var(--cykan)]"
                  : "text-white/50 hover:text-white"
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
              className="absolute -right-6 w-5 h-5 flex items-center justify-center text-white/20 hover:text-[var(--danger)] opacity-0 group-hover/item:opacity-100 transition-all"
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
            className="w-8 h-8 flex items-center justify-center text-white/40 hover:text-white transition-colors shrink-0"
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
          className="w-8 h-8 flex items-center justify-center text-white/30 hover:text-[var(--cykan)] transition-colors shrink-0"
          title="New session"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      <div className="h-px bg-white/[0.06] mx-3 shrink-0" />

      {/* Logout */}
      <div className="p-3 flex flex-col items-center shrink-0">
        <button
          onClick={handleLogout}
          className="w-8 h-8 flex items-center justify-center text-white/30 hover:text-[var(--danger)] transition-colors"
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
