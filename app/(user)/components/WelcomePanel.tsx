"use client";

import { useSession } from "next-auth/react";
import { useNavigationStore } from "@/stores/navigation";
import { useRightPanelData } from "./right-panel/useRightPanelData";
import { useRouter } from "next/navigation";

export function WelcomePanel() {
  const { data: session } = useSession();
  const router = useRouter();
  const { assets, missions } = useRightPanelData();
  const userName = session?.user?.name?.split(" ")[0] ?? "Adrien";

  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const timeStr = `${hours}:${minutes}`;

  // Top 3 unique customers from missions (based on name)
  const customerSet = new Set<string>();
  const topCustomers: string[] = [];
  for (const m of missions) {
    if (customerSet.size >= 3) break;
    const name = m.name || "Unknown";
    if (!customerSet.has(name)) {
      customerSet.add(name);
      topCustomers.push(name);
    }
  }

  // Top 2 active missions
  const topMissions = missions
    .filter((m) => m.opsStatus === "running" || m.enabled)
    .slice(0, 2);

  const quickActions = [
    { label: "New brief", icon: "+" },
    { label: "Run query", icon: "⚡" },
    { label: "View assets", icon: "📋" },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-start px-12 py-16 max-w-3xl mx-auto w-full">
      {/* Greeting */}
      <div className="w-full mb-12">
        <p className="t-11 font-mono uppercase tracking-marquee text-[var(--text-faint)] mb-2">
          Welcome back,
        </p>
        <div className="flex items-baseline justify-between">
          <h1 className="t-48 font-bold tracking-tight text-[var(--text)]">
            {userName}
          </h1>
          <span className="t-9 font-mono text-[var(--text-faint)]">
            {timeStr}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="w-full h-px bg-[var(--border-default)] mb-8" />

      {/* Section 1 — Last Customers */}
      {topCustomers.length > 0 && (
        <div className="w-full mb-10">
          <p className="rail-section-label mb-3">Recent customers</p>
          <div className="grid grid-cols-3 gap-3">
            {topCustomers.map((customer) => (
              <button
                key={customer}
                onClick={() => {
                  // TODO: navigate to customer thread
                }}
                className="group h-20 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-md p-3 flex flex-col items-start justify-between cursor-pointer transition-all duration-base hover:border-[var(--cykan)] hover:bg-[var(--surface-2)]"
                style={{
                  boxShadow: "var(--shadow-tile-inset), var(--shadow-tile-base)",
                }}
              >
                <span className="t-11 font-medium text-[var(--text-soft)] group-hover:text-[var(--cykan)] transition-colors truncate w-full">
                  {customer}
                </span>
                <span className="t-9 font-mono uppercase tracking-display text-[var(--text-faint)] group-hover:text-[var(--text-ghost)] text-right w-full">
                  → Ouvrir
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Section 2 — Quick Actions */}
      <div className="w-full mb-10">
        <p className="rail-section-label mb-3">Quick actions</p>
        <div className="flex flex-col gap-px border border-[var(--border-shell)] rounded-md overflow-hidden bg-[var(--surface-1)]">
          {quickActions.map((action, idx) => (
            <button
              key={action.label}
              onClick={() => {
                if (action.label === "View assets") router.push("/assets");
              }}
              className="halo-action-row"
            >
              <span className="t-13 text-[var(--text-soft)] group-hover:text-[var(--cykan)] flex-1 text-left">
                {action.icon} {action.label}
              </span>
              <span className="t-9 font-mono uppercase tracking-display text-[var(--text-faint)]">
                {idx === 0 ? "⌘B" : idx === 1 ? "⌘Q" : "⌘A"}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Section 3 — Latest Missions */}
      {topMissions.length > 0 && (
        <div className="w-full">
          <p className="rail-section-label mb-3">Latest missions</p>
          <div className="flex flex-col gap-2">
            {topMissions.map((m) => (
              <div
                key={m.id}
                className="rail-section-item cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <span className="t-11 text-[var(--text-soft)] group-hover:text-[var(--cykan)] transition-colors truncate flex-1">
                    {m.name}
                  </span>
                  <span
                    className="t-9 font-mono uppercase tracking-display ml-2"
                    style={{
                      color:
                        m.opsStatus === "running"
                          ? "var(--cykan)"
                          : "var(--text-faint)",
                    }}
                  >
                    {m.opsStatus === "running" ? "running" : "paused"}
                  </span>
                </div>
                <p className="t-9 font-mono uppercase tracking-display text-[var(--text-faint)] group-hover:text-[var(--text-ghost)] mt-1">
                  {m.lastRunAt
                    ? `${Math.floor((Date.now() - m.lastRunAt) / 60000)}m`
                    : "—"}{" "}
                  ago
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hint */}
      <div className="w-full mt-12 pt-8 border-t border-[var(--border-default)]">
        <p className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)] text-center">
          ⌘1 pour le Cockpit · ⌘K pour le Commandeur
        </p>
      </div>
    </div>
  );
}
