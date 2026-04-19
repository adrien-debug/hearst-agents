"use client";

import { useState, useEffect, useCallback } from "react";
import { useRunStreamOptional, type StreamEvent } from "@/app/lib/run-stream-context";

interface ToolItem {
  id: string;
  label: string;
}

const DEFAULT_TOOLS: ToolItem[] = [
  { id: "search", label: "Search" },
  { id: "report", label: "Report" },
  { id: "analyze", label: "Analyze" },
];

const MAX_TOOLS = 5;

const TOOL_ICONS: Record<string, string> = {
  search: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z",
  report: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
  analyze: "M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5",
  export: "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3",
  send: "M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5",
};

function ToolButton({
  tool,
  active,
  onClick,
}: {
  tool: ToolItem;
  active: boolean;
  onClick: () => void;
}) {
  const iconPath = TOOL_ICONS[tool.id];

  return (
    <button
      onClick={onClick}
      disabled={active}
      className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all duration-150 ${
        active
          ? "bg-cyan-500/10 text-cyan-400"
          : "text-zinc-500 hover:bg-zinc-800/40 hover:text-zinc-300"
      }`}
    >
      {iconPath && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-3 w-3">
          <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
        </svg>
      )}
      {active ? "Running…" : tool.label}
    </button>
  );
}

export function ToolSurface({ onToolClick }: { onToolClick?: (id: string) => void }) {
  const stream = useRunStreamOptional();
  const [tools, setTools] = useState<ToolItem[]>(DEFAULT_TOOLS);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!stream) return;

    return stream.subscribe((event: StreamEvent) => {
      if (event.type === "tool_surface") {
        const incoming = event.tools as Array<{ id: string; label: string }> | undefined;
        if (incoming && incoming.length > 0) {
          setTools(incoming.map((t) => ({ id: t.id, label: t.label })));
        }
      }
      if (event.type === "run_completed" || event.type === "run_failed") {
        setActiveId(null);
      }
    });
  }, [stream]);

  const handleClick = useCallback(
    (id: string) => {
      setActiveId(id);
      onToolClick?.(id);
    },
    [onToolClick],
  );

  const visible = tools.slice(0, MAX_TOOLS);

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto px-3 py-1.5 scrollbar-none">
      {visible.map((tool) => (
        <ToolButton
          key={tool.id}
          tool={tool}
          active={activeId === tool.id}
          onClick={() => handleClick(tool.id)}
        />
      ))}
    </div>
  );
}
