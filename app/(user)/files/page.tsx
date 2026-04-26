"use client";

import { useState } from "react";

export default function FilesPage() {
  const [view, setView] = useState<"list" | "grid">("list");

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ background: "var(--bg)" }}>
      <div className="border-b border-[var(--line)] p-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="ghost-meta-label mb-2">VIEW_STUB</p>
            <h1 className="ghost-title-impact text-lg">Fichiers</h1>
            <p className="text-[11px] font-light text-[var(--text-muted)] mt-2 max-w-lg">
              Recherche unifiée Drive, Notion, autres sources.
            </p>
          </div>
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-faint)] border-b border-[var(--line-strong)] pb-1">
            ROADMAP
          </span>
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
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center gap-4">
        <p className="ghost-meta-label">NO_DATA</p>
        <h2 className="ghost-title-impact text-sm">FILES_UNIFIED</h2>
        <p className="text-[12px] font-light text-[var(--text-muted)] max-w-md">
          Prévisualisation multi-sources — phase build.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-6 text-[10px] font-mono uppercase tracking-[0.12em] text-[var(--text-faint)]">
          <span className="border-b border-[var(--money)] pb-0.5">DRIVE_ON</span>
          <span className="border-b border-[var(--line-strong)] pb-0.5">NOTION_OFF</span>
        </div>
      </div>
    </div>
  );
}
