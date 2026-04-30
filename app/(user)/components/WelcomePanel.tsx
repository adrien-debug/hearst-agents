"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRightPanelData } from "./right-panel/useRightPanelData";
import { useRouter } from "next/navigation";

export function WelcomePanel() {
  const { data: session } = useSession();
  const router = useRouter();
  const { missions } = useRightPanelData();
  const [now, setNow] = useState(() => Date.now());
  const userName = session?.user?.name?.split(" ")[0] ?? "Adrien";

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const h = String(new Date(now).getHours()).padStart(2, "0");
  const m = String(new Date(now).getMinutes()).padStart(2, "0");

  const topMissions = missions.filter((m) => m.opsStatus === "running" || m.enabled).slice(0, 2);

  const quickActions = [
    { label: "New brief", hotkey: "⌘B", action: () => {} },
    { label: "Run query", hotkey: "⌘Q", action: () => {} },
    { label: "View assets", hotkey: "⌘A", action: () => router.push("/assets") },
  ];

  return (
    <div className="flex-1 flex flex-col px-12 py-14 max-w-3xl mx-auto w-full gap-12">

      {/* Hero */}
      <div>
        <p className="t-9 font-mono uppercase tracking-marquee mb-3"
          style={{ color: "var(--text-l3)", letterSpacing: "0.22em" }}>
          Welcome back
        </p>
        <div className="flex items-baseline justify-between">
          <h1 style={{ fontSize: "clamp(48px, 5vw, 72px)", fontWeight: 600, lineHeight: 1.0, letterSpacing: "-0.03em", color: "var(--text-l0)" }}>
            {userName}
          </h1>
          <span className="t-15 font-mono" style={{ color: "var(--text-l2)" }}>{h}:{m}</span>
        </div>
        <div className="mt-10" style={{ height: "1px", background: "var(--sep)" }} />
      </div>

      {/* Quick actions */}
      <div>
        <p className="t-9 font-mono uppercase tracking-marquee mb-6"
          style={{ color: "var(--text-l3)", letterSpacing: "0.18em" }}>
          Quick actions
        </p>
        <div className="flex flex-col">
          {quickActions.map((action) => (
            <button key={action.label} onClick={action.action}
              className="group flex items-center justify-between py-4 bg-transparent text-left transition-all duration-300"
              style={{ borderBottom: "1px solid var(--sep)" }}>
              <span className="t-15 font-light group-hover:text-[var(--cykan)] transition-colors"
                style={{ color: "var(--text-l1)" }}>
                {action.label}
              </span>
              <span className="t-9 font-mono" style={{ color: "var(--text-l3)" }}>{action.hotkey}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Active missions */}
      {topMissions.length > 0 && (
        <div>
          <p className="t-9 font-mono uppercase tracking-marquee mb-6"
            style={{ color: "var(--text-l3)", letterSpacing: "0.18em" }}>
            Active missions
          </p>
          <div className="flex flex-col">
            {topMissions.map((m) => (
              <div key={m.id} className="group flex items-center justify-between py-4 cursor-pointer"
                style={{ borderBottom: "1px solid var(--sep)" }}>
                <span className="t-13 font-light group-hover:text-[var(--cykan)] transition-colors"
                  style={{ color: "var(--text-l1)" }}>
                  {m.name}
                </span>
                <span className="t-9 font-mono" style={{ color: m.opsStatus === "running" ? "var(--cykan)" : "var(--text-l3)" }}>
                  {m.opsStatus === "running" ? "running" : "paused"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hint */}
      <div className="mt-auto pt-8" style={{ borderTop: "1px solid var(--sep)" }}>
        <p className="t-9 font-mono uppercase tracking-marquee text-center"
          style={{ color: "var(--text-l3)", letterSpacing: "0.16em" }}>
          ⌘1 cockpit · ⌘K command
        </p>
      </div>
    </div>
  );
}
