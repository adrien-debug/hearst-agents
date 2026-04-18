"use client";

import type { UnifiedMessage } from "@/lib/connectors/unified-types";

interface InboxSummaryProps {
  messages: UnifiedMessage[];
  onSelectMessage: (msg: UnifiedMessage) => void;
  onFilterUrgent: () => void;
}

export default function InboxSummary({ messages, onSelectMessage, onFilterUrgent }: InboxSummaryProps) {
  const urgent = messages.filter((m) => m.priority === "urgent");
  const unread = messages.filter((m) => !m.read);
  const low = messages.filter((m) => m.priority === "low");

  const topUrgent = urgent.slice(0, 2);

  return (
    <div className="border-b border-zinc-800/40 px-6 py-3">
      {/* Stats bar */}
      <div className="flex items-center gap-3 text-xs">
        {urgent.length > 0 && (
          <button
            onClick={onFilterUrgent}
            className="flex items-center gap-1.5 rounded-md bg-red-950/20 px-2 py-1 text-red-400 transition-colors hover:bg-red-950/30"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            {urgent.length} urgent{urgent.length > 1 ? "s" : ""}
          </button>
        )}
        {unread.length > 0 && (
          <span className="text-zinc-500">{unread.length} non lu{unread.length > 1 ? "s" : ""}</span>
        )}
        {low.length > 0 && (
          <span className="text-zinc-600">{low.length} ignorable{low.length > 1 ? "s" : ""}</span>
        )}
      </div>

      {/* Top urgent — clickable rows */}
      {topUrgent.length > 0 && (
        <div className="mt-2 space-y-px">
          {topUrgent.map((msg) => (
            <button
              key={msg.id}
              onClick={() => onSelectMessage(msg)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-zinc-900/50"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
              <span className="truncate text-xs font-medium text-zinc-200">{msg.from}</span>
              <span className="truncate text-[10px] text-zinc-500">{msg.context ?? msg.subject}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
