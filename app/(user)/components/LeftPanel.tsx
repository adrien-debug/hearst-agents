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
  const { threads, activeThreadId, setActiveThread, addThread } = useNavigationStore();
  const [showAllThreads, setShowAllThreads] = useState(false);

  const firstName = session?.user?.name?.split(" ")[0] || "Utilisateur";
  const recentThreads = threads.slice(0, 3);
  const hasMoreThreads = threads.length > 3;

  const handleLogout = () => {
    signOut({ callbackUrl: "/login" });
  };

  return (
    <aside
      className="w-[72px] flex flex-col h-full relative z-20 border-r border-white/[0.05] shadow-[20px_0_60px_rgba(0,0,0,0.4)] transition-all duration-500"
      style={{ background: "linear-gradient(180deg, #050505 0%, #080808 100%)" }}
    >
      {/* Logo */}
      <button 
        onClick={() => {
          router.push("/");
          setShowAllThreads(false);
        }}
        className="p-4 flex justify-center hover:bg-white/[0.03] transition-colors shrink-0"
      >
        <img 
          src="/assets/hearst-ai-logo.png" 
          alt="Hearst AI" 
          className="w-10 h-auto object-contain"
        />
      </button>

      <div className="h-px bg-white/[0.06] mx-3 shrink-0" />

      {/* Apps Rail - disparaît quand on affiche toutes les conversations */}
      <div className={`flex flex-col items-center py-4 gap-3 overflow-hidden transition-all duration-500 ${showAllThreads ? 'h-0 opacity-0 py-0' : 'flex-1 min-h-0'}`}>
        {connectedServices.map((service) => (
          <button
            key={service.id}
            className="w-10 h-10 flex items-center justify-center rounded-lg bg-white/[0.03] border border-white/[0.06] hover:border-[var(--cykan)]/40 hover:bg-white/[0.06] transition-all group relative shrink-0"
            title={service.name}
          >
            {service.icon ? (
              <img 
                src={service.icon} 
                alt={service.name}
                className="w-7 h-7 object-contain"
              />
            ) : (
              <span className="text-lg font-bold text-white/50">{service.name.charAt(0).toUpperCase()}</span>
            )}
            <span className="absolute left-full ml-3 px-2 py-1 bg-black/90 border border-white/10 rounded text-[10px] font-mono tracking-wide text-white/80 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
              {service.name}
            </span>
          </button>
        ))}

        {/* Add App Button */}
        <button
          onClick={onAddApp}
          className="w-10 h-10 flex items-center justify-center rounded-lg border border-dashed border-white/[0.15] text-white/40 hover:text-[var(--cykan)] hover:border-[var(--cykan)]/50 hover:bg-[var(--cykan)]/5 transition-all shrink-0"
          title="Connect new app"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      <div className="h-px bg-white/[0.06] mx-3 shrink-0" />

      {/* Sessions / Threads */}
      <div className={`flex flex-col items-center py-3 gap-2 overflow-y-auto scrollbar-hide transition-all duration-500 ${showAllThreads ? 'flex-1' : ''}`}>
        {/* Affiche 3 récentes ou toutes selon l'état */}
        {(showAllThreads ? threads : recentThreads).map((thread) => (
          <button
            key={thread.id}
            onClick={() => setActiveThread(thread.id)}
            className={`w-10 h-10 flex items-center justify-center rounded-full text-[12px] font-bold transition-all group relative shrink-0 ${
              activeThreadId === thread.id
                ? "bg-[var(--cykan)] text-black shadow-[0_0_12px_var(--cykan)]"
                : "bg-white/[0.05] text-white/60 hover:bg-white/[0.1] hover:text-white"
            }`}
            title={thread.name}
          >
            {thread.name.charAt(0).toUpperCase()}
            <span className="absolute left-full ml-3 px-2 py-1 bg-black/90 border border-white/10 rounded text-[10px] font-mono tracking-wide text-white/80 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 max-w-[150px] truncate">
              {thread.name}
            </span>
          </button>
        ))}
        
        {/* Bouton Voir tout / Réduire */}
        {hasMoreThreads && (
          <button
            onClick={() => setShowAllThreads(!showAllThreads)}
            className="w-10 h-10 flex items-center justify-center rounded-full border border-white/[0.15] text-white/40 hover:text-white hover:border-white/30 hover:bg-white/[0.05] transition-all shrink-0 mt-1"
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
        
        {/* New Session Button */}
        <button
          onClick={() => addThread("New", "home")}
          className="w-10 h-10 flex items-center justify-center rounded-full border border-dashed border-white/[0.2] text-white/30 hover:text-[var(--cykan)] hover:border-[var(--cykan)]/40 transition-all shrink-0"
          title="New session"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      <div className="h-px bg-white/[0.06] mx-3 shrink-0" />

      {/* Logout */}
      <div className="p-3 flex flex-col items-center shrink-0">
        <button
          onClick={handleLogout}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-white/30 hover:text-[var(--danger)] hover:bg-white/[0.05] transition-all"
          title={`Logout ${firstName}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
