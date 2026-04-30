"use client";

import { useEffect, useRef, useState } from "react";
import type { BrowserAction, BrowserActionType } from "@/lib/events/types";

interface ActionLogProps {
  actions: BrowserAction[];
  isControlled: boolean;
  isRunning: boolean;
  onTakeOver?: () => void;
  onActionClick?: (action: BrowserAction) => void;
}

const TYPE_GLYPH: Record<BrowserActionType, string> = {
  navigate: "→",
  click: "·",
  type: "T",
  scroll: "↕",
  extract: "{ }",
  screenshot: "▢",
  observe: "◎",
  wait: "…",
};

const TYPE_LABEL: Record<BrowserActionType, string> = {
  navigate: "NAVIGATE",
  click: "CLICK",
  type: "TYPE",
  scroll: "SCROLL",
  extract: "EXTRACT",
  screenshot: "SHOT",
  observe: "OBSERVE",
  wait: "WAIT",
};

function formatDuration(ms?: number): string {
  if (ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ActionLog({
  actions,
  isControlled,
  isRunning,
  onTakeOver,
  onActionClick,
}: ActionLogProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (!autoScroll || !containerRef.current) return;
    const el = containerRef.current;
    el.scrollTop = el.scrollHeight;
  }, [actions.length, autoScroll]);

  const onScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAutoScroll(dist < 24);
  };

  return (
    <aside
      className="flex flex-col h-full border-l border-[var(--border-default)]"
      style={{ background: "var(--bg-soft)" }}
    >
      <header
        className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-default)] flex-shrink-0"
        style={{ height: "var(--height-pulsebar)" }}
      >
        <div className="flex items-center gap-2">
          <span
            className="rounded-pill"
            style={{
              width: "var(--space-2)",
              height: "var(--space-2)",
              background: isRunning
                ? "var(--cykan)"
                : isControlled
                  ? "var(--warn)"
                  : "var(--text-ghost)",
            }}
          />
          <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
            ACTION_LOG
          </span>
        </div>
        {isRunning && onTakeOver && (
          <button
            type="button"
            onClick={onTakeOver}
            className="t-9 font-mono uppercase tracking-marquee text-[var(--cykan)] hover:text-[var(--text)] transition-colors px-2 py-1 border border-[var(--cykan-border)] rounded-pill"
          >
            Take Over
          </button>
        )}
      </header>

      {isControlled && (
        <div
          className="px-4 py-3 border-b border-[var(--border-default)] flex items-center gap-2 flex-shrink-0"
          style={{ background: "var(--cykan-surface)" }}
        >
          <span className="t-13 text-[var(--cykan)]">◉</span>
          <span className="t-13 text-[var(--text)]">
            Tu pilotes maintenant
          </span>
        </div>
      )}

      <div
        ref={containerRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3"
      >
        {actions.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p
              className="t-11 font-mono uppercase tracking-marquee text-[var(--text-faint)] text-center"
              style={{ lineHeight: "var(--leading-base)" }}
            >
              {isRunning
                ? "L'agent démarre…"
                : "L'agent attend une tâche"}
            </p>
          </div>
        ) : (
          actions.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onActionClick?.(a)}
              className="text-left flex flex-col gap-2 p-3 rounded-md border border-[var(--border-soft)] hover:border-[var(--border-default)] transition-colors"
              style={{ background: "var(--surface-1)" }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="t-11 font-mono text-[var(--cykan)] flex-shrink-0"
                    aria-hidden
                  >
                    {TYPE_GLYPH[a.type]}
                  </span>
                  <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-muted)] flex-shrink-0">
                    {TYPE_LABEL[a.type]}
                  </span>
                  <span className="t-11 text-[var(--text)] truncate">
                    {a.target}
                  </span>
                </div>
                <span className="t-9 font-mono text-[var(--text-faint)] flex-shrink-0">
                  {formatDuration(a.durationMs)}
                </span>
              </div>
              {a.value && (
                <p className="t-11 font-mono text-[var(--text-muted)] line-clamp-2">
                  {a.value}
                </p>
              )}
              {a.screenshotUrl && (
                <div
                  className="rounded-md overflow-hidden border border-[var(--border-soft)]"
                  style={{ height: "var(--space-20)" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.screenshotUrl}
                    alt={`Screenshot ${a.type}`}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
