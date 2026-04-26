"use client";

import { useState } from "react";

export default function InboxPage() {
  const [filter, setFilter] = useState<"all" | "unread" | "important">("all");

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-gradient-to-br from-[var(--surface)] via-[var(--bg-soft)] to-[var(--mat-050)]">
      <div className="bg-gradient-to-b from-white/[0.03] to-transparent border-b border-white/[0.06] p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="t-10 font-mono uppercase tracking-[0.15em] text-white/30 mb-2">Inbox</p>
            <h1 className="text-xl font-bold tracking-tight text-white">Messages</h1>
            <p className="text-xs font-normal text-white/50 mt-2">Agrégation Gmail, Slack.</p>
          </div>
          <span className="font-mono t-10 tracking-[0.1em] text-white/30 border-b border-white/10 pb-1">Roadmap</span>
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
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                filter === f.id
                  ? "bg-gradient-to-r from-[var(--cykan)]/20 to-[var(--cykan)]/5 text-[var(--cykan)] border border-[var(--cykan)]/30"
                  : "bg-white/[0.03] text-white/50 border border-white/[0.06] hover:bg-white/[0.06]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Empty State */}
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center gap-4 bg-gradient-to-b from-transparent to-white/[0.01]">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-white/[0.05] to-transparent flex items-center justify-center mb-2">
          <svg className="w-8 h-8 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <p className="t-10 font-mono uppercase tracking-[0.15em] text-white/30">No data</p>
        <h2 className="text-base font-bold tracking-tight text-white/70">Unified Inbox</h2>
        <p className="t-13 font-normal text-white/50 max-w-md">Flux conversationnel — phase build.</p>
        <div className="flex flex-wrap gap-4 t-10 font-mono tracking-[0.1em] text-white/30 mt-2">
          <span className="px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.06]">Gmail</span>
          <span className="px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.06]">Slack</span>
        </div>
      </div>
    </div>
  );
}
