"use client";

import { useStageStore } from "@/stores/stage";
import { useNavigationStore } from "@/stores/navigation";
import { useRouter } from "next/navigation";

const ACTIONS = [
  { icon: "+", label: "Nouveau brief", hotkey: "⌘B" },
  { icon: "⚡", label: "Nouvelle requête", hotkey: "⌘Q" },
  { icon: "📋", label: "Voir les documents", hotkey: "⌘A" },
];

export function QuickActions() {
  const router = useRouter();
  const setStageMode = useStageStore((s) => s.setMode);
  const addThread = useNavigationStore((s) => s.addThread);

  const handleAction = (label: string) => {
    if (label === "Voir les documents") router.push("/assets");
    else if (label === "Nouvelle requête") {
      const threadId = addThread("New", "home");
      setStageMode({ mode: "chat", threadId });
    }
  };

  return (
    <div className="flex flex-col gap-10 px-12 py-24">
      <div className="flex flex-col bg-gradient-to-br from-[rgba(255,255,255,0.02)] to-transparent border border-[rgba(255,255,255,0.03)] rounded-[32px] overflow-hidden shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        {ACTIONS.map((action, i) => (
          <button
            key={action.label}
            type="button"
            onClick={() => handleAction(action.label)}
            className={`group flex items-center justify-between py-7 px-10 cursor-pointer transition-all duration-700 bg-transparent text-left hover:bg-[rgba(255,255,255,0.03)] ${
              i !== ACTIONS.length - 1 ? "border-b border-[rgba(255,255,255,0.02)]" : ""
            }`}
          >
            <div className="flex items-center gap-6">
              <div className="w-10 h-10 flex items-center justify-center rounded-full bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.03)] group-hover:border-[var(--cykan)] group-hover:bg-[rgba(45,212,191,0.05)] transition-all duration-500 group-hover:shadow-[0_0_20px_rgba(45,212,191,0.1)]">
                <span className="text-[var(--text-ghost)] group-hover:text-[var(--cykan)] transition-colors duration-500 scale-110">
                  {action.icon}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="t-15 font-light text-[var(--text-muted)] group-hover:text-[var(--text)] transition-colors duration-500">
                  {action.label}
                </span>
                <span className="t-9 tracking-[0.1em] text-[var(--text-ghost)] opacity-30 group-hover:opacity-60 transition-opacity">
                  {action.label === "Nouveau brief" ? "Créer un nouveau projet de recherche" : action.label === "Nouvelle requête" ? "Lancer une requête technique" : "Parcourir les documents générés"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="t-9 font-mono uppercase tracking-[0.3em] text-[var(--text-ghost)] opacity-20 group-hover:opacity-100 group-hover:text-[var(--cykan)] transition-all duration-700 bg-[rgba(255,255,255,0.03)] px-2 py-1 rounded-md border border-[rgba(255,255,255,0.02)]">
                {action.hotkey}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
