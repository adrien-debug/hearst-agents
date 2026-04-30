"use client";

import { useMemo } from "react";
import { useRuntimeStore } from "@/stores/runtime";
import { reduceToolEvents } from "./chat-tool-stream-reducer";
import { getToolCatalogEntry } from "./tool-catalog";
import { ProviderChip } from "./ProviderChip";

export function ChatToolStream() {
  const events = useRuntimeStore((s) => s.events);
  const runId = useRuntimeStore((s) => s.currentRunId);
  const coreState = useRuntimeStore((s) => s.coreState);

  const entries = useMemo(() => reduceToolEvents(events, runId), [events, runId]);

  if (coreState === "idle") return null;
  if (entries.length === 0) return null;

  return (
    <ul className="mt-2 space-y-1.5 t-11 font-mono" aria-live="polite">
      {entries.map((entry) => {
        const catalog = getToolCatalogEntry(entry.tool);
        const isDone = entry.status === "completed";
        const isWrite = entry.kind === "write";

        // Read ops use cyan (data flow). Write ops use amber to flag side
        // effects on the user's account — the eye reads "this changed
        // something" instantly.
        const accent = isWrite ? "text-[var(--warn)]" : "text-[var(--cykan)]";
        const dot = isWrite ? "bg-[var(--warn)]" : "bg-[var(--cykan)]";
        const labelTone = isDone ? "text-[var(--text-muted)]" : "text-[var(--text)]";
        const statusTone = isDone ? accent : "text-[var(--text-faint)]";

        return (
          <li
            key={entry.stepId}
            className="flex items-center gap-2 flex-wrap"
            data-kind={entry.kind}
            data-status={entry.status}
          >
            <span className={isWrite ? "opacity-100" : "opacity-80"}>{catalog.icon}</span>
            <span className={`${isWrite ? "font-semibold" : ""} ${labelTone}`}>
              {catalog.label}
            </span>
            {entry.providerId && (
              <ProviderChip
                providerId={entry.providerId}
                label={entry.providerLabel}
                status={
                  isDone ? "success" : "pending"
                }
                latencyMs={entry.latencyMs}
                costUSD={entry.costUSD}
              />
            )}
            <span className="text-[var(--text-ghost)]">{isDone ? "—" : "·"}</span>
            <span className={statusTone}>
              {isDone ? `${catalog.completedVerb}${isWrite ? " ✓" : ""}` : catalog.runningVerb}
            </span>
            {!isDone && (
              <span
                className={`ml-1 inline-block w-1 h-1 rounded-pill ${dot} animate-pulse`}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
