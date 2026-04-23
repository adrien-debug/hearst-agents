"use client";

import { useState } from "react";
import { useNavigationStore } from "@/stores/navigation";

export default function FilesPage() {
  const { surface } = useNavigationStore();
  const [view, setView] = useState<"list" | "grid">("list");

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0a0a0a]">
      {/* Header */}
      <div className="border-b border-white/[0.06] p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-medium text-white mb-1">Fichiers</h1>
            <p className="text-sm text-white/40">
              Recherche unifiée dans Drive, Notion, et autres sources
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/30 bg-white/[0.05] px-3 py-1.5 rounded-full">
              Bientôt disponible
            </span>
          </div>
        </div>

        {/* Search & View */}
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Rechercher un fichier..."
              className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-4 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/30"
            />
          </div>
          <div className="flex items-center bg-white/[0.03] border border-white/[0.06] rounded-lg p-1">
            <button
              onClick={() => setView("list")}
              className={`px-3 py-1.5 rounded text-xs transition-colors ${
                view === "list" ? "bg-white/10 text-white" : "text-white/50"
              }`}
            >
              Liste
            </button>
            <button
              onClick={() => setView("grid")}
              className={`px-3 py-1.5 rounded text-xs transition-colors ${
                view === "grid" ? "bg-white/10 text-white" : "text-white/50"
              }`}
            >
              Grille
            </button>
          </div>
        </div>
      </div>

      {/* Empty State */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
          <span className="text-2xl">📁</span>
        </div>
        <h2 className="text-lg font-medium text-white mb-2">
          Recherche de fichiers unifiée
        </h2>
        <p className="text-sm text-white/40 max-w-md mb-6">
          Cette vue permettra de rechercher et prévisualiser vos fichiers depuis Drive, Notion, Dropbox, et autres sources.
        </p>
        <div className="flex items-center gap-3 text-xs text-white/30">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Drive connecté
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
            Notion (non connecté)
          </span>
        </div>
      </div>
n    </div>
  );
}
