"use client";

/**
 * AppNav — Rail gauche minimaliste
 *
 * 72px fixed, icônes uniquement, z-index nav (30)
 */

import { useNavigationStore, type Surface } from "@/stores/navigation";
import { useRuntimeStore } from "@/stores/runtime";

const SURFACES: { id: Surface; icon: string; label: string }[] = [
  { id: "home", icon: "◈", label: "Accueil" },
  { id: "inbox", icon: "✉", label: "Messages" },
  { id: "calendar", icon: "◴", label: "Agenda" },
  { id: "files", icon: "◫", label: "Fichiers" },
  { id: "tasks", icon: "☐", label: "Tâches" },
  { id: "apps", icon: "◯", label: "Apps" },
];

export default function AppNav() {
  const surface = useNavigationStore((s) => s.surface);
  const setSurface = useNavigationStore((s) => s.setSurface);
  const isRunning = useRuntimeStore(selectIsRunning);

  return (
    <nav className="fixed left-0 top-0 bottom-0 w-[72px] z-[30] bg-rail border-r border-white/[0.06] flex flex-col">
      {/* Logo */}
      <div className="h-[48px] flex items-center justify-center border-b border-white/[0.06]">
        <span className="text-cyan-accent text-xl font-light">H</span>
      </div>

      {/* Nav items */}
      <div className="flex-1 flex flex-col items-center py-4 gap-1">
        {SURFACES.map((s) => (
          <button
            key={s.id}
            onClick={() => setSurface(s.id)}
            className={`
              w-12 h-12 rounded-lg flex items-center justify-center
              transition-all duration-150
              ${surface === s.id
                ? "bg-white/10 text-white"
                : "text-white/40 hover:text-white/70 hover:bg-white/[0.03]"
              }
            `}
            title={s.label}
          >
            <span className="text-lg">{s.icon}</span>
          </button>
        ))}
      </div>

      {/* Bottom — status */}
      <div className="h-[48px] flex items-center justify-center border-t border-white/[0.06]">
        <div className={`w-2 h-2 rounded-full ${isRunning ? "bg-cyan-accent animate-pulse" : "bg-white/20"}`} />
      </div>
    </nav>
  );
}

function selectIsRunning(state: { coreState: string }) {
  return state.coreState !== "idle";
}
