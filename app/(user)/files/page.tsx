"use client";

import { useState } from "react";

export default function FilesPage() {
  const [view, setView] = useState<"list" | "grid">("list");

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-gradient-to-br from-[var(--surface)] via-[var(--bg-soft)] to-[var(--mat-050)]">
      <div className="bg-gradient-to-b from-white/[0.03] to-transparent border-b border-white/[0.06] p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="t-10 font-mono uppercase tracking-[0.15em] text-white/30 mb-2">Files</p>
            <h1 className="text-xl font-bold tracking-tight text-white">Fichiers</h1>
            <p className="text-xs font-normal text-white/50 mt-2 max-w-lg">
              Recherche unifiée Drive, Notion, autres sources.
            </p>
          </div>
          <span className="font-mono t-10 tracking-[0.1em] text-white/30 border-b border-white/10 pb-1">
            Roadmap
          </span>
        </div>

        {/* Search & View */}
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Rechercher un fichier..."
              className="w-full bg-gradient-to-r from-white/[0.05] to-white/[0.02] border border-white/[0.08] rounded-lg px-4 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[var(--cykan)]/30 focus:bg-white/[0.08] transition-all"
            />
          </div>
          <div className="flex items-center bg-gradient-to-r from-white/[0.05] to-white/[0.02] border border-white/[0.08] rounded-lg p-1">
            <button
              onClick={() => setView("list")}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                view === "list" ? "bg-white/15 text-white shadow-sm" : "text-white/50 hover:text-white/70 hover:bg-white/[0.05]"
              }`}
            >
              Liste
            </button>
            <button
              onClick={() => setView("grid")}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                view === "grid" ? "bg-white/15 text-white shadow-sm" : "text-white/50 hover:text-white/70 hover:bg-white/[0.05]"
              }`}
            >
              Grille
            </button>
          </div>
        </div>
      </div>

      {/* Empty State */}
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center gap-4 bg-gradient-to-b from-transparent to-white/[0.01]">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-white/[0.05] to-transparent flex items-center justify-center mb-2">
          <svg className="w-8 h-8 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p className="t-10 font-mono uppercase tracking-[0.15em] text-white/30">No data</p>
        <h2 className="text-base font-bold tracking-tight text-white/70">Unified Files</h2>
        <p className="t-13 font-normal text-white/50 max-w-md">
          Prévisualisation multi-sources — phase build.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 t-10 font-mono tracking-[0.1em] text-white/30 mt-2">
          <span className="px-3 py-1 rounded-full bg-white/[0.03] border border-[var(--cykan)]/20 text-[var(--cykan)]/70">Drive</span>
          <span className="px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.06]">Notion</span>
        </div>
      </div>
    </div>
  );
}
