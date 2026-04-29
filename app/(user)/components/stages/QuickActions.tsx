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
    <div className="flex flex-col gap-3 px-12 py-12">
      <span className="rail-section-label mb-3">Quick actions</span>
      <div className="flex flex-col">
        {ACTIONS.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={() => handleAction(action.label)}
            className="group flex items-center justify-between py-3 px-0 border-b border-[var(--border-shell)] cursor-pointer transition-colors duration-base bg-transparent text-left"
          >
            <span className="t-13 text-[var(--text-soft)] group-hover:text-[var(--cykan)] group-hover:halo-cyan-sm flex-1 transition-colors">
              {action.icon} {action.label}
            </span>
            <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)] group-hover:text-[var(--text-ghost)]">
              {action.hotkey}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
