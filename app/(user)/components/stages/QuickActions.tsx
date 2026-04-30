"use client";

import { useStageStore } from "@/stores/stage";
import { useNavigationStore } from "@/stores/navigation";
import { useRouter } from "next/navigation";

const ACTIONS = [
  { icon: "+", label: "New brief", hotkey: "⌘B" },
  { icon: "⚡", label: "Run query", hotkey: "⌘Q" },
  { icon: "📋", label: "View assets", hotkey: "⌘A" },
];

export function QuickActions() {
  const router = useRouter();
  const setStageMode = useStageStore((s) => s.setMode);
  const addThread = useNavigationStore((s) => s.addThread);

  const handleAction = (label: string) => {
    if (label === "View assets") router.push("/assets");
    else if (label === "Run query") {
      const threadId = addThread("New", "home");
      setStageMode({ mode: "chat", threadId });
    }
  };

  return (
    <div className="flex flex-col gap-10 px-12 py-24">
      <div
        className="flex flex-col border border-[var(--border-soft)] rounded-2xl overflow-hidden backdrop-blur-xl"
        style={{
          background: "linear-gradient(135deg, var(--surface-1) 0%, transparent 100%)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        {ACTIONS.map((action, i) => (
          <button
            key={action.label}
            type="button"
            onClick={() => handleAction(action.label)}
            className={`group flex items-center justify-between py-7 px-10 cursor-pointer transition-all duration-700 bg-transparent text-left hover:bg-[var(--surface-1)] ${
              i !== ACTIONS.length - 1 ? "border-b border-[var(--line)]" : ""
            }`}
          >
            <div className="flex items-center gap-6">
              <div className="w-10 h-10 flex items-center justify-center rounded-full bg-[var(--surface-1)] border border-[var(--border-soft)] group-hover:border-[var(--cykan)] group-hover:bg-[var(--cykan-bg-hover)] transition-all duration-500">
                <span className="text-[var(--text-ghost)] group-hover:text-[var(--cykan)] transition-colors duration-500 scale-110">
                  {action.icon}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="t-15 font-light text-[var(--text-muted)] group-hover:text-[var(--text)] transition-colors duration-500">
                  {action.label}
                </span>
                <span className="t-9 tracking-snug text-[var(--text-ghost)] opacity-30 group-hover:opacity-60 transition-opacity">
                  {action.label === "New brief" ? "Create a new research project" : action.label === "Run query" ? "Execute a technical command" : "Browse generated reports"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-ghost)] opacity-20 group-hover:opacity-100 group-hover:text-[var(--cykan)] transition-all duration-700 bg-[var(--surface-1)] px-2 py-1 rounded-md border border-[var(--border-soft)]">
                {action.hotkey}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
