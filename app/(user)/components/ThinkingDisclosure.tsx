"use client";

import { useState } from "react";

interface ThinkingDisclosureProps {
  thinking: string;
}

export function ThinkingDisclosure({ thinking }: ThinkingDisclosureProps) {
  const [open, setOpen] = useState(false);
  const lines = thinking.trim().split("\n").length;

  return (
    <details
      open={open}
      className="mb-3 border-l-2 border-[var(--warn)]/40 bg-[var(--surface-1)] rounded-sm"
      style={{ padding: "var(--space-3) var(--space-4)" }}
    >
      <summary
        className="flex items-center cursor-pointer list-none select-none"
        style={{ gap: "var(--space-2)" }}
        onClick={(e) => { e.preventDefault(); setOpen((v) => !v); }}
      >
        <span
          className={`rounded-pill ${open ? "bg-[var(--warn)] animate-pulse" : "bg-[var(--cykan)]"}`}
          style={{ width: "var(--space-2)", height: "var(--space-2)", flexShrink: 0 }}
          aria-hidden
        />
        <span className="t-9 font-mono uppercase tracking-marquee text-[var(--warn)]">
          RAISONNEMENT · {lines} lignes
        </span>
      </summary>
      <pre
        className="t-11 font-mono text-[var(--text-faint)] whitespace-pre-wrap overflow-x-auto"
        style={{ padding: "var(--space-4)", maxHeight: "var(--space-64)", overflow: "auto" }}
      >
        {thinking}
      </pre>
    </details>
  );
}
