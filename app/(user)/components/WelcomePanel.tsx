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

  const nowDate = new Date(now);
  const hours = String(nowDate.getHours()).padStart(2, "0");
  const minutes = String(nowDate.getMinutes()).padStart(2, "0");
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
    { label: "Nouveau brief", icon: "+" },
    { label: "Nouvelle requête", icon: "⚡" },
    { label: "Voir les documents", icon: "📋" },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-start px-12 py-16 max-w-3xl mx-auto w-full">
      {/* Greeting */}
      <div className="w-full mb-12">
        <p className="t-11 font-mono uppercase tracking-marquee text-[var(--text-faint)] mb-2">
          Bon retour,
        </p>
        <div className="flex items-baseline justify-between">
          <h1 className="t-34 font-semibold tracking-[-0.025em] text-[var(--text)]">
            {userName}
          </h1>
          <span className="t-9 font-mono text-[var(--text-faint)]">
            {timeStr}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="w-full h-px bg-[var(--border-default)] mb-8" />

      {/* Section 1 — Last Customers (Halo: pure text, no boxes) */}
      {topCustomers.length > 0 && (
        <div className="w-full mb-10">
          <p className="rail-section-label mb-3">Clients récents</p>
          <div className="flex flex-col gap-3">
            {topCustomers.map((customer) => (
              <button
                key={customer}
                onClick={() => {
                  // TODO: navigate to customer thread
                }}
                className="group text-left cursor-pointer transition-colors duration-base"
              >
                <span className="t-11 font-medium text-[var(--text-soft)] group-hover:text-[var(--cykan)] group-hover:halo-cyan-sm transition-colors">
                  {customer}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Section 2 — Quick Actions (Halo: bare buttons, no box) */}
      <div className="w-full mb-10">
        <p className="rail-section-label mb-3">Actions rapides</p>
        <div className="flex flex-col">
          {quickActions.map((action, idx) => (
            <button
              key={action.label}
              onClick={() => {
                if (action.label === "Voir les documents") router.push("/assets");
              }}
              className="group flex items-center justify-between py-3 px-0 border-b border-[var(--border-shell)] cursor-pointer transition-colors duration-base hover:text-[var(--cykan)]"
            >
              <span className="t-13 text-[var(--text-soft)] group-hover:text-[var(--cykan)] flex-1 text-left transition-colors">
                {action.icon} {action.label}
              </span>
              <span className="t-9 font-mono uppercase tracking-display text-[var(--text-faint)] group-hover:text-[var(--text-ghost)]">
                {idx === 0 ? "⌘B" : idx === 1 ? "⌘Q" : "⌘A"}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Section 3 — Latest Missions */}
      {topMissions.length > 0 && (
        <div className="w-full">
          <p className="rail-section-label mb-3">Dernières missions</p>
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
                    {m.opsStatus === "running" ? "en cours" : "en pause"}
                  </span>
                </div>
                <p className="t-9 font-mono uppercase tracking-display text-[var(--text-faint)] group-hover:text-[var(--text-ghost)] mt-1">
                  {m.lastRunAt
                    ? `il y a ${Math.floor((now - m.lastRunAt) / 60000)}m`
                    : "jamais exécutée"}
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
