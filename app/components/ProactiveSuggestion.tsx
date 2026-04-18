"use client";

import type { Suggestion } from "../lib/suggestions";

interface Props {
  suggestion: Suggestion;
  onAccept: () => void;
  onDismiss: () => void;
}

export default function ProactiveSuggestion({ suggestion, onAccept, onDismiss }: Props) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-zinc-900/60 px-3 py-2">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400 animate-pulse" />
      <span className="text-xs text-zinc-300">{suggestion.label}</span>
      <button
        onClick={onAccept}
        className="ml-auto rounded-md bg-cyan-500 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-cyan-400 active:scale-[0.97]"
      >
        {suggestion.actionLabel}
      </button>
      <button
        onClick={onDismiss}
        className="text-zinc-600 transition-colors hover:text-zinc-400"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3">
          <path strokeLinecap="round" d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </div>
  );
}
