"use client";

import { useState } from "react";

export default function InboxPage() {
  const [filter, setFilter] = useState<"all" | "unread" | "important">("all");

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ background: "var(--bg)" }}>
      <div className="border-b border-[var(--line)] p-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="ghost-meta-label mb-2">VIEW_STUB</p>
            <h1 className="ghost-title-impact text-lg">Messages</h1>
            <p className="text-[11px] font-light text-[var(--text-muted)] mt-2">Agrégation Gmail, Slack.</p>
          </div>
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-faint)] border-b border-[var(--line-strong)] pb-1">ROADMAP</span>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          {[
            { id: "all", label: "Tous" },
            { id: "unread", label: "Non lus" },
            { id: "important", label: "Importants" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id as typeof filter)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filter === f.id
                  ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                  : "bg-white/[0.03] text-white/50 border border-white/[0.06] hover:bg-white/[0.05]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Empty State */}
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center gap-4">
        <p className="ghost-meta-label">NO_DATA</p>
        <h2 className="ghost-title-impact text-sm">INBOX_UNIFIED</h2>
        <p className="text-[12px] font-light text-[var(--text-muted)] max-w-md">Flux conversationnel — phase build.</p>
        <div className="flex flex-wrap gap-6 text-[10px] font-mono uppercase tracking-[0.12em] text-[var(--text-faint)]">
          <span className="border-b border-[var(--money)] pb-0.5">GMAIL_ON</span>
          <span className="border-b border-[var(--money)] pb-0.5">SLACK_ON</span>
        </div>
      </div>
    </div>
  );
}
