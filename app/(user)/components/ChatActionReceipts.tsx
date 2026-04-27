"use client";

import { useMemo } from "react";
import { useRuntimeStore } from "@/stores/runtime";
import { selectCompletedWrites } from "./chat-tool-stream-reducer";
import { getToolCatalogEntry } from "./tool-catalog";

/**
 * Persistent "action receipts" rendered below the last assistant turn.
 *
 * Once a write op (gmail send, calendar create, …) completes the user must
 * still see a non-volatile confirmation — the `ChatToolStream` only lives
 * during the run. Receipts persist as long as the events stay in the store.
 *
 * Resolution: pin to `lastRunId` (kept across the idle transition) so the
 * receipts don't disappear when `currentRunId` is nulled at run end.
 */
export function ChatActionReceipts() {
  const events = useRuntimeStore((s) => s.events);
  const lastRunId = useRuntimeStore((s) => s.lastRunId);

  const writes = useMemo(() => selectCompletedWrites(events, lastRunId), [events, lastRunId]);

  if (writes.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Actions exécutées">
      {writes.map((entry) => {
        const catalog = getToolCatalogEntry(entry.tool);
        return (
          <span
            key={entry.stepId}
            className="inline-flex items-center gap-1.5 px-2 py-1 t-9 font-mono tracking-[0.15em] uppercase border border-[var(--warn)]/30 text-[var(--warn)] bg-[var(--warn)]/[0.06]"
          >
            <span aria-hidden>{catalog.icon}</span>
            <span>{catalog.completedVerb}</span>
            <span className="text-[var(--text-faint)]">·</span>
            <span className="text-[var(--text-soft)]">{catalog.label}</span>
          </span>
        );
      })}
    </div>
  );
}
