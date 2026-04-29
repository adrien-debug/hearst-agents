"use client";

import { useStageStore } from "@/stores/stage";
import { useNavigationStore } from "@/stores/navigation";

const ACTIONS = [
  {
    icon: "➕",
    label: "New brief",
    hotkey: "⌘B",
    action: () => {
      // Trigger new briefing via Cmd+B handler
    },
  },
  {
    icon: "⚡",
    label: "Run query",
    hotkey: "⌘Q",
    action: () => {
      // Focus ChatInput / activate chat
    },
  },
  {
    icon: "📋",
    label: "View assets",
    hotkey: "⌘A",
    action: () => {
      // Navigate to assets
    },
  },
];

export function QuickActions() {
  const setStageMode = useStageStore((s) => s.setMode);
  const addThread = useNavigationStore((s) => s.addThread);

  const handleRunQuery = () => {
    const threadId = addThread("New", "home");
    setStageMode({ mode: "chat", threadId });
  };

  return (
    <div className="flex flex-col gap-8 px-12 py-12">
      <div className="flex flex-col gap-2">
        <span className="t-10 font-mono uppercase tracking-section text-[var(--text-faint)]">
          Quick actions
        </span>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {ACTIONS.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={action.action}
            className="group flex flex-col items-start gap-3 p-6 rounded-sm border border-[var(--border-soft)] bg-transparent hover:border-[var(--cykan-border-hover)] hover:bg-[var(--surface-1)] transition-all"
          >
            <span className="t-24 opacity-60 group-hover:opacity-100 transition-opacity">
              {action.icon}
            </span>
            <div className="flex flex-col gap-1">
              <p className="t-13 font-medium text-[var(--text-soft)] group-hover:text-[var(--cykan)] transition-colors">
                {action.label}
              </p>
              <p className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
                {action.hotkey}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
