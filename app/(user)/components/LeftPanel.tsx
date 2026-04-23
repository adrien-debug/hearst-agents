"use client";

import { useNavigationStore, type Surface } from "@/stores/navigation";
import { useSession } from "next-auth/react";
import { useState } from "react";

const SURFACES: { id: Surface; label: string; icon: string }[] = [
  { id: "home", label: "Accueil", icon: "◉" },
  { id: "inbox", label: "Messages", icon: "✉" },
  { id: "calendar", label: "Agenda", icon: "◷" },
  { id: "files", label: "Fichiers", icon: "▦" },
  { id: "tasks", label: "Missions", icon: "◈" },
  { id: "apps", label: "Apps", icon: "◇" },
];

export function LeftPanel() {
  const { data: session } = useSession();
  const { surface, setSurface, threads, activeThreadId, setActiveThread, addThread } = useNavigationStore();
  const [isExpanded, setIsExpanded] = useState(true);

  const firstName = session?.user?.name?.split(" ")[0] || "Utilisateur";
  const activeThreads = threads.filter(t => t.lastActivity > Date.now() - 7 * 24 * 60 * 60 * 1000);

  return (
    <aside className={`${isExpanded ? "w-[240px]" : "w-[60px]"} bg-[#111] border-r border-white/[0.06] flex flex-col transition-all duration-200`}>
      <div className="p-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-sm font-bold">H</div>
          {isExpanded && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">Hearst OS</p>
              <p className="text-[10px] text-white/40 truncate">Bonjour, {firstName}</p>
            </div>
          )}
        </div>
      </div>

      <nav className="p-2 space-y-0.5">
        {SURFACES.map((s) => (
          <button
            key={s.id}
            onClick={() => setSurface(s.id)}
            className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-md text-sm transition-colors ${
              surface === s.id ? "bg-white/10 text-white" : "text-white/50 hover:text-white hover:bg-white/5"
            }`}
          >
            <span className="w-5 text-center">{s.icon}</span>
            {isExpanded && <span className="truncate">{s.label}</span>}
          </button>
        ))}
      </nav>

      {isExpanded && (
        <>
          <div className="mt-4 px-3 py-2 border-t border-white/[0.06]">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-medium uppercase tracking-wider text-white/40">Conversations</p>
              <button onClick={() => addThread("Nouveau", surface)} className="text-xs text-cyan-400 hover:text-cyan-300">+</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
            {activeThreads.map((thread) => (
              <button
                key={thread.id}
                onClick={() => setActiveThread(thread.id)}
                className={`w-full text-left px-2 py-2 rounded-md text-xs transition-colors ${
                  activeThreadId === thread.id ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60 hover:bg-white/[0.02]"
                }`}
              >
                <p className="truncate font-medium">{thread.name}</p>
                <p className="truncate text-[10px] text-white/20 mt-0.5">{SURFACES.find(s => s.id === thread.surface)?.label}</p>
              </button>
            ))}
          </div>
        </>
      )}

      <button onClick={() => setIsExpanded(!isExpanded)} className="p-3 border-t border-white/[0.06] text-white/30 hover:text-white/60">
        {isExpanded ? "◀" : "▶"}
      </button>
    </aside>
  );
}
